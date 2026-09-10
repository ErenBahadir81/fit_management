import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { zScanResult } from "@fitfloow/core";
import { MOCK_LABELS } from "../src/modules/vision/client";
import { Scan } from "../src/models/nutrition";
import { Settings } from "../src/models/settings";
import { seedFoods } from "../src/modules/nutrition/seed/index";
import { filterDetections, prepareImage, runScan } from "../src/modules/nutrition/scan.service";
import type { AppContext } from "../src/context";
import { asAdmin, asUser, createTestApp, seedBasics, type TestApp } from "./harness";

const VISION_ANALYZE = "http://127.0.0.1:8100/v1/analyze";
/** `FakeHttpClient` has no reset — one registration, swapped per test. */
let visionReply: { status?: number; body: unknown } = { status: 502, body: { error: "down" } };

let t: TestApp;
let uploadDir: string;

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "fitfloow-uploads-"));
  t = await createTestApp({ UPLOAD_DIR: uploadDir });
  t.http.on(VISION_ANALYZE, () => visionReply);
});
afterAll(async () => {
  await t.close();
  await rm(uploadDir, { recursive: true, force: true });
});
beforeEach(async () => {
  await t.reset();
  await seedBasics();
  await seedFoods();
  t.clock.now = new Date("2026-09-10T09:00:00.000Z");
  visionReply = { status: 502, body: { error: "down" } };
  t.http.calls.length = 0;
});

/** A real image, generated so the test never depends on a binary fixture. */
async function makeImage(opts: { width?: number; height?: number; format?: "jpeg" | "png" | "webp"; hue?: number } = {}) {
  const { width = 320, height = 240, format = "jpeg", hue = 12 } = opts;
  const img = sharp({ create: { width, height, channels: 3, background: { r: hue, g: 160, b: 90 } } });
  return format === "png" ? img.png().toBuffer() : format === "webp" ? img.webp().toBuffer() : img.jpeg().toBuffer();
}

/** Multipart body built by hand — `app.inject` takes a raw Buffer plus the boundary header. */
function multipart(bytes: Buffer, opts: { field?: string; filename?: string; mime?: string } = {}) {
  const { field = "image", filename = "meal.jpg", mime = "image/jpeg" } = opts;
  const boundary = `----fitfloow${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, bytes, tail]), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function postScan(headers: Record<string, string>, bytes: Buffer, opts?: Parameters<typeof multipart>[1]) {
  const m = multipart(bytes, opts);
  return t.app.inject({ method: "POST", url: "/api/v1/nutrition/scan", headers: { ...headers, ...m.headers }, payload: m.payload });
}

describe("prepareImage", () => {
  it("downscales to 1024 px on the long edge and re-encodes as JPEG", async () => {
    const out = await prepareImage({ bytes: await makeImage({ width: 2400, height: 1600 }), mimetype: "image/jpeg" });
    expect(out.width).toBe(1024);
    expect(out.height).toBe(683);
    expect(out.bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // JPEG SOI
  });

  it("leaves a small image at its own size", async () => {
    const out = await prepareImage({ bytes: await makeImage({ width: 320, height: 240 }), mimetype: "image/jpeg" });
    expect([out.width, out.height]).toEqual([320, 240]);
  });

  it("accepts png and webp", async () => {
    expect((await prepareImage({ bytes: await makeImage({ format: "png" }), mimetype: "image/png" })).width).toBe(320);
    expect((await prepareImage({ bytes: await makeImage({ format: "webp" }), mimetype: "image/webp" })).width).toBe(320);
  });

  it("rejects a wrong content type, an empty body and unreadable bytes", async () => {
    await expect(prepareImage({ bytes: await makeImage(), mimetype: "application/pdf" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(prepareImage({ bytes: new Uint8Array(0), mimetype: "image/jpeg" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(prepareImage({ bytes: Buffer.from("not an image"), mimetype: "image/jpeg" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a truncated upload with 413", async () => {
    await expect(prepareImage({ bytes: await makeImage(), mimetype: "image/jpeg", truncated: true })).rejects.toMatchObject({ status: 413 });
  });
});

describe("filterDetections", () => {
  const d = (label: string, confidence: number) => ({ label, confidence, bbox: null });

  it("drops low-confidence detections and caps the count", () => {
    const kept = filterDetections([d("pizza", 0.9), d("lahmacun", 0.4), d("simit", 0.05)], { minConfidence: 0.15, maxDetections: 5 });
    expect(kept.map((k) => k.label)).toEqual(["pizza", "lahmacun"]);
  });

  it("always keeps the top-1 even below the floor", () => {
    const kept = filterDetections([d("pizza", 0.05), d("simit", 0.02)], { minConfidence: 0.5, maxDetections: 3 });
    expect(kept.map((k) => k.label)).toEqual(["pizza"]);
  });

  it("sorts by confidence and honours maxDetections", () => {
    const kept = filterDetections([d("a", 0.3), d("b", 0.9), d("c", 0.6)], { minConfidence: 0, maxDetections: 2 });
    expect(kept.map((k) => k.label)).toEqual(["b", "c"]);
  });

  it("returns nothing for no detections", () => {
    expect(filterDetections([], { minConfidence: 0.1, maxDetections: 5 })).toEqual([]);
  });
});

describe("POST /nutrition/scan", () => {
  it("requires auth", async () => {
    const res = await postScan({}, await makeImage());
    expect(res.statusCode).toBe(401);
  });

  it("rejects a non-multipart request", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "POST", url: "/api/v1/nutrition/scan", headers, payload: { image: "x" } });
    expect(res.statusCode).toBe(400);
  });

  it("returns detections mapped to catalogue foods", async () => {
    const { headers } = await asUser(t);
    const res = await postScan(headers, await makeImage());
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mock).toBe(true);
    expect(body.modelVersion).toBe("mock");
    expect(body.scanId).toMatch(/^[a-f0-9]{24}$/);
    expect(body.detections.length).toBeGreaterThan(0);
    for (const det of body.detections) {
      expect(MOCK_LABELS).toContain(det.label);
      expect(det.confidence).toBeGreaterThan(0);
      expect(det.labelTr.length).toBeGreaterThan(1);
      expect(det.food, det.label).not.toBeNull();
      expect(det.suggestedGrams).toBe(det.food.defaultServingG);
    }
    // ordered by confidence, highest first
    const confs = body.detections.map((d: { confidence: number }) => d.confidence);
    expect([...confs].sort((a: number, b: number) => b - a)).toEqual(confs);
    const parsed = zScanResult.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("is deterministic for the same image in mock mode", async () => {
    const { headers } = await asUser(t);
    const bytes = await makeImage();
    const a = (await postScan(headers, bytes)).json();
    const b = (await postScan(headers, bytes)).json();
    expect(b.detections.map((d: { label: string }) => d.label)).toEqual(a.detections.map((d: { label: string }) => d.label));
    expect(a.scanId).not.toBe(b.scanId);
  });

  it("persists the scan and the downscaled image", async () => {
    const { user, headers } = await asUser(t);
    const body = (await postScan(headers, await makeImage({ width: 1600, height: 1200 }))).json();

    const doc = await Scan.findById(body.scanId).lean();
    expect(doc).toBeTruthy();
    expect(String(doc!.userId)).toBe(String(user._id));
    expect(doc!.width).toBe(1024);
    expect(doc!.height).toBe(768);
    expect(doc!.mock).toBe(true);
    expect(doc!.createdAt.toISOString()).toBe("2026-09-10T09:00:00.000Z"); // injected clock, not wall time
    expect(doc!.detections).toHaveLength(body.detections.length);
    expect(doc!.imagePath).toBe(`scans/${user._id}/${body.scanId}.jpg`);

    const stored = await readFile(path.join(uploadDir, doc!.imagePath!));
    expect((await sharp(stored).metadata()).width).toBe(1024);
  });

  it("returns an imageUrl the owner can fetch and others cannot", async () => {
    const { user, headers } = await asUser(t);
    const other = await asUser(t);
    const admin = await asAdmin(t);
    const body = (await postScan(headers, await makeImage())).json();
    expect(body.imageUrl).toBe(`/api/v1/uploads/scans/${user._id}/${body.scanId}.jpg`);

    const mine = await t.app.inject({ method: "GET", url: body.imageUrl, headers });
    expect(mine.statusCode).toBe(200);
    expect(mine.headers["content-type"]).toBe("image/jpeg");
    expect(mine.rawPayload.byteLength).toBeGreaterThan(0);

    expect((await t.app.inject({ method: "GET", url: body.imageUrl, headers: other.headers })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "GET", url: body.imageUrl, headers: admin.headers })).statusCode).toBe(200);
    expect((await t.app.inject({ method: "GET", url: body.imageUrl })).statusCode).toBe(401);
  });

  it("404s an unknown image and refuses path traversal", async () => {
    const { user, headers } = await asUser(t);
    expect(
      (await t.app.inject({ method: "GET", url: `/api/v1/uploads/scans/${user._id}/64b7f0c2a1b2c3d4e5f60718.jpg`, headers })).statusCode
    ).toBe(404);
    expect((await t.app.inject({ method: "GET", url: `/api/v1/uploads/scans/${user._id}/..%2F..%2Fetc%2Fpasswd`, headers })).statusCode).toBe(404);
  });

  it("honours the settings confidence floor and detection cap", async () => {
    await Settings.updateOne({ _id: "global" }, { $set: { "data.vision.maxDetections": 1, "data.vision.minConfidence": 0.5 } });
    const { headers } = await asUser(t);
    const body = (await postScan(headers, await makeImage())).json();
    expect(body.detections).toHaveLength(1);
  });

  it("503s with a search fallback when vision is disabled", async () => {
    await Settings.updateOne({ _id: "global" }, { $set: { "data.vision.enabled": false } });
    const { headers } = await asUser(t);
    const res = await postScan(headers, await makeImage());
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatchObject({ code: "VISION_UNAVAILABLE", details: { fallback: "search" } });
  });

  it("rejects a non-image upload", async () => {
    const { headers } = await asUser(t);
    const res = await postScan(headers, Buffer.from("%PDF-1.4 not an image"), { mime: "application/pdf", filename: "x.pdf" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("logging a scanned detection links the entry to the scan", async () => {
    const { headers } = await asUser(t);
    const scan = (await postScan(headers, await makeImage())).json();
    const top = scan.detections[0];
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/nutrition/entries",
      headers,
      payload: { meal: "lunch", foodId: top.food.id, grams: top.suggestedGrams, source: "scan", scanId: scan.scanId },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().entry).toMatchObject({ source: "scan", scanId: scan.scanId, name: top.food.name });
  });
});

describe("vision service integration (VISION_MOCK=0)", () => {
  // The mock client short-circuits `analyze`, so the upstream contract is exercised through a
  // context with mocking off and the fake HTTP client standing in for apps/vision.
  const liveCtx = (): AppContext => ({ config: { ...t.config, VISION_MOCK: false }, http: t.http, now: () => t.clock.now });

  it("maps an unreachable vision service to 503 VISION_UNAVAILABLE with a search fallback", async () => {
    visionReply = { status: 502, body: { error: "bad gateway" } };
    const { user } = await asUser(t);
    await expect(
      runScan(liveCtx(), String(user._id), { bytes: await makeImage(), mimetype: "image/jpeg" })
    ).rejects.toMatchObject({ status: 503, code: "VISION_UNAVAILABLE", details: { fallback: "search" } });
  });

  it("returns no detections when the open-set gate says the photo is not food", async () => {
    visionReply = {
      body: {
        detections: [{ label: "pizza", confidence: 0.42, bbox: null }],
        modelVersion: "swin-food101-q",
        mock: false,
        latencyMs: 118,
        imageSize: [1024, 768],
        gate: "notFood",
      },
    };
    const { user } = await asUser(t);
    const result = await runScan(liveCtx(), String(user._id), { bytes: await makeImage(), mimetype: "image/jpeg" });
    expect(result.detections).toEqual([]);
    expect(result.mock).toBe(false);
    expect(result.modelVersion).toBe("swin-food101-q");
    expect(await Scan.countDocuments({ userId: user._id })).toBe(1);
  });

  it("maps real model labels onto the catalogue", async () => {
    visionReply = {
      body: {
        detections: [
          { label: "lahmacun", confidence: 0.88, bbox: null },
          { label: "pide", confidence: 0.31, bbox: null },
          { label: "not_a_food_class", confidence: 0.2, bbox: null },
        ],
        modelVersion: "swin-food101-q",
        mock: false,
        latencyMs: 121,
        imageSize: [1024, 768],
        gate: "food",
      },
    };
    const { user } = await asUser(t);
    const result = await runScan(liveCtx(), String(user._id), { bytes: await makeImage(), mimetype: "image/jpeg" });
    expect(result.detections.map((d) => d.label)).toEqual(["lahmacun", "pide", "not_a_food_class"]);
    expect(result.detections[0]).toMatchObject({ labelTr: "Lahmacun", suggestedGrams: 180 });
    expect(result.detections[0].food?.name).toBe("Lahmacun");
    expect(result.detections[1].food?.name).toBe("Kıymalı pide");
    // An unknown class still comes back, just without a food to log.
    expect(result.detections[2]).toMatchObject({ food: null, labelTr: "Not a food class", suggestedGrams: 100 });
    expect(result.latencyMs).toBe(121);
  });
});

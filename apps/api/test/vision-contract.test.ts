/**
 * Node <-> Python contract test for the vision microservice (apps/vision, owner: B5).
 *
 * Runs only against a LIVE service:
 *     pnpm dev:vision                                   # terminal 1 (mock or real model)
 *     VISION_URL=http://127.0.0.1:8100 pnpm --filter @fitfloow/api exec vitest run test/vision-contract.test.ts
 *
 * Without VISION_URL (or when nothing answers on it) every case is skipped with a reason — CI stays
 * hermetic, but the moment the service is up this file proves the two implementations agree.
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { loadConfig } from "../src/config";
import { RealHttpClient } from "../src/lib/http";
import { createVisionClient, mockAnalysis, VisionUnavailableError, type VisionClient } from "../src/modules/vision/client";

const BASE = process.env.VISION_URL?.replace(/\/$/, "");
const IMAGE_WIDTH = 320;
const IMAGE_HEIGHT = 240;

async function probe(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const live = BASE ? await probe(BASE) : false;
const skipReason = !BASE ? "VISION_URL is not set" : !live ? `no vision service answering at ${BASE}/health` : "";
if (skipReason) console.info(`[vision-contract] skipped — ${skipReason}`);

function client(url = BASE!): VisionClient {
  const config = loadConfig({ ...process.env, NODE_ENV: "test", VISION_URL: url, VISION_MOCK: "0" });
  return createVisionClient({ config, http: new RealHttpClient(), now: () => new Date() });
}

/** The service's error envelope: `{ error: { code, message } }` — same shape as the Node API's. */
async function errorOf(res: Response): Promise<{ code: string; message: string }> {
  const body = (await res.json()) as { error?: { code?: string; message?: string } };
  return { code: body.error?.code ?? "", message: body.error?.message ?? "" };
}

async function makePng(color: { r: number; g: number; b: number }): Promise<Uint8Array> {
  const buf = await sharp({ create: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT, channels: 3, background: color } })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

describe.skipIf(!live)(`vision service contract (${BASE ?? "offline"})`, () => {
  it("GET /health answers with the shape the client maps", async () => {
    const health = await client().health();
    expect(health.ok).toBe(true);
    expect(typeof health.mock).toBe("boolean");
    expect(typeof health.modelLoaded).toBe("boolean");
    expect(health.modelVersion).toBeTruthy();
    expect(health.url).toBe(BASE);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    // mock and modelLoaded are mutually exclusive: a mock never has a model loaded.
    expect(health.mock && health.modelLoaded).toBe(false);
  });

  it("POST /v1/analyze returns the VisionAnalysis shape", async () => {
    const png = await makePng({ r: 210, g: 120, b: 60 });
    const analysis = await client().analyze(png, "image/png");

    expect(Array.isArray(analysis.detections)).toBe(true);
    expect(typeof analysis.modelVersion).toBe("string");
    expect(analysis.modelVersion.length).toBeGreaterThan(0);
    expect(typeof analysis.mock).toBe("boolean");
    expect(analysis.latencyMs).toBeGreaterThanOrEqual(0);
    expect(analysis.imageSize).toEqual([IMAGE_WIDTH, IMAGE_HEIGHT]);
    expect(["food", "notFood", "off"]).toContain(analysis.gate);

    if (analysis.gate !== "notFood") expect(analysis.detections.length).toBeGreaterThan(0);
    for (const d of analysis.detections) {
      expect(d.label).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/); // snake_case: the join key with the foods seed
      expect(d.confidence).toBeGreaterThan(0);
      expect(d.confidence).toBeLessThanOrEqual(1);
      expect(d.bbox).toBeNull(); // v1 is single-plate classification, no detector
    }
    const scores = analysis.detections.map((d) => d.confidence);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("is deterministic: the same bytes give the same detections", async () => {
    const png = await makePng({ r: 30, g: 160, b: 90 });
    const c = client();
    const [first, second] = [await c.analyze(png, "image/png"), await c.analyze(png, "image/png")];
    expect(second.detections).toEqual(first.detections);
    expect(second.modelVersion).toBe(first.modelVersion);
  });

  it("mock mode reproduces the Node mockAnalysis byte-for-byte", async () => {
    const c = client();
    const health = await c.health();
    if (!health.mock) return expect(health.modelLoaded).toBe(true); // real model: nothing to compare against
    const png = await makePng({ r: 90, g: 90, b: 200 });
    const analysis = await c.analyze(png, "image/png");
    expect(analysis.detections).toEqual(mockAnalysis(png).detections);
    expect(analysis.modelVersion).toBe("mock");
    expect(analysis.mock).toBe(true);
  });

  it("real model mode returns model labels, not mock labels", async () => {
    const c = client();
    const health = await c.health();
    if (health.mock) return expect(health.modelVersion).toBe("mock"); // mock mode: covered by the case above
    const png = await makePng({ r: 200, g: 170, b: 120 });
    const analysis = await c.analyze(png, "image/png");
    expect(analysis.mock).toBe(false);
    expect(analysis.modelVersion).not.toBe("mock");
    expect(analysis.detections.length).toBeLessThanOrEqual(5);
  });

  it("rejects a non-image content type with 415", async () => {
    const fd = new FormData();
    fd.append("image", new Blob([new Uint8Array([1, 2, 3])], { type: "text/plain" }), "note.txt");
    const res = await fetch(`${BASE}/v1/analyze`, { method: "POST", body: fd });
    expect(res.status).toBe(415);
    expect((await errorOf(res)).code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects a corrupt image with 400", async () => {
    const fd = new FormData();
    fd.append("image", new Blob([new TextEncoder().encode("not a png")], { type: "image/png" }), "scan.png");
    const res = await fetch(`${BASE}/v1/analyze`, { method: "POST", body: fd });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("INVALID_IMAGE");
  });

  it("rejects an oversized upload with 413", async () => {
    const fd = new FormData();
    fd.append("image", new Blob([new Uint8Array(7 * 1024 * 1024)], { type: "image/png" }), "big.png");
    const res = await fetch(`${BASE}/v1/analyze`, { method: "POST", body: fd });
    expect(res.status).toBe(413);
    expect((await errorOf(res)).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects a missing image field with a validation error", async () => {
    const fd = new FormData();
    fd.append("photo", new Blob([new Uint8Array([1])], { type: "image/png" }), "scan.png");
    const res = await fetch(`${BASE}/v1/analyze`, { method: "POST", body: fd });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe("VALIDATION");
  });

  it("surfaces a dead service as VisionUnavailableError, never as a crash", async () => {
    const dead = client("http://127.0.0.1:1");
    await expect(dead.analyze(await makePng({ r: 1, g: 1, b: 1 }), "image/png")).rejects.toBeInstanceOf(VisionUnavailableError);
    expect(await dead.health()).toMatchObject({ ok: false, modelLoaded: false, modelVersion: null });
  });
});

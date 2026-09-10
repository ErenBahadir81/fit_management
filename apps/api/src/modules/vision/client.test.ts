import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { FakeHttpClient } from "../../lib/http";
import { createVisionClient, mockAnalysis, MOCK_LABELS, VisionUnavailableError } from "./client";

const img = new Uint8Array([1, 2, 3, 4, 5]);

describe("vision client", () => {
  it("mock analysis is deterministic and label set is bounded", () => {
    const a = mockAnalysis(img);
    const b = mockAnalysis(img);
    expect(a).toEqual(b);
    expect(a.detections.length).toBe(3);
    for (const d of a.detections) expect(MOCK_LABELS).toContain(d.label);
    expect(a.detections[0].confidence).toBeGreaterThan(a.detections[1].confidence);
  });
  it("uses mock when VISION_MOCK=1", async () => {
    const ctx = { config: loadConfig({ NODE_ENV: "test", VISION_MOCK: "1" }), http: new FakeHttpClient(), now: () => new Date() };
    const c = createVisionClient(ctx);
    expect((await c.analyze(img, "image/jpeg")).mock).toBe(true);
    expect((await c.health()).mock).toBe(true);
  });
  it("calls the service and maps the response", async () => {
    const http = new FakeHttpClient().on("http://vision/v1/analyze", () => ({
      body: { detections: [{ label: "pizza", confidence: 0.8 }], modelVersion: "swin-food101", mock: false, latencyMs: 120, gate: "food" },
    }));
    const c = createVisionClient({ config: loadConfig({ NODE_ENV: "test", VISION_URL: "http://vision", VISION_MOCK: "0" }), http, now: () => new Date() });
    const r = await c.analyze(img, "image/jpeg");
    expect(r.detections[0]).toEqual({ label: "pizza", confidence: 0.8, bbox: null });
    expect(r.modelVersion).toBe("swin-food101");
    expect(http.calls[0].req.method).toBe("POST");
  });
  it("throws VisionUnavailableError when the service is down", async () => {
    const http = new FakeHttpClient().on("http://vision/v1/analyze", () => ({ status: 503, body: {} }));
    const c = createVisionClient({ config: loadConfig({ NODE_ENV: "test", VISION_URL: "http://vision", VISION_MOCK: "0" }), http, now: () => new Date() });
    await expect(c.analyze(img, "image/jpeg")).rejects.toBeInstanceOf(VisionUnavailableError);
    expect((await c.health()).ok).toBe(false);
  });
});

import { createHash } from "node:crypto";
import type { AppContext } from "../../context";

/** Contract with apps/vision (`POST /v1/analyze`, `GET /health`). Keep in sync with apps/vision/app/main.py. */
export interface VisionDetection {
  label: string; // raw model label, snake_case (e.g. "pizza", "lahmacun")
  confidence: number; // 0..1
  bbox: [number, number, number, number] | null;
}

export interface VisionAnalysis {
  detections: VisionDetection[];
  modelVersion: string;
  mock: boolean;
  latencyMs: number;
  imageSize: [number, number] | null;
  gate: "food" | "notFood" | "off";
}

export interface VisionHealth {
  ok: boolean;
  mock: boolean;
  modelLoaded: boolean;
  modelVersion: string | null;
  latencyMs: number | null;
  url: string | null;
}

export interface VisionClient {
  analyze(image: Uint8Array, mime: string): Promise<VisionAnalysis>;
  health(): Promise<VisionHealth>;
}

export class VisionUnavailableError extends Error {
  constructor(message = "Görüntü servisi şu an kullanılamıyor") {
    super(message);
    this.name = "VisionUnavailableError";
  }
}

/** Deterministic labels for mock mode — must all exist as `aliases` in the foods seed (B4). */
export const MOCK_LABELS = ["pizza", "hamburger", "lahmacun", "menemen", "kofte", "pilav", "mercimek_corbasi", "salad", "omelette", "baklava", "sushi", "steak"];

export function mockAnalysis(image: Uint8Array, topK = 3): VisionAnalysis {
  const h = createHash("sha256").update(image).digest();
  const picks = new Set<string>();
  const detections: VisionDetection[] = [];
  for (let i = 0; i < 32 && picks.size < topK; i++) {
    const label = MOCK_LABELS[h[i] % MOCK_LABELS.length];
    if (picks.has(label)) continue;
    picks.add(label);
    detections.push({ label, confidence: Math.round((0.9 - 0.22 * (picks.size - 1)) * 1000) / 1000, bbox: null });
  }
  return { detections, modelVersion: "mock", mock: true, latencyMs: 0, imageSize: null, gate: "food" };
}

export function createVisionClient(ctx: AppContext): VisionClient {
  const base = ctx.config.VISION_URL.replace(/\/$/, "");
  if (ctx.config.VISION_MOCK) {
    return {
      async analyze(image) {
        return mockAnalysis(image);
      },
      async health() {
        return { ok: true, mock: true, modelLoaded: false, modelVersion: "mock", latencyMs: 0, url: null };
      },
    };
  }
  return {
    async analyze(image, mime) {
      const fd = new FormData();
      fd.append("image", new Blob([image], { type: mime }), "scan.jpg");
      let res;
      try {
        res = await ctx.http.request(`${base}/v1/analyze`, { method: "POST", body: fd, timeoutMs: 20_000 });
      } catch {
        throw new VisionUnavailableError();
      }
      if (!res.ok) throw new VisionUnavailableError();
      const body = await res.json<Partial<VisionAnalysis>>();
      return {
        detections: (body.detections ?? []).map((d) => ({ label: String(d.label), confidence: Number(d.confidence), bbox: d.bbox ?? null })),
        modelVersion: body.modelVersion ?? "unknown",
        mock: Boolean(body.mock),
        latencyMs: Number(body.latencyMs ?? 0),
        imageSize: body.imageSize ?? null,
        gate: body.gate ?? "off",
      };
    },
    async health() {
      const started = Date.now();
      try {
        const res = await ctx.http.request(`${base}/health`, { timeoutMs: 3000 });
        if (!res.ok) return { ok: false, mock: false, modelLoaded: false, modelVersion: null, latencyMs: null, url: base };
        const body = await res.json<{ ok?: boolean; mock?: boolean; modelLoaded?: boolean; modelVersion?: string }>();
        return {
          ok: Boolean(body.ok),
          mock: Boolean(body.mock),
          modelLoaded: Boolean(body.modelLoaded),
          modelVersion: body.modelVersion ?? null,
          latencyMs: Date.now() - started,
          url: base,
        };
      } catch {
        return { ok: false, mock: false, modelLoaded: false, modelVersion: null, latencyMs: null, url: base };
      }
    },
  };
}

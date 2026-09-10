import { Types } from "mongoose";
import sharp from "sharp";
import { labelToTitle, labelTr, searchKey, type Detection, type ScanResultDTO } from "@fitfloow/core";
import { Food, Scan, toFoodDTO, type FoodDoc, type ScanDoc } from "../../models/nutrition";
import { getSettings } from "../../models/settings";
import { AppError } from "../../lib/errors";
import type { AppContext } from "../../context";
import { createVisionClient, VisionUnavailableError, type VisionDetection } from "../vision/client";
import { scanImageUrl, writeScanImage } from "./uploads";

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_IMAGE_DIM = 1024;
export const ACCEPTED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const;

export interface ScanImageInput {
  bytes: Uint8Array;
  mimetype: string;
  truncated?: boolean;
}

export interface PreparedImage {
  bytes: Buffer;
  width: number;
  height: number;
}

/** Validate, then downscale to ≤ 1024 px and re-encode as JPEG. Bytes stay in memory. */
export async function prepareImage(input: ScanImageInput): Promise<PreparedImage> {
  if (input.truncated) throw new AppError(413, "VALIDATION", "Görsel çok büyük (en fazla 6 MB)");
  if (!input.bytes || input.bytes.byteLength === 0) throw AppError.validation("Görsel boş");
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) throw new AppError(413, "VALIDATION", "Görsel çok büyük (en fazla 6 MB)");
  const mime = (input.mimetype || "").toLowerCase().split(";")[0].trim();
  if (!ACCEPTED_MIME.includes(mime as (typeof ACCEPTED_MIME)[number]))
    throw AppError.validation("Yalnızca JPEG, PNG veya WebP görseller yüklenebilir");

  try {
    const pipeline = sharp(Buffer.from(input.bytes)).rotate().resize({
      width: MAX_IMAGE_DIM,
      height: MAX_IMAGE_DIM,
      fit: "inside",
      withoutEnlargement: true,
    });
    const { data, info } = await pipeline.jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height };
  } catch {
    throw AppError.validation("Görsel okunamadı");
  }
}

/**
 * Map raw model labels to catalogue foods in one query: labels are stored verbatim in `aliases`
 * (and, for Turkish dishes, are the folded `searchKey`), so this is a dictionary lookup.
 */
export async function resolveFoodsForLabels(labels: string[]): Promise<Map<string, FoodDoc>> {
  const wanted = [...new Set(labels.map((l) => l.toLowerCase().trim()).filter(Boolean))];
  if (wanted.length === 0) return new Map();
  const keys = [...new Set(wanted.map(searchKey).filter(Boolean))];
  const docs = await Food.find({
    ownerUserId: null,
    $or: [{ aliases: { $in: wanted } }, { searchKey: { $in: keys } }],
  }).lean<FoodDoc[]>();

  const byAlias = new Map<string, FoodDoc>();
  const byKey = new Map<string, FoodDoc>();
  for (const doc of docs) {
    for (const alias of doc.aliases ?? []) {
      const a = alias.toLowerCase().trim();
      if (!byAlias.has(a)) byAlias.set(a, doc);
    }
    if (doc.searchKey && !byKey.has(doc.searchKey)) byKey.set(doc.searchKey, doc);
  }
  const out = new Map<string, FoodDoc>();
  for (const label of wanted) {
    const hit = byAlias.get(label) ?? byKey.get(searchKey(label));
    if (hit) out.set(label, hit);
  }
  return out;
}

/**
 * Confidence filter with a floor: everything at or above `minConfidence`, capped at `maxDetections`,
 * but the top-1 is always kept — a picker with one suggestion beats an empty screen.
 */
export function filterDetections(
  detections: VisionDetection[],
  opts: { minConfidence: number; maxDetections: number }
): VisionDetection[] {
  if (detections.length === 0) return [];
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept = sorted.filter((d) => d.confidence >= opts.minConfidence).slice(0, Math.max(1, opts.maxDetections));
  return kept.length > 0 ? kept : [sorted[0]];
}

export interface ScanOutcome extends ScanResultDTO {
  scanDoc: ScanDoc;
}

/** The whole `POST /nutrition/scan` pipeline: downscale → vision → label map → persist → DTO. */
export async function runScan(ctx: AppContext, userId: string, input: ScanImageInput): Promise<ScanResultDTO> {
  const image = await prepareImage(input);
  const settings = await getSettings();
  if (!settings.vision.enabled) throw new AppError(503, "VISION_UNAVAILABLE", "Görüntü tanıma kapalı", { fallback: "search" });

  const vision = createVisionClient(ctx);
  let analysis;
  try {
    analysis = await vision.analyze(image.bytes, "image/jpeg");
  } catch (err) {
    if (err instanceof VisionUnavailableError)
      throw new AppError(503, "VISION_UNAVAILABLE", err.message, { fallback: "search" });
    throw err;
  }

  // The open-set gate said "this is not food" — return an empty, honest result rather than a guess.
  const raw = analysis.gate === "notFood" ? [] : filterDetections(analysis.detections, settings.vision);
  const foods = await resolveFoodsForLabels(raw.map((d) => d.label));

  const scanId = new Types.ObjectId();
  const detections: Detection[] = raw.map((d) => {
    const food = foods.get(d.label.toLowerCase().trim()) ?? null;
    return {
      label: d.label,
      labelTr: labelTr(d.label) ?? food?.name ?? labelToTitle(d.label),
      confidence: Math.round(d.confidence * 1000) / 1000,
      food: food ? toFoodDTO(food) : null,
      suggestedGrams: food?.defaultServingG ?? 100,
    };
  });

  const imagePath = await writeScanImage(ctx.config, userId, String(scanId), image.bytes);
  await Scan.create({
    _id: scanId,
    userId: new Types.ObjectId(userId),
    imagePath,
    width: image.width,
    height: image.height,
    detections: detections.map((d) => ({
      label: d.label,
      labelTr: d.labelTr,
      confidence: d.confidence,
      foodId: d.food ? new Types.ObjectId(d.food.id) : null,
      suggestedGrams: d.suggestedGrams,
    })),
    modelVersion: analysis.modelVersion,
    latencyMs: analysis.latencyMs,
    mock: analysis.mock,
    createdAt: ctx.now(),
  });

  return {
    scanId: String(scanId),
    imageUrl: scanImageUrl(userId, String(scanId)),
    detections,
    mock: analysis.mock,
    latencyMs: analysis.latencyMs,
    modelVersion: analysis.modelVersion,
  };
}

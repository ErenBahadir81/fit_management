import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { AppError } from "../../lib/errors";
import type { AppConfig } from "../../config";

export const SCANS_DIR = "scans";
/** Kept in sync with `API_PREFIX` in app.ts (imported literally to avoid a module cycle). */
const API_PREFIX = "/api/v1";
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const SAFE_FILE = /^[A-Za-z0-9_-]+\.jpg$/;

/** Absolute path of a stored scan image. Both segments are validated so `..` can never escape. */
export function scanImagePath(config: AppConfig, userId: string, fileName: string): string {
  if (!SAFE_SEGMENT.test(userId) || !SAFE_FILE.test(fileName)) throw AppError.notFound("Görsel");
  return path.resolve(config.UPLOAD_DIR, SCANS_DIR, userId, fileName);
}

/** The URL the client gets back; served by `GET /api/v1/uploads/scans/:userId/:file` (auth + owner check). */
export function scanImageUrl(userId: string, scanId: string): string {
  return `${API_PREFIX}/uploads/${SCANS_DIR}/${userId}/${scanId}.jpg`;
}

/** Store the downscaled JPEG. Returns the path stored on the scan document (relative to UPLOAD_DIR). */
export async function writeScanImage(config: AppConfig, userId: string, scanId: string, bytes: Uint8Array): Promise<string> {
  const dir = path.resolve(config.UPLOAD_DIR, SCANS_DIR, userId);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${scanId}.jpg`);
  await writeFile(file, bytes);
  return path.posix.join(SCANS_DIR, userId, `${scanId}.jpg`);
}

export interface ScanImageStream {
  stream: Readable;
  size: number;
}

export async function openScanImage(config: AppConfig, userId: string, fileName: string): Promise<ScanImageStream> {
  const file = scanImagePath(config, userId, fileName);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw AppError.notFound("Görsel");
  return { stream: createReadStream(file), size: info.size };
}

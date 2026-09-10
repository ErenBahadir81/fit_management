/**
 * Body measurements, weigh-ins and trends. Navy body fat is always computed server side so the
 * stored numbers cannot disagree with the client's arithmetic.
 */
import type { Types } from "mongoose";
import {
  bodyComposition,
  bodyFatCategory,
  ewmaAt,
  ewmaTrend,
  latestTrendWeight,
  navyBodyFat,
  shiftKey,
  trDateKey,
  type BodyEntryDTO,
  type BodyEntryInput,
  type BodySummary,
  type BodyTrends,
  type Gender,
  type TrendPoint,
  type WeighInDTO,
} from "@fitfloow/core";
import type { AppContext } from "../../context";
import { AppError } from "../../lib/errors";
import { BodyEntry, WeighIn, toBodyEntryDTO, toWeighInDTO, type BodyEntryDoc } from "../../models/body";
import { User } from "../../models/user";
import { dayIntakeFor, goalSettings, invalidateWeeksFor, loadUser, oid } from "./shared";

const TREND_HISTORY_DAYS = 180;

function measure(gender: Gender, m: { heightCm: number; neckCm: number; waistCm: number; hipCm?: number | null; weightKg: number }) {
  if (gender === "female" && !m.hipCm) throw AppError.validation("Kadınlar için kalça ölçüsü gerekli");
  const bodyFatPct = navyBodyFat({ gender, heightCm: m.heightCm, neckCm: m.neckCm, waistCm: m.waistCm, hipCm: m.hipCm });
  if (bodyFatPct === null) throw AppError.validation("Ölçümler geçersiz — bel ölçüsü boyun ölçüsünden büyük olmalı");
  return { bodyFatPct, ...bodyComposition(m.weightKg, bodyFatPct) };
}

/** A body entry owns the weigh-in of its day (source `bodyEntry`); a manual one is left alone. */
async function syncWeighIn(userId: Types.ObjectId, dateKey: string, weightKg: number): Promise<void> {
  await WeighIn.updateOne({ userId, dateKey }, { $set: { weightKg, source: "bodyEntry" } }, { upsert: true });
}

async function releaseWeighIn(userId: Types.ObjectId, dateKey: string): Promise<void> {
  const remaining = await BodyEntry.findOne({ userId, dateKey }).sort({ date: -1, _id: -1 }).lean<BodyEntryDoc>();
  if (remaining) {
    await WeighIn.updateOne({ userId, dateKey, source: "bodyEntry" }, { $set: { weightKg: remaining.weightKg } });
    return;
  }
  await WeighIn.deleteOne({ userId, dateKey, source: "bodyEntry" });
}

export async function listBodyEntries(userId: string, limit?: number) {
  const user = await loadUser(userId);
  const query = BodyEntry.find({ userId: user._id }).sort({ date: -1, _id: -1 });
  if (limit) query.limit(limit);
  const docs = await query.lean<BodyEntryDoc[]>();
  return {
    entries: docs.reverse().map(toBodyEntryDTO),
    profile: { gender: user.gender, heightCm: user.heightCm ?? null },
  };
}

export async function createBodyEntry(ctx: AppContext, userId: string, input: BodyEntryInput): Promise<BodyEntryDTO> {
  const user = await loadUser(userId);
  const gender: Gender = input.gender ?? user.gender;
  const computed = measure(gender, input);
  const date = input.date ? new Date(input.date) : ctx.now();
  if (Number.isNaN(date.getTime())) throw AppError.validation("Geçersiz tarih");
  const dateKey = trDateKey(date);

  const doc = await BodyEntry.create({
    userId: user._id,
    date,
    dateKey,
    gender,
    heightCm: input.heightCm,
    neckCm: input.neckCm,
    waistCm: input.waistCm,
    hipCm: gender === "female" ? (input.hipCm ?? null) : (input.hipCm ?? null),
    weightKg: input.weightKg,
    ...computed,
    notes: input.notes ?? null,
  });

  await User.updateOne({ _id: user._id }, { $set: { gender, heightCm: input.heightCm } });
  await syncWeighIn(user._id, dateKey, input.weightKg);
  await invalidateWeeksFor(user._id, [dateKey], user.measurementDay);
  return toBodyEntryDTO(doc.toObject());
}

export async function updateBodyEntry(ctx: AppContext, userId: string, id: string, input: Partial<BodyEntryInput>): Promise<BodyEntryDTO> {
  const user = await loadUser(userId);
  const existing = await BodyEntry.findOne({ _id: oid(id), userId: user._id }).lean<BodyEntryDoc>();
  if (!existing) throw AppError.notFound("Ölçüm");

  const gender: Gender = input.gender ?? existing.gender;
  const merged = {
    heightCm: input.heightCm ?? existing.heightCm,
    neckCm: input.neckCm ?? existing.neckCm,
    waistCm: input.waistCm ?? existing.waistCm,
    hipCm: input.hipCm === undefined ? existing.hipCm : input.hipCm,
    weightKg: input.weightKg ?? existing.weightKg,
  };
  const computed = measure(gender, merged);
  const date = input.date ? new Date(input.date) : existing.date;
  if (Number.isNaN(date.getTime())) throw AppError.validation("Geçersiz tarih");
  const dateKey = trDateKey(date);

  const doc = await BodyEntry.findOneAndUpdate(
    { _id: existing._id },
    { $set: { ...merged, gender, date, dateKey, ...computed, notes: input.notes === undefined ? existing.notes : input.notes } },
    { returnDocument: "after" }
  ).lean<BodyEntryDoc>();
  if (!doc) throw AppError.notFound("Ölçüm");

  if (dateKey !== existing.dateKey) await releaseWeighIn(user._id, existing.dateKey);
  await syncWeighIn(user._id, dateKey, merged.weightKg);
  await invalidateWeeksFor(user._id, [existing.dateKey, dateKey], user.measurementDay);
  return toBodyEntryDTO(doc);
}

export async function deleteBodyEntry(userId: string, id: string): Promise<void> {
  const user = await loadUser(userId);
  const existing = await BodyEntry.findOneAndDelete({ _id: oid(id), userId: user._id }).lean<BodyEntryDoc>();
  if (!existing) throw AppError.notFound("Ölçüm");
  await releaseWeighIn(user._id, existing.dateKey);
  await invalidateWeeksFor(user._id, [existing.dateKey], user.measurementDay);
}

export async function listWeighIns(ctx: AppContext, userId: string, days: number): Promise<WeighInDTO[]> {
  const user = await loadUser(userId);
  const todayKey = trDateKey(ctx.now());
  const fromKey = shiftKey(todayKey, -(days - 1));
  const docs = await WeighIn.find({ userId: user._id, dateKey: { $gte: fromKey, $lte: todayKey } }).sort({ dateKey: 1 }).lean();
  return docs.map(toWeighInDTO);
}

export async function upsertWeighIn(ctx: AppContext, userId: string, weightKg: number, dateKey?: string): Promise<WeighInDTO> {
  const user = await loadUser(userId);
  const key = dateKey ?? trDateKey(ctx.now());
  const doc = await WeighIn.findOneAndUpdate(
    { userId: user._id, dateKey: key },
    { $set: { weightKg, source: "manual" }, $setOnInsert: { userId: user._id, dateKey: key } },
    { upsert: true, returnDocument: "after" }
  ).lean();
  await invalidateWeeksFor(user._id, [key], user.measurementDay);
  if (!doc) throw AppError.notFound("Tartı");
  return toWeighInDTO(doc);
}

export async function deleteWeighIn(userId: string, id: string): Promise<void> {
  const user = await loadUser(userId);
  const doc = await WeighIn.findOneAndDelete({ _id: oid(id), userId: user._id }).lean();
  if (!doc) throw AppError.notFound("Tartı");
  await invalidateWeeksFor(user._id, [doc.dateKey], user.measurementDay);
}

export async function bodyTrends(ctx: AppContext, userId: string, days: number): Promise<BodyTrends> {
  const user = await loadUser(userId);
  const settings = await goalSettings();
  const todayKey = trDateKey(ctx.now());
  const fromKey = shiftKey(todayKey, -(days - 1));
  const historyFrom = shiftKey(todayKey, -TREND_HISTORY_DAYS);

  const [weighIns, entries] = await Promise.all([
    WeighIn.find({ userId: user._id, dateKey: { $gte: historyFrom, $lte: todayKey } }).sort({ dateKey: 1 }).lean(),
    BodyEntry.find({ userId: user._id, dateKey: { $gte: fromKey, $lte: todayKey } }).sort({ date: 1, _id: 1 }).lean<BodyEntryDoc[]>(),
  ]);

  const trend = ewmaTrend(weighIns.map((w) => ({ dateKey: w.dateKey, weightKg: w.weightKg })), settings.ewma);
  const byKey = new Map<string, TrendPoint>();
  const point = (dateKey: string): TrendPoint => {
    let p = byKey.get(dateKey);
    if (!p) {
      p = { dateKey, weightKg: null, weightEwma: null, bodyFatPct: null, leanMassKg: null, waistCm: null };
      byKey.set(dateKey, p);
    }
    return p;
  };
  for (const p of trend) {
    if (p.dateKey < fromKey) continue;
    const out = point(p.dateKey);
    out.weightKg = p.weightKg;
    out.weightEwma = Math.round(p.ewma * 100) / 100;
  }
  for (const e of entries) {
    const out = point(e.dateKey);
    out.bodyFatPct = e.bodyFatPct;
    out.leanMassKg = e.leanMassKg;
    out.waistCm = e.waistCm;
    if (out.weightKg === null) out.weightKg = e.weightKg;
  }
  const points = [...byKey.values()].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));

  const ewmaLatest = latestTrendWeight(trend);
  const deltaOver = (n: number): number | null => {
    if (ewmaLatest === null) return null;
    const base = ewmaAt(trend, shiftKey(todayKey, -n));
    return base === null ? null : Math.round((ewmaLatest - base) * 100) / 100;
  };
  const window30 = entries.filter((e) => e.dateKey >= shiftKey(todayKey, -30));
  const first = window30[0];
  const last = window30.at(-1);
  const measured = first && last && first._id !== last._id;

  return {
    points,
    summary: {
      weightDelta7d: deltaOver(7),
      weightDelta30d: deltaOver(30),
      bfDelta30d: measured ? Math.round((last!.bodyFatPct - first.bodyFatPct) * 100) / 100 : null,
      waistDelta30d: measured ? Math.round((last!.waistCm - first.waistCm) * 100) / 100 : null,
      ewmaLatest: ewmaLatest === null ? null : Math.round(ewmaLatest * 100) / 100,
    },
  };
}

export async function bodySummary(ctx: AppContext, userId: string): Promise<BodySummary> {
  const user = await loadUser(userId);
  const settings = await goalSettings();
  const todayKey = trDateKey(ctx.now());
  const [entries, weighIns] = await Promise.all([
    BodyEntry.find({ userId: user._id }).sort({ date: -1, _id: -1 }).limit(2).lean<BodyEntryDoc[]>(),
    WeighIn.find({ userId: user._id, dateKey: { $gte: shiftKey(todayKey, -TREND_HISTORY_DAYS) } }).sort({ dateKey: 1 }).lean(),
  ]);
  const latest = entries[0] ?? null;
  const prev = entries[1] ?? null;
  const trend = ewmaTrend(weighIns.map((w) => ({ dateKey: w.dateKey, weightKg: w.weightKg })), settings.ewma);
  const ewmaWeightKg = latestTrendWeight(trend);
  const delta = (a: number | null | undefined, b: number | null | undefined) =>
    a == null || b == null ? null : Math.round((a - b) * 100) / 100;

  return {
    latest: latest ? toBodyEntryDTO(latest) : null,
    prev: prev ? toBodyEntryDTO(prev) : null,
    latestWeighIn: weighIns.length > 0 ? toWeighInDTO(weighIns[weighIns.length - 1]) : null,
    ewmaWeightKg: ewmaWeightKg === null ? null : Math.round(ewmaWeightKg * 100) / 100,
    deltas: {
      weightKg: delta(latest?.weightKg, prev?.weightKg),
      bodyFatPct: delta(latest?.bodyFatPct, prev?.bodyFatPct),
      leanMassKg: delta(latest?.leanMassKg, prev?.leanMassKg),
      waistCm: delta(latest?.waistCm, prev?.waistCm),
    },
    category: latest ? bodyFatCategory(latest.gender, latest.bodyFatPct) : null,
    profile: { gender: user.gender, heightCm: user.heightCm ?? null },
  };
}

export { dayIntakeFor };

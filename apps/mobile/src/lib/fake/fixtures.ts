/**
 * Demo fixtures for the FakeApi. Everything is generated relative to `today` so the demo always
 * looks alive. Shapes follow packages/core schemas exactly (the fake test parses them).
 */
import {
  bodyComposition,
  bodyFatCategory,
  ewma,
  navyBodyFat,
  round,
  shiftKey,
  weekKeyFor,
  weekRange,
  keyWeekday,
  type BodyEntryDTO,
  type BodySummary,
  type BodyTrends,
  type DayDTO,
  type DietTargetDTO,
  type ExerciseDTO,
  type FoodDTO,
  type GoalDTO,
  type GoalPlan,
  type GoalProgress,
  type HomeDTO,
  type MealEntryDTO,
  type MuscleDTO,
  type MuscleReadiness,
  type NutritionDayView,
  type ProgramDTO,
  type ProgramView,
  type RecoveryView,
  type RoadmapWeek,
  type ScheduleEntry,
  type Totals,
  type TrainingStats,
  type UserDTO,
  type WeekNutrition,
  type WeeklyReportDTO,
  type WeeklyReportSummary,
  type WeighInDTO,
  type WorkoutLogDTO,
  type Weekday,
  type Macros,
} from "@fitfloow/core";

/* ------------------------------ helpers ------------------------------- */

/** Deterministic PRNG so the demo looks the same every launch. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const iso = (key: string, h = 9) => `${key}T${String(h).padStart(2, "0")}:00:00.000Z`;
let idSeq = 1000;
export const nextId = (p: string) => `${p}_${(idSeq++).toString(36)}`;

/* ------------------------------- user --------------------------------- */

export function makeUser(): UserDTO {
  return {
    id: "u_eren",
    username: "eren",
    displayName: "Eren",
    role: "user",
    gender: "male",
    heightCm: 180,
    birthDate: "1996-04-12",
    activityLevel: "moderate",
    measurementDay: 0,
    mascotEnabled: true,
    createdAt: "2025-01-10T08:00:00.000Z",
    lastSeenAt: null,
  };
}

/* ------------------------------ catalog -------------------------------- */

export const MUSCLES: MuscleDTO[] = [
  { key: "chest", name: "Göğüs", short: "Göğüs", size: "large", fullRecoveryHours: 48, weeklyTarget: { min: 10, max: 20 }, region: "front", color: "#F97316", order: 0, active: true },
  { key: "back", name: "Sırt", short: "Sırt", size: "large", fullRecoveryHours: 48, weeklyTarget: { min: 10, max: 20 }, region: "back", color: "#0EA5E9", order: 1, active: true },
  { key: "shoulders", name: "Omuz", short: "Omuz", size: "small", fullRecoveryHours: 36, weeklyTarget: { min: 8, max: 16 }, region: "front", color: "#A855F7", order: 2, active: true },
  { key: "biceps", name: "Biseps", short: "Biseps", size: "small", fullRecoveryHours: 24, weeklyTarget: { min: 6, max: 14 }, region: "arms", color: "#22C55E", order: 3, active: true },
  { key: "triceps", name: "Triseps", short: "Triseps", size: "small", fullRecoveryHours: 24, weeklyTarget: { min: 6, max: 14 }, region: "arms", color: "#14B8A6", order: 4, active: true },
  { key: "quads", name: "Ön bacak", short: "Quad", size: "large", fullRecoveryHours: 72, weeklyTarget: { min: 10, max: 18 }, region: "legs", color: "#EF4444", order: 5, active: true },
  { key: "hamstrings", name: "Arka bacak", short: "Ham", size: "large", fullRecoveryHours: 72, weeklyTarget: { min: 8, max: 16 }, region: "legs", color: "#EC4899", order: 6, active: true },
  { key: "glutes", name: "Kalça", short: "Kalça", size: "large", fullRecoveryHours: 48, weeklyTarget: { min: 6, max: 14 }, region: "legs", color: "#F59E0B", order: 7, active: true },
  { key: "core", name: "Karın", short: "Karın", size: "small", fullRecoveryHours: 24, weeklyTarget: { min: 6, max: 12 }, region: "core", color: "#6366F1", order: 8, active: true },
];

export const EXERCISES: ExerciseDTO[] = [
  { id: "ex_bench", name: "Bench Press", muscles: [{ key: "chest", load: 1 }, { key: "triceps", load: 0.5 }, { key: "shoulders", load: 0.3 }], defaultSets: 4, defaultReps: 8, metric: "reps", kind: "strength", equipment: ["barbell"], instructions: "", active: true },
  { id: "ex_row", name: "Barbell Row", muscles: [{ key: "back", load: 1 }, { key: "biceps", load: 0.5 }], defaultSets: 4, defaultReps: 8, metric: "reps", kind: "strength", equipment: ["barbell"], instructions: "", active: true },
  { id: "ex_ohp", name: "Overhead Press", muscles: [{ key: "shoulders", load: 1 }, { key: "triceps", load: 0.4 }], defaultSets: 3, defaultReps: 10, metric: "reps", kind: "strength", equipment: ["barbell"], instructions: "", active: true },
  { id: "ex_squat", name: "Squat", muscles: [{ key: "quads", load: 1 }, { key: "glutes", load: 0.7 }, { key: "hamstrings", load: 0.3 }], defaultSets: 4, defaultReps: 6, metric: "reps", kind: "strength", equipment: ["barbell"], instructions: "", active: true },
  { id: "ex_rdl", name: "Romanian Deadlift", muscles: [{ key: "hamstrings", load: 1 }, { key: "glutes", load: 0.7 }, { key: "back", load: 0.3 }], defaultSets: 3, defaultReps: 10, metric: "reps", kind: "strength", equipment: ["barbell"], instructions: "", active: true },
  { id: "ex_pullup", name: "Pull-up", muscles: [{ key: "back", load: 1 }, { key: "biceps", load: 0.6 }], defaultSets: 3, defaultReps: 8, metric: "reps", kind: "strength", equipment: ["bar"], instructions: "", active: true },
  { id: "ex_curl", name: "Dumbbell Curl", muscles: [{ key: "biceps", load: 1 }], defaultSets: 3, defaultReps: 12, metric: "reps", kind: "strength", equipment: ["dumbbell"], instructions: "", active: true },
  { id: "ex_plank", name: "Plank", muscles: [{ key: "core", load: 1 }], defaultSets: 3, defaultReps: 45, metric: "time", kind: "mobility", equipment: [], instructions: "", active: true },
];

/* ------------------------------ program -------------------------------- */

const ex = (id: string, sets?: number, reps?: number, rir: number | null = 2) => {
  const e = EXERCISES.find((x) => x.id === id)!;
  return { name: e.name, muscles: e.muscles, targetSets: sets ?? e.defaultSets, targetReps: reps ?? e.defaultReps, targetRIR: rir, metric: e.metric };
};

export const PROGRAM_DAYS: DayDTO[] = [
  { order: 1, title: "Üst Vücut A", focus: "Göğüs · Sırt · Omuz", kind: "strength", exercises: [ex("ex_bench"), ex("ex_row"), ex("ex_ohp"), ex("ex_curl")], run: null, swim: null },
  { order: 2, title: "Alt Vücut", focus: "Bacak · Kalça · Karın", kind: "strength", exercises: [ex("ex_squat"), ex("ex_rdl"), ex("ex_plank", 3, 45, null)], run: null, swim: null },
  { order: 3, title: "Koşu", focus: "Tempo koşusu", kind: "run", exercises: [], run: { targetKm: 5, targetMin: 30, label: "Tempo" }, swim: null },
  { order: 4, title: "Dinlenme", focus: "", kind: "rest", exercises: [], run: null, swim: null },
  { order: 5, title: "Üst Vücut B", focus: "Sırt · Göğüs · Kol", kind: "strength", exercises: [ex("ex_pullup"), ex("ex_bench", 3, 10), ex("ex_row", 3, 10), ex("ex_curl", 2, 15)], run: null, swim: null },
  { order: 6, title: "Dinlenme", focus: "", kind: "rest", exercises: [], run: null, swim: null },
];

export function makeProgram(today: string): ProgramDTO {
  return {
    id: "p_demo",
    name: "Üst / Alt + Koşu",
    days: PROGRAM_DAYS,
    currentIndex: 0,
    weekNumber: 6,
    startedAt: iso(shiftKey(today, -38)),
    lastActionAt: iso(shiftKey(today, -1), 18),
    sourceTemplateId: "tpl_upper_lower",
  };
}

export function makeLog(day: DayDTO, dateKey: string, weekNumber: number, isOffDay = false): WorkoutLogDTO {
  const r = rng(dateKey.length + weekNumber);
  return {
    id: nextId("log"),
    date: iso(dateKey, 18),
    dateKey,
    dayOrder: day.order,
    weekNumber,
    title: day.title,
    kind: day.kind,
    isOffDay,
    strength: isOffDay
      ? []
      : day.exercises.map((e) => ({
          name: e.name,
          muscles: e.muscles,
          plannedSets: e.targetSets,
          plannedReps: e.targetReps,
          plannedRIR: e.targetRIR,
          source: "planned" as const,
          skipped: false,
          metric: e.metric,
          sets: Array.from({ length: e.targetSets }, () => ({ reps: e.targetReps - Math.floor(r() * 2), rir: e.targetRIR })),
        })),
    run: day.run && !isOffDay ? { segments: [{ km: day.run.targetKm, min: day.run.targetMin + 2 }], totalKm: day.run.targetKm, totalMin: day.run.targetMin + 2, targetKm: day.run.targetKm, targetMin: day.run.targetMin } : null,
    swim: null,
    durationMin: isOffDay ? null : day.kind === "run" ? 34 : 58,
    notes: null,
    rpe: isOffDay ? null : 7,
  };
}

/** Recent history: the program cycled over the last ~5 weeks, one log per non-rest day, skipping some. */
export function makeHistory(today: string): WorkoutLogDTO[] {
  const logs: WorkoutLogDTO[] = [];
  const r = rng(7);
  let dayIdx = 0;
  for (let back = 35; back >= 1; back--) {
    const key = shiftKey(today, -back);
    const day = PROGRAM_DAYS[dayIdx % PROGRAM_DAYS.length];
    const week = 6 - Math.floor(back / 7);
    if (day.kind !== "rest") logs.push(makeLog(day, key, week, r() < 0.1));
    dayIdx++;
  }
  return logs.reverse(); // newest first
}

export function makeSchedule(today: string, program: ProgramDTO, logs: WorkoutLogDTO[]): ScheduleEntry[] {
  const wd = keyWeekday(today);
  const start = shiftKey(today, -wd); // Sunday-aligned week strip
  return Array.from({ length: 7 }, (_, i) => {
    const dateKey = shiftKey(start, i);
    const log = logs.find((l) => l.dateKey === dateKey) ?? null;
    const offset = i - wd;
    const day = offset < 0 ? (log ? program.days.find((d) => d.order === log.dayOrder) ?? null : null) : program.days[(program.currentIndex + offset) % program.days.length];
    const status: ScheduleEntry["status"] = log ? (log.isOffDay ? "skipped" : "done") : offset === 0 ? "today" : offset > 0 ? "upcoming" : "past";
    return { dateKey, weekday: keyWeekday(dateKey), isToday: offset === 0, day, status, logId: log?.id ?? null };
  });
}

export function weeklyVolume(logs: WorkoutLogDTO[], weekKey: string) {
  const { keys } = weekRange(weekKey);
  const done: Record<string, number> = {};
  for (const l of logs.filter((x) => keys.includes(x.dateKey) && !x.isOffDay))
    for (const s of l.strength) for (const m of s.muscles) done[m.key] = (done[m.key] ?? 0) + s.sets.length * m.load;
  return MUSCLES.map((m) => {
    const d = round(done[m.key] ?? 0, 1);
    const status = d === 0 ? "none" : d < (m.weeklyTarget.min ?? 0) ? "under" : d > m.weeklyTarget.max ? "over" : "in";
    return { key: m.key, name: m.name, done: d, target: m.weeklyTarget, status } as const;
  });
}

export function makeProgramView(today: string, program: ProgramDTO, logs: WorkoutLogDTO[], measurementDay: Weekday): ProgramView {
  return {
    program,
    current: { index: program.currentIndex, day: program.days[program.currentIndex] },
    todayLog: logs.find((l) => l.dateKey === today) ?? null,
    schedule: makeSchedule(today, program, logs),
    weeklyVolume: [...weeklyVolume(logs, weekKeyFor(today, measurementDay))],
  };
}

/* ------------------------------ recovery ------------------------------- */

export function makeRecovery(today: string, logs: WorkoutLogDTO[], measurementDay: Weekday): RecoveryView {
  const nowMs = new Date(iso(today, 12)).getTime();
  const volume = weeklyVolume(logs, weekKeyFor(today, measurementDay));
  const muscles: MuscleReadiness[] = MUSCLES.map((m) => {
    const last = logs.find((l) => !l.isOffDay && l.strength.some((s) => s.muscles.some((x) => x.key === m.key)));
    const hoursSince = last ? round((nowMs - new Date(last.date).getTime()) / 36e5, 1) : null;
    const frac = hoursSince === null ? 1 : Math.min(1, hoursSince / m.fullRecoveryHours);
    const readiness = Math.round(100 * (frac >= 1 ? 1 : frac < 0.5 ? frac * 1.4 : 0.7 + (frac - 0.5) * 0.6));
    const status = readiness >= 85 ? "ready" : readiness >= 50 ? "recovering" : "fatigued";
    const v = volume.find((x) => x.key === m.key)!;
    return {
      key: m.key,
      name: m.name,
      short: m.short,
      size: m.size,
      color: m.color,
      fullRecoveryHours: m.fullRecoveryHours,
      readiness,
      status,
      lastTrainedAt: last?.date ?? null,
      hoursSince,
      hoursToFull: hoursSince === null ? null : Math.max(0, round(m.fullRecoveryHours - hoursSince, 1)),
      residualSets: round((1 - frac) * 6, 1),
      weeklySets: v.done,
      weeklyTarget: m.weeklyTarget,
    };
  });
  const readiness = Math.round(muscles.reduce((a, b) => a + b.readiness, 0) / muscles.length);
  return {
    muscles,
    overall: {
      readiness,
      status: readiness >= 85 ? "ready" : readiness >= 50 ? "recovering" : "fatigued",
      readyCount: muscles.filter((m) => m.status === "ready").length,
      fatiguedCount: muscles.filter((m) => m.status === "fatigued").length,
    },
    generatedAt: iso(today, 12),
  };
}

export function makeTrainingStats(today: string, logs: WorkoutLogDTO[], measurementDay: Weekday, weeks = 8): TrainingStats {
  const wk = weekKeyFor(today, measurementDay);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekKey = shiftKey(wk, -7 * i);
    const { keys } = weekRange(weekKey);
    const ls = logs.filter((l) => keys.includes(l.dateKey) && !l.isOffDay);
    const volumeByMuscle: Record<string, number> = {};
    for (const v of weeklyVolume(logs, weekKey)) volumeByMuscle[v.key] = v.done;
    out.push({ weekKey, sessions: ls.length, sets: ls.reduce((a, l) => a + l.strength.reduce((b, s) => b + s.sets.length, 0), 0), cardioKm: round(ls.reduce((a, l) => a + (l.run?.totalKm ?? 0), 0), 1), volumeByMuscle });
  }
  return { weeks: out, streakDays: 3, totalSessions: logs.filter((l) => !l.isOffDay).length };
}

/* -------------------------------- body --------------------------------- */

export function makeWeighIns(today: string, days = 90): WeighInDTO[] {
  const r = rng(42);
  const out: WeighInDTO[] = [];
  for (let back = days; back >= 1; back--) {
    if (r() < 0.22) continue; // some missing days
    const key = shiftKey(today, -back);
    const trend = 84.5 - (days - back) * 0.055; // ≈ −0.4 kg / week
    const noise = (r() - 0.5) * 1.2;
    out.push({ id: nextId("wi"), dateKey: key, weightKg: round(trend + noise, 1), source: "manual", createdAt: iso(key, 7) });
  }
  return out;
}

export function makeBodyEntry(input: { dateKey: string; heightCm: number; neckCm: number; waistCm: number; weightKg: number; gender: "male" | "female"; hipCm?: number | null; notes?: string | null }): BodyEntryDTO {
  const bf = navyBodyFat({ gender: input.gender, heightCm: input.heightCm, neckCm: input.neckCm, waistCm: input.waistCm, hipCm: input.hipCm ?? null }) ?? 20;
  const comp = bodyComposition(input.weightKg, bf);
  return {
    id: nextId("be"),
    date: iso(input.dateKey, 8),
    dateKey: input.dateKey,
    gender: input.gender,
    heightCm: input.heightCm,
    neckCm: input.neckCm,
    waistCm: input.waistCm,
    hipCm: input.hipCm ?? null,
    weightKg: input.weightKg,
    bodyFatPct: round(bf, 1),
    fatMassKg: round(comp.fatMassKg, 1),
    leanMassKg: round(comp.leanMassKg, 1),
    notes: input.notes ?? null,
  };
}

export function makeBodyEntries(today: string, weighIns: WeighInDTO[]): BodyEntryDTO[] {
  const out: BodyEntryDTO[] = [];
  for (let w = 12; w >= 1; w -= 2) {
    const key = shiftKey(today, -7 * w);
    const near = weighIns.find((x) => x.dateKey >= key) ?? weighIns[weighIns.length - 1];
    out.push(makeBodyEntry({ dateKey: key, heightCm: 180, neckCm: 39, waistCm: round(92 - (12 - w) * 0.45, 1), weightKg: near?.weightKg ?? 82, gender: "male" }));
  }
  return out; // ascending
}

export function makeTrends(weighIns: WeighInDTO[], entries: BodyEntryDTO[], days: number, today: string): BodyTrends {
  const from = shiftKey(today, -days);
  const wi = weighIns.filter((w) => w.dateKey >= from);
  const sm = ewma(wi.map((w) => w.weightKg), 0.1);
  const points: BodyTrends["points"] = wi.map((w, i) => {
    const e = entries.find((x) => x.dateKey === w.dateKey);
    return { dateKey: w.dateKey, weightKg: w.weightKg, weightEwma: round(sm[i], 2), bodyFatPct: e?.bodyFatPct ?? null, leanMassKg: e?.leanMassKg ?? null, waistCm: e?.waistCm ?? null };
  });
  for (const e of entries.filter((x) => x.dateKey >= from && !wi.some((w) => w.dateKey === x.dateKey))) {
    points.push({ dateKey: e.dateKey, weightKg: e.weightKg, weightEwma: null, bodyFatPct: e.bodyFatPct, leanMassKg: e.leanMassKg, waistCm: e.waistCm });
  }
  points.sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  const ew = points.filter((p) => p.weightEwma !== null);
  const latest = ew[ew.length - 1]?.weightEwma ?? null;
  const at = (back: number) => ew.filter((p) => p.dateKey <= shiftKey(today, -back)).pop()?.weightEwma ?? null;
  const bfs = points.filter((p) => p.bodyFatPct !== null);
  const waists = points.filter((p) => p.waistCm !== null);
  return {
    points,
    summary: {
      weightDelta7d: latest !== null && at(7) !== null ? round(latest - at(7)!, 2) : null,
      weightDelta30d: latest !== null && at(30) !== null ? round(latest - at(30)!, 2) : null,
      bfDelta30d: bfs.length >= 2 ? round(bfs[bfs.length - 1].bodyFatPct! - bfs[0].bodyFatPct!, 1) : null,
      waistDelta30d: waists.length >= 2 ? round(waists[waists.length - 1].waistCm! - waists[0].waistCm!, 1) : null,
      ewmaLatest: latest,
    },
  };
}

export function makeSummary(entries: BodyEntryDTO[], weighIns: WeighInDTO[], user: UserDTO): BodySummary {
  const latest = entries[entries.length - 1] ?? null;
  const prev = entries[entries.length - 2] ?? null;
  const sm = ewma(weighIns.map((w) => w.weightKg), 0.1);
  return {
    latest,
    prev,
    latestWeighIn: weighIns[weighIns.length - 1] ?? null,
    ewmaWeightKg: sm.length ? round(sm[sm.length - 1], 1) : null,
    deltas: {
      weightKg: latest && prev ? round(latest.weightKg - prev.weightKg, 1) : null,
      bodyFatPct: latest && prev ? round(latest.bodyFatPct - prev.bodyFatPct, 1) : null,
      leanMassKg: latest && prev ? round(latest.leanMassKg - prev.leanMassKg, 1) : null,
      waistCm: latest && prev ? round(latest.waistCm - prev.waistCm, 1) : null,
    },
    category: latest ? bodyFatCategory(user.gender, latest.bodyFatPct) : null,
    profile: { gender: user.gender, heightCm: user.heightCm },
  };
}

/* -------------------------------- goal --------------------------------- */

export function makePlan(start: BodyEntryDTO, targetBf: number, profile: GoalDTO["profile"], startKey: string): GoalPlan {
  const rate = { conservative: 0.35, optimal: 0.5, aggressive: 0.7 }[profile];
  const lean = start.leanMassKg;
  const targetWeight = round(lean / (1 - targetBf / 100), 1);
  const totalLoss = round(Math.max(0, start.weightKg - targetWeight), 1);
  const fatToLose = round(Math.max(0, start.fatMassKg - targetWeight * (targetBf / 100)), 1);
  const bmr = Math.round(370 + 21.6 * lean);
  const tdee = Math.round(bmr * 1.55);
  const weeklyLoss = round((start.weightKg * rate) / 100, 2);
  const weeks = Math.max(1, Math.ceil(totalLoss / weeklyLoss));
  const weeklyDeficit = Math.round(weeklyLoss * 7700);
  const daily = Math.max(1500, Math.round(tdee - weeklyDeficit / 7));
  const macros: Macros = { calories: daily, protein: Math.round(lean * 2.4), fat: Math.round((daily * 0.25) / 9), carbs: Math.round((daily - lean * 2.4 * 4 - daily * 0.25) / 4) };
  const roadmap: RoadmapWeek[] = [];
  let w = start.weightKg;
  let cum = 0;
  for (let i = 1; i <= weeks; i++) {
    const end = round(Math.max(targetWeight, w - weeklyLoss), 2);
    cum += weeklyDeficit;
    roadmap.push({
      weekIndex: i,
      startKey: shiftKey(startKey, (i - 1) * 7),
      endKey: shiftKey(startKey, i * 7 - 1),
      startWeightKg: round(w, 2),
      endWeightKg: end,
      startBfPct: round((1 - lean / w) * 100, 1),
      endBfPct: round((1 - lean / end) * 100, 1),
      rateKgPerWeek: weeklyLoss,
      weeklyDeficitKcal: weeklyDeficit,
      dailyCalorieTarget: daily,
      cumulativeDeficitKcal: cum,
      macros,
    });
    w = end;
  }
  return {
    fatToLoseKg: fatToLose,
    totalLossKg: totalLoss,
    targetWeightKg: targetWeight,
    totalDeficitKcal: Math.round(totalLoss * 7700),
    avgWeightKg: round((start.weightKg + targetWeight) / 2, 1),
    pctChange: round((totalLoss / start.weightKg) * 100, 1),
    leanMassKg: lean,
    fatMassKg: start.fatMassKg,
    bmr,
    bmrMifflin: bmr - 40,
    tdeeFormula: tdee,
    tdee,
    activityLevel: "moderate",
    profile,
    initialRateKgPerWeek: weeklyLoss,
    initialDailyCalorieTarget: daily,
    macros,
    estimatedWeeks: weeks,
    startKey,
    targetDate: shiftKey(startKey, weeks * 7),
    roadmap,
    warnings: weeks > 40 ? ["LONG_HORIZON"] : [],
  };
}

export function makeGoal(today: string, entries: BodyEntryDTO[]): GoalDTO {
  const start = entries[0];
  const startKey = shiftKey(today, -35);
  return {
    id: "g_demo",
    status: "active",
    targetBodyFatPct: 15,
    profile: "optimal",
    start: { dateKey: startKey, weightKg: start.weightKg, bodyFatPct: start.bodyFatPct, leanMassKg: start.leanMassKg, fatMassKg: start.fatMassKg, bodyEntryId: start.id },
    plan: makePlan(start, 15, "optimal", startKey),
    tdeeOverride: null,
    createdAt: iso(startKey),
    updatedAt: iso(shiftKey(today, -7)),
    completedAt: null,
  };
}

export function makeProgress(today: string, goal: GoalDTO, trends: BodyTrends): GoalProgress {
  const days = Math.max(0, Math.round((new Date(iso(today)).getTime() - new Date(iso(goal.start.dateKey)).getTime()) / 864e5));
  const weeksElapsed = Math.floor(days / 7);
  const idx = Math.min(goal.plan.roadmap.length, weeksElapsed + 1);
  const cur = goal.plan.roadmap[idx - 1] ?? null;
  const expected = cur ? round(cur.startWeightKg - (cur.startWeightKg - cur.endWeightKg) * ((days % 7) / 7), 2) : goal.plan.targetWeightKg;
  const actual = trends.summary.ewmaLatest;
  const lean = goal.plan.leanMassKg;
  const actualBf = actual ? round((1 - lean / actual) * 100, 1) : null;
  const diff = actual !== null ? actual - expected : 0;
  const onTrack = actual === null ? "onTrack" : diff < -0.6 ? "ahead" : diff <= 0.6 ? "onTrack" : diff <= 1.5 ? "behind" : "stalled";
  const kgToGo = actual !== null ? round(Math.max(0, actual - goal.plan.targetWeightKg), 1) : goal.plan.totalLossKg;
  const pct = Math.round(((goal.plan.totalLossKg - kgToGo) / Math.max(0.1, goal.plan.totalLossKg)) * 100);
  const weeksRemaining = Math.max(0, goal.plan.estimatedWeeks - weeksElapsed);
  return {
    daysElapsed: days,
    weeksElapsed,
    weekIndexInPlan: idx,
    expectedWeightKg: expected,
    actualWeightKg: actual,
    expectedBodyFatPct: cur ? cur.endBfPct : goal.targetBodyFatPct,
    actualBodyFatPct: actualBf,
    deficitBankedKcal: Math.round(days * 480),
    deficitPlannedKcal: Math.round(days * (goal.plan.roadmap[0]?.weeklyDeficitKcal ?? 3500) / 7),
    percentComplete: Math.max(0, Math.min(100, pct)),
    kgToGo,
    bfToGo: actualBf !== null ? round(Math.max(0, actualBf - goal.targetBodyFatPct), 1) : round(goal.start.bodyFatPct - goal.targetBodyFatPct, 1),
    onTrack,
    projectedDate: shiftKey(today, weeksRemaining * 7 + (onTrack === "behind" ? 14 : 0)),
    weeksRemainingPlan: weeksRemaining,
    weeksRemainingProjected: weeksRemaining + (onTrack === "behind" ? 2 : 0),
    currentWeek: cur,
  };
}

/* ------------------------------ nutrition ------------------------------ */

const food = (id: string, name: string, nameEn: string, category: string, kcal: number, p: number, c: number, f: number, serving: number, servings: { label: string; grams: number }[] = []): FoodDTO => ({
  id,
  name,
  nameEn,
  aliases: [],
  category,
  per100g: { kcal, protein: p, carbs: c, fat: f },
  defaultServingG: serving,
  servings,
  source: "seed",
  barcode: null,
  verified: true,
  popularity: 10,
  brand: null,
});

export const FOODS: FoodDTO[] = [
  food("f_yumurta", "Yumurta (haşlanmış)", "Boiled egg", "protein", 155, 13, 1.1, 11, 50, [{ label: "1 adet", grams: 50 }]),
  food("f_tavuk", "Tavuk göğsü (ızgara)", "Grilled chicken breast", "protein", 165, 31, 0, 3.6, 150, [{ label: "1 porsiyon", grams: 150 }]),
  food("f_yogurt", "Yoğurt (yarım yağlı)", "Yogurt", "süt", 63, 3.5, 4.7, 3.3, 200, [{ label: "1 kase", grams: 200 }]),
  food("f_pilav", "Pirinç pilavı", "Rice pilaf", "tahıl", 165, 3, 30, 4, 150, [{ label: "1 porsiyon", grams: 150 }]),
  food("f_ekmek", "Tam buğday ekmeği", "Whole wheat bread", "tahıl", 247, 13, 41, 3.4, 30, [{ label: "1 dilim", grams: 30 }]),
  food("f_mercimek", "Mercimek çorbası", "Lentil soup", "çorba", 62, 3.5, 9, 1.4, 250, [{ label: "1 kase", grams: 250 }]),
  food("f_salata", "Çoban salata", "Shepherd salad", "sebze", 45, 1.2, 5, 2.5, 200, [{ label: "1 porsiyon", grams: 200 }]),
  food("f_muz", "Muz", "Banana", "meyve", 89, 1.1, 23, 0.3, 120, [{ label: "1 adet", grams: 120 }]),
  food("f_peynir", "Beyaz peynir", "White cheese", "süt", 264, 17, 1, 21, 30, [{ label: "1 dilim", grams: 30 }]),
  food("f_kofte", "Izgara köfte", "Grilled meatballs", "protein", 240, 18, 6, 16, 120, [{ label: "4 adet", grams: 120 }]),
  food("f_bulgur", "Bulgur pilavı", "Bulgur pilaf", "tahıl", 120, 3.5, 22, 2, 150, [{ label: "1 porsiyon", grams: 150 }]),
  food("f_badem", "Badem", "Almonds", "kuruyemiş", 579, 21, 22, 50, 30, [{ label: "1 avuç", grams: 30 }]),
];

export const DEFAULT_TARGET: DietTargetDTO = { mode: "auto", calories: 2150, protein: 160, carbs: 220, fat: 65, derivedFrom: "goal" };

export function totalsOf(f: FoodDTO["per100g"], grams: number): Totals {
  const k = grams / 100;
  return { kcal: Math.round(f.kcal * k), protein: round(f.protein * k, 1), carbs: round(f.carbs * k, 1), fat: round(f.fat * k, 1) };
}
export function sumTotals(list: Totals[]): Totals {
  return list.reduce((a, t) => ({ kcal: a.kcal + t.kcal, protein: round(a.protein + t.protein, 1), carbs: round(a.carbs + t.carbs, 1), fat: round(a.fat + t.fat, 1) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

export function makeEntry(dateKey: string, meal: MealEntryDTO["meal"], f: FoodDTO, grams: number, hour: number): MealEntryDTO {
  return { id: nextId("me"), dateKey, meal, foodId: f.id, name: f.name, grams, per100g: f.per100g, totals: totalsOf(f.per100g, grams), source: "search", scanId: null, loggedAt: iso(dateKey, hour) };
}

/** Seed ~20 days of meals (today has breakfast + lunch only, so there is room left). */
export function makeMealEntries(today: string): MealEntryDTO[] {
  const r = rng(11);
  const out: MealEntryDTO[] = [];
  const F = (id: string) => FOODS.find((f) => f.id === id)!;
  for (let back = 20; back >= 0; back--) {
    const key = shiftKey(today, -back);
    if (back > 0 && r() < 0.15) continue; // unlogged day
    out.push(makeEntry(key, "breakfast", F("f_yumurta"), 100, 8), makeEntry(key, "breakfast", F("f_ekmek"), 60, 8), makeEntry(key, "breakfast", F("f_peynir"), 30, 8));
    out.push(makeEntry(key, "lunch", F("f_tavuk"), 150, 13), makeEntry(key, "lunch", F("f_bulgur"), 150, 13), makeEntry(key, "lunch", F("f_salata"), 200, 13));
    if (back > 0) {
      out.push(makeEntry(key, "dinner", F("f_kofte"), 120, 19), makeEntry(key, "dinner", F("f_mercimek"), 250, 19));
      if (r() < 0.6) out.push(makeEntry(key, "snack", F("f_yogurt"), 200, 16));
      if (r() < 0.4) out.push(makeEntry(key, "snack", F("f_badem"), 30, 11));
    }
  }
  return out;
}

export function makeDayView(dateKey: string, entries: MealEntryDTO[], target: DietTargetDTO): NutritionDayView {
  const day = entries.filter((e) => e.dateKey === dateKey);
  const by = (m: MealEntryDTO["meal"]) => day.filter((e) => e.meal === m);
  const meals = { breakfast: by("breakfast"), lunch: by("lunch"), dinner: by("dinner"), snack: by("snack") };
  const mealTotals = { breakfast: sumTotals(meals.breakfast.map((e) => e.totals)), lunch: sumTotals(meals.lunch.map((e) => e.totals)), dinner: sumTotals(meals.dinner.map((e) => e.totals)), snack: sumTotals(meals.snack.map((e) => e.totals)) };
  const totals = sumTotals(day.map((e) => e.totals));
  return {
    dateKey,
    target,
    totals,
    remaining: { kcal: target.calories - totals.kcal, protein: round(target.protein - totals.protein, 1), carbs: round(target.carbs - totals.carbs, 1), fat: round(target.fat - totals.fat, 1) },
    meals,
    mealTotals,
  };
}

export function makeWeekNutrition(weekKey: string, entries: MealEntryDTO[], target: DietTargetDTO): WeekNutrition {
  const { keys } = weekRange(weekKey);
  const days = keys.map((dateKey) => {
    const t = sumTotals(entries.filter((e) => e.dateKey === dateKey).map((e) => e.totals));
    return { dateKey, totals: t, target: target.calories, logged: t.kcal > 0 };
  });
  const logged = days.filter((d) => d.logged);
  const avg = logged.length ? sumTotals(logged.map((d) => d.totals)) : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const n = Math.max(1, logged.length);
  const avgT = { kcal: Math.round(avg.kcal / n), protein: round(avg.protein / n, 1), carbs: round(avg.carbs / n, 1), fat: round(avg.fat / n, 1) };
  const adherence = logged.length ? Math.round((logged.filter((d) => Math.abs(d.totals.kcal - target.calories) <= target.calories * 0.1).length / logged.length) * 100) : 0;
  return { weekKey, days, avg: avgT, adherence, daysLogged: logged.length };
}

/* ------------------------------- reports ------------------------------- */

export function makeWeeklyReport(opts: { today: string; weekKey: string; measurementDay: Weekday; entries: MealEntryDTO[]; target: DietTargetDTO; logs: WorkoutLogDTO[]; weighIns: WeighInDTO[]; bodyEntries: BodyEntryDTO[]; goal: GoalDTO | null; progress: GoalProgress | null; mascot: WeeklyReportDTO["mascot"] }): WeeklyReportDTO {
  const { today, weekKey, measurementDay, entries, target, logs, weighIns, bodyEntries, goal, progress, mascot } = opts;
  const { startKey, endKey, keys } = weekRange(weekKey);
  const isCurrent = today >= startKey && today <= endKey;
  const dayIndexToday = isCurrent ? keys.indexOf(today) : null;
  const elapsed = isCurrent ? dayIndexToday! + 1 : 7;
  const tdee = goal?.plan.tdee ?? 2650;
  const days = keys.map((dateKey) => {
    const t = sumTotals(entries.filter((e) => e.dateKey === dateKey).map((e) => e.totals));
    const logged = t.kcal > 0;
    return { dateKey, kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, logged, deficit: logged ? tdee - t.kcal : 0 };
  });
  const loggedDays = days.filter((d) => d.logged);
  const banked = loggedDays.reduce((a, d) => a + d.deficit, 0);
  const plannedWeekly = goal?.plan.roadmap[0]?.weeklyDeficitKcal ?? 3500;
  const planned = Math.round((plannedWeekly * elapsed) / 7);
  const wi = weighIns.filter((w) => w.dateKey >= startKey && w.dateKey <= endKey);
  const all = weighIns.filter((w) => w.dateKey <= endKey);
  const sm = ewma(all.map((w) => w.weightKg), 0.1);
  const ewmaEnd = sm.length ? round(sm[sm.length - 1], 2) : null;
  const beforeIdx = all.findIndex((w) => w.dateKey >= startKey);
  const ewmaStart = beforeIdx > 0 ? round(sm[beforeIdx - 1], 2) : ewmaEnd;
  const sessions = logs.filter((l) => keys.includes(l.dateKey) && !l.isOffDay);
  const offDays = logs.filter((l) => keys.includes(l.dateKey) && l.isOffDay).length;
  const be = bodyEntries.filter((b) => b.dateKey >= startKey && b.dateKey <= endKey);
  const deficitPct = planned > 0 ? Math.round((banked / planned) * 100) : 0;
  const score = Math.max(0, Math.min(100, Math.round(Math.min(1, banked / Math.max(1, planned)) * 40 + (loggedDays.length / elapsed) * 20 + Math.min(1, sessions.length / 4) * 25 + Math.min(1, wi.length / elapsed) * 15)));
  return {
    weekKey,
    startKey,
    endKey,
    dayIndexToday,
    isCurrent,
    measurementDay,
    generatedAt: iso(today, 12),
    goal: goal
      ? { targetBodyFatPct: goal.targetBodyFatPct, profile: goal.profile, weekIndexInPlan: progress?.weekIndexInPlan ?? 1, plannedDailyTarget: goal.plan.initialDailyCalorieTarget, plannedWeeklyDeficit: plannedWeekly, tdeeUsed: tdee, expectedWeightEnd: progress?.currentWeek?.endWeightKg ?? goal.plan.targetWeightKg, expectedBfEnd: progress?.currentWeek?.endBfPct ?? goal.targetBodyFatPct }
      : null,
    nutrition: {
      daysLogged: loggedDays.length,
      avgKcal: loggedDays.length ? Math.round(loggedDays.reduce((a, d) => a + d.kcal, 0) / loggedDays.length) : 0,
      totalKcal: loggedDays.reduce((a, d) => a + d.kcal, 0),
      targetKcal: target.calories,
      avgProtein: loggedDays.length ? round(loggedDays.reduce((a, d) => a + d.protein, 0) / loggedDays.length, 1) : 0,
      proteinTarget: target.protein,
      deficitBankedKcal: banked,
      deficitPlannedKcal: planned,
      deficitPct,
      fatEquivalentKg: round(banked / 7700, 2),
      days,
    },
    body: {
      weightStart: wi[0]?.weightKg ?? null,
      weightEnd: wi[wi.length - 1]?.weightKg ?? null,
      weightDelta: wi.length >= 2 ? round(wi[wi.length - 1].weightKg - wi[0].weightKg, 1) : null,
      ewmaStart,
      ewmaEnd,
      ewmaDelta: ewmaStart !== null && ewmaEnd !== null ? round(ewmaEnd - ewmaStart, 2) : null,
      expectedDelta: goal ? round(-(goal.plan.initialRateKgPerWeek * elapsed) / 7, 2) : null,
      bodyFatStart: be[0]?.bodyFatPct ?? null,
      bodyFatEnd: be[be.length - 1]?.bodyFatPct ?? null,
      waistStart: be[0]?.waistCm ?? null,
      waistEnd: be[be.length - 1]?.waistCm ?? null,
      weighInDays: wi.length,
      hasMeasurement: be.length > 0,
    },
    training: {
      sessions: sessions.length,
      plannedSessions: 4,
      offDays,
      sets: sessions.reduce((a, l) => a + l.strength.reduce((b, s) => b + s.sets.length, 0), 0),
      cardioKm: round(sessions.reduce((a, l) => a + (l.run?.totalKm ?? 0), 0), 1),
      volumeByMuscle: [...weeklyVolume(logs, weekKey)],
    },
    goalDistance: progress
      ? { kgToGo: progress.kgToGo, bfToGo: progress.bfToGo, weeksRemainingPlan: progress.weeksRemainingPlan, weeksRemainingProjected: progress.weeksRemainingProjected, percentComplete: progress.percentComplete, onTrack: progress.onTrack, projectedDate: progress.projectedDate }
      : null,
    score,
    highlights: [
      `${sessions.length} antrenman tamamlandı`,
      `${loggedDays.length} gün beslenme kaydı`,
      banked > 0 ? `${banked.toLocaleString("tr-TR")} kcal ekside kaldın` : "Henüz kalori açığı yok",
    ],
    mascot,
  };
}

export function summarizeReport(r: WeeklyReportDTO): WeeklyReportSummary {
  return {
    weekKey: r.weekKey,
    score: r.score,
    avgKcal: r.nutrition.avgKcal,
    daysLogged: r.nutrition.daysLogged,
    deficitBankedKcal: r.nutrition.deficitBankedKcal,
    ewmaDelta: r.body.ewmaDelta,
    sessions: r.training.sessions,
    bodyFatEnd: r.body.bodyFatEnd,
    weightEnd: r.body.weightEnd,
    onTrack: r.goalDistance?.onTrack ?? null,
  };
}

/* --------------------------------- home -------------------------------- */

export function makeHome(opts: { today: string; user: UserDTO; programView: ProgramView; recovery: RecoveryView; dayView: NutritionDayView; goal: GoalProgress | null; weighedIn: boolean; report: WeeklyReportDTO; mascot: HomeDTO["mascot"] }): HomeDTO {
  const { today, user, programView, recovery, dayView, goal, weighedIn, report, mascot } = opts;
  return {
    user,
    today: {
      dateKey: today,
      weekday: keyWeekday(today),
      workout: { day: programView.current.day, log: programView.todayLog, programName: programView.program.name },
      calories: { target: dayView.target.calories, eaten: dayView.totals.kcal, remaining: dayView.remaining.kcal },
      protein: { target: dayView.target.protein, eaten: dayView.totals.protein },
      weighedIn,
    },
    recovery: {
      readiness: recovery.overall.readiness,
      status: recovery.overall.status,
      readyCount: recovery.overall.readyCount,
      fatiguedCount: recovery.overall.fatiguedCount,
      top: [...recovery.muscles].sort((a, b) => a.readiness - b.readiness).slice(0, 3).map((m) => ({ key: m.key, name: m.name, readiness: m.readiness, status: m.status, color: m.color })),
    },
    goal,
    week: { weekKey: report.weekKey, dayIndex: report.dayIndexToday ?? 0, deficitBankedKcal: report.nutrition.deficitBankedKcal, deficitPlannedKcal: report.nutrition.deficitPlannedKcal, onTrack: goal?.onTrack ?? null, score: report.score },
    streaks: { workout: 3, logging: 6, weighIn: weighedIn ? 5 : 4 },
    mascot,
  };
}

import type { MuscleReadiness, MuscleVolume, ScheduleEntry, WorkoutLogDTO } from "@fitfloow/core";
import {
  compareToLast,
  dayCounts,
  findLastSameDay,
  groupLogsByWeek,
  keyMuscles,
  lastPerformanceLabel,
  logSummary,
  recoveryCurve,
  RECOVERY_TR,
  stripItems,
  VOLUME_TR,
  volumeBars,
  weekLabel,
} from "./present";

function entry(p: Partial<ScheduleEntry>): ScheduleEntry {
  return { dateKey: "2026-09-10", weekday: 4, isToday: false, day: null, status: "upcoming", logId: null, ...p };
}

describe("stripItems", () => {
  const schedule: ScheduleEntry[] = [
    entry({ dateKey: "2026-09-08", weekday: 2, status: "done", logId: "l1" }),
    entry({ dateKey: "2026-09-09", weekday: 3, status: "skipped", logId: "l2" }),
    entry({ dateKey: "2026-09-10", weekday: 4, status: "today", isToday: true }),
    entry({ dateKey: "2026-09-11", weekday: 5, status: "upcoming" }),
    entry({ dateKey: "2026-09-12", weekday: 6, status: "past" }),
  ];

  test("maps each entry to a labelled, toned item and marks today as selected", () => {
    const items = stripItems(schedule);
    expect(items.map((i) => i.label)).toEqual(["Sal", "Çar", "Per", "Cum", "Cmt"]);
    expect(items.map((i) => i.tone)).toEqual(["success", "warning", "primary", "neutral", "neutral"]);
    expect(items[2].isToday).toBe(true);
    expect(items[2].selected).toBe(true);
    expect(items.filter((i) => i.selected)).toHaveLength(1);
  });

  test("day numbers come from the date key", () => {
    expect(stripItems(schedule).map((i) => i.dayNumber)).toEqual([8, 9, 10, 11, 12]);
  });

  test("accessibility labels describe the day and its state", () => {
    const [done, skipped, today] = stripItems(schedule);
    expect(done.a11y).toContain("Tamamlandı");
    expect(skipped.a11y).toContain("Atlandı");
    expect(today.a11y).toContain("Bugün");
  });

  test("an empty schedule yields no items", () => {
    expect(stripItems([])).toEqual([]);
  });
});

describe("volumeBars", () => {
  const volume: MuscleVolume[] = [
    { key: "chest", name: "Göğüs", done: 6, target: { min: 10, max: 20 }, status: "under" },
    { key: "back", name: "Sırt", done: 14, target: { min: 10, max: 20 }, status: "in" },
    { key: "quads", name: "Ön bacak", done: 24, target: { min: 10, max: 18 }, status: "over" },
    { key: "core", name: "Karın", done: 0, target: { min: 6, max: 12 }, status: "none" },
  ];

  const byKey = (key: string) => volumeBars(volume).find((b) => b.key === key)!;

  test("value is done vs the max target, clamped to 1", () => {
    expect(byKey("chest").value).toBeCloseTo(0.3);
    expect(byKey("back").value).toBeCloseTo(0.7);
    expect(byKey("quads").value).toBe(1);
    expect(byKey("core").value).toBe(0);
  });

  test("tones follow the under / in / over semantics", () => {
    expect(byKey("chest").tone).toBe("primary");
    expect(byKey("back").tone).toBe("success");
    expect(byKey("quads").tone).toBe("warning");
    expect(byKey("core").tone).toBe("neutral");
    expect(VOLUME_TR.under).toBe("Az");
    expect(VOLUME_TR.in).toBe("Yeterli");
  });

  test("muscles with no target are not divided by zero", () => {
    const bars = volumeBars([{ key: "x", name: "X", done: 4, target: { max: 0 }, status: "none" }]);
    expect(bars[0].value).toBe(0);
  });

  test("sorts the busiest muscles first so the mini-bars read top-down", () => {
    expect(volumeBars(volume).map((b) => b.key)).toEqual(["quads", "back", "chest", "core"]);
  });
});

describe("groupLogsByWeek", () => {
  const log = (dateKey: string, over: Partial<WorkoutLogDTO> = {}): WorkoutLogDTO => ({
    id: `l-${dateKey}`,
    date: `${dateKey}T15:00:00.000Z`,
    dateKey,
    dayId: null,
    dayOrder: 1,
    cycleNumber: 6,
    weekNumber: 6,
    isBreak: false,
    title: "Üst Vücut A",
    kind: "strength",
    isOffDay: false,
    strength: [
      { name: "Bench", muscles: [{ key: "chest", load: 1 }], plannedSets: 3, plannedReps: 8, plannedRIR: 2, source: "planned", skipped: false, metric: "reps", sets: [{ reps: 8, rir: 2, weightKg: null }, { reps: 7, rir: 1, weightKg: null }] },
    ],
    run: null,
    swim: null,
    durationMin: 52,
    notes: null,
    rpe: 7,
    ...over,
  });

  test("groups newest-first into week sections aligned to the measurement day", () => {
    const logs = [log("2026-09-10"), log("2026-09-08"), log("2026-09-05"), log("2026-09-02")];
    const sections = groupLogsByWeek(logs, 0, "2026-09-10"); // weeks start on Sunday
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("Bu hafta");
    expect(sections[0].logs.map((l) => l.dateKey)).toEqual(["2026-09-10", "2026-09-08"]);
    expect(sections[1].title).toBe("Geçen hafta");
    expect(sections[1].logs.map((l) => l.dateKey)).toEqual(["2026-09-05", "2026-09-02"]);
  });

  test("older weeks get a date-range title and a session count", () => {
    const sections = groupLogsByWeek([log("2026-08-12")], 0, "2026-09-10");
    expect(sections[0].title).toMatch(/Ağustos/);
    expect(sections[0].count).toBe(1);
  });

  test("flattens to alternating header / log rows for the list", () => {
    const rows = groupLogsByWeek([log("2026-09-10"), log("2026-09-05")], 0, "2026-09-10").flatMap((s) => [
      { type: "header" as const, ...s },
      ...s.logs.map((l) => ({ type: "log" as const, log: l })),
    ]);
    expect(rows.map((r) => r.type)).toEqual(["header", "log", "header", "log"]);
  });

  test("no logs → no sections", () => {
    expect(groupLogsByWeek([], 0, "2026-09-10")).toEqual([]);
  });

  test("weekLabel is relative for the current and previous week only", () => {
    expect(weekLabel("2026-09-06", "2026-09-06")).toBe("Bu hafta");
    expect(weekLabel("2026-08-30", "2026-09-06")).toBe("Geçen hafta");
    expect(weekLabel("2026-08-23", "2026-09-06")).toMatch(/–/);
  });

  test("logSummary counts sets, muscles and rest days", () => {
    const s = logSummary(log("2026-09-10"));
    expect(s.sets).toBe(2);
    expect(s.muscles).toEqual([{ key: "chest", sets: 2 }]);
    expect(s.duration).toBe(52);
    expect(s.isOffDay).toBe(false);

    const off = logSummary(log("2026-09-09", { isOffDay: true, strength: [], durationMin: null }));
    expect(off.sets).toBe(0);
    expect(off.isOffDay).toBe(true);
  });

  test("logSummary reports cardio distance", () => {
    const s = logSummary(log("2026-09-11", { kind: "run", strength: [], run: { segments: [{ km: 5, min: 28 }], totalKm: 5, totalMin: 28, targetKm: 5, targetMin: 30 } }));
    expect(s.km).toBe(5);
    expect(s.pace).toBeCloseTo(5.6);
  });
});

describe("dayCounts", () => {
  test("summarises a strength day as exercises and sets", () => {
    expect(
      dayCounts({
        id: "d1",
        order: 1,
        title: "Üst",
        focus: "",
        kind: "strength",
        exercises: [
          { name: "a", muscles: [], targetSets: 3, targetReps: 8, targetRIR: 2, metric: "reps" },
          { name: "b", muscles: [], targetSets: 4, targetReps: 8, targetRIR: 2, metric: "reps" },
        ],
        run: null,
        swim: null,
      })
    ).toEqual({ exercises: 2, sets: 7, km: 0, min: 0, estimateMin: 18 });
  });

  test("summarises a cardio day as km and minutes", () => {
    expect(dayCounts({ id: "d3", order: 3, title: "Koşu", focus: "", kind: "run", exercises: [], run: { targetKm: 5, targetMin: 30, label: "" }, swim: null })).toEqual({
      exercises: 0,
      sets: 0,
      km: 5,
      min: 30,
      estimateMin: 30,
    });
  });
});

describe("recoveryCurve", () => {
  const muscle = (over: Partial<MuscleReadiness> = {}): MuscleReadiness => ({
    key: "chest",
    name: "Göğüs",
    short: "Göğüs",
    size: "large",
    color: "#F97316",
    fullRecoveryHours: 48,
    readiness: 60,
    status: "recovering",
    lastTrainedAt: "2026-09-09T15:00:00.000Z",
    hoursSince: 24,
    hoursToFull: 24,
    residualSets: 3,
    weeklySets: 12,
    weeklyTarget: { min: 10, max: 20 },
    ...over,
  });

  test("draws the 0 → 70 → 100 curve across the full recovery window", () => {
    const points = recoveryCurve(muscle());
    expect(points[0]).toBe(0);
    expect(points[points.length - 1]).toBe(100);
    expect(points[Math.floor((points.length - 1) / 2)]).toBeCloseTo(70, 0);
    expect(points.every((p, i) => i === 0 || p >= points[i - 1])).toBe(true);
  });

  test("a never-trained muscle is flat at 100", () => {
    expect(recoveryCurve(muscle({ lastTrainedAt: null, hoursSince: null, readiness: 100 }))).toEqual([100, 100]);
  });

  test("status tone and Turkish label come from one map", () => {
    expect(RECOVERY_TR.ready.label).toBe("Hazır");
    expect(RECOVERY_TR.fatigued.tone).toBe("danger");
  });
});

describe("tonnage and the last-session comparison", () => {
  const log = (dateKey: string, over: Partial<WorkoutLogDTO> = {}): WorkoutLogDTO => ({
    id: `l-${dateKey}`,
    date: `${dateKey}T15:00:00.000Z`,
    dateKey,
    dayId: null,
    dayOrder: 1,
    cycleNumber: 6,
    weekNumber: 6,
    isBreak: false,
    title: "Üst Vücut A",
    kind: "strength",
    isOffDay: false,
    strength: [],
    run: null,
    swim: null,
    durationMin: 52,
    notes: null,
    rpe: 7,
    ...over,
  });

  /**
   * A logged exercise. Omitting `weightKg` reproduces a pre-2.1 payload, which the current DTO type
   * cannot express — hence the one cast: the whole point is that such logs still arrive from the API.
   */
  const lifted = (sets: { reps: number; weightKg?: number | null }[]): WorkoutLogDTO["strength"] =>
    [
      {
        name: "Bench",
        muscles: [{ key: "chest", load: 1 }],
        plannedSets: 3,
        plannedReps: 8,
        plannedRIR: 2,
        source: "planned" as const,
        skipped: false,
        metric: "reps" as const,
        sets: sets.map((s) => ({ reps: s.reps, rir: null, ...(s.weightKg === undefined ? {} : { weightKg: s.weightKg }) })),
      },
    ] as unknown as WorkoutLogDTO["strength"];

  test("logSummary adds Σ reps × kg", () => {
    const s = logSummary(log("2026-09-10", { strength: lifted([{ reps: 8, weightKg: 60 }, { reps: 6, weightKg: 60 }]) }));
    expect(s.tonnageKg).toBe(840);
    expect(s.sets).toBe(2);
  });

  test("a pre-2.1 log with no weightKg reads as zero tonnage, not a crash", () => {
    const s = logSummary(log("2026-09-10", { strength: lifted([{ reps: 8 }, { reps: 8 }]) }));
    expect(s.tonnageKg).toBe(0);
    expect(s.sets).toBe(2);
  });

  test("a skipped exercise contributes nothing", () => {
    const strength = lifted([{ reps: 8, weightKg: 60 }]).map((e) => ({ ...e, skipped: true, sets: [] }));
    expect(logSummary(log("2026-09-10", { strength })).tonnageKg).toBe(0);
  });

  test("findLastSameDay picks the newest earlier log of the same cycle day", () => {
    const logs = [
      log("2026-09-10"),
      log("2026-09-07", { id: "wrong-day", dayOrder: 2 }),
      log("2026-09-03", { id: "match" }),
      log("2026-08-27", { id: "older" }),
      log("2026-09-05", { id: "off", isOffDay: true }),
    ];
    expect(findLastSameDay(logs, 1, "2026-09-10")?.id).toBe("match");
    expect(findLastSameDay(logs, 9, "2026-09-10")).toBeNull();
    expect(findLastSameDay([], 1, "2026-09-10")).toBeNull();
  });

  test("findLastSameDay follows the day id when both sides have one (a reordered day keeps its history)", () => {
    const logs = [
      log("2026-09-07", { id: "moved", dayId: "d1", dayOrder: 3 }),
      log("2026-09-05", { id: "other", dayId: "d2", dayOrder: 1 }),
      log("2026-09-03", { id: "legacy", dayId: null, dayOrder: 1 }),
    ];
    expect(findLastSameDay(logs, 1, "2026-09-10", "d1")?.id).toBe("moved");
    // A legacy log (no id) still matches by order.
    expect(findLastSameDay(logs.slice(1), 1, "2026-09-10", "d1")?.id).toBe("legacy");
  });

  test("the comparison says how much more you moved", () => {
    const previous = log("2026-09-03", { strength: lifted([{ reps: 8, weightKg: 60 }]) }); // 480
    const c = compareToLast({ tonnageKg: 800, sets: 3 }, previous);
    expect(c.previousDateKey).toBe("2026-09-03");
    expect(c.deltaKg).toBe(320);
    expect(c.deltaSets).toBe(2);
    expect(c.summaryTr).toBe("Geçen seferden 320 kg fazla kaldırdın.");
  });

  test("moving less is stated plainly, without a verdict", () => {
    const previous = log("2026-09-03", { strength: lifted([{ reps: 10, weightKg: 60 }]) }); // 600
    expect(compareToLast({ tonnageKg: 420, sets: 1 }, previous).summaryTr).toBe("Geçen seferin 180 kg altında kaldın.");
  });

  test("the same tonnage reads as the same tonnage", () => {
    const previous = log("2026-09-03", { strength: lifted([{ reps: 8, weightKg: 60 }]) });
    expect(compareToLast({ tonnageKg: 480, sets: 1 }, previous).summaryTr).toBe("Geçen seferle aynı hacim: 480 kg.");
  });

  test("a bodyweight day compares sets instead of kilos", () => {
    const previous = log("2026-09-03", { strength: lifted([{ reps: 12 }, { reps: 12 }]) });
    expect(compareToLast({ tonnageKg: 0, sets: 4 }, previous).summaryTr).toBe("Geçen seferden 2 set fazla.");
    expect(compareToLast({ tonnageKg: 0, sets: 2 }, previous).summaryTr).toBe("Geçen seferle aynı: 2 set.");
  });

  test("the first session of a cycle day has nothing to compare to", () => {
    const c = compareToLast({ tonnageKg: 800, sets: 3 }, null);
    expect(c.previousDateKey).toBeNull();
    expect(c.deltaKg).toBe(0);
    expect(c.summaryTr).toBe("Bu günün ilk kaydı — bundan sonrası buna göre ölçülecek.");
  });
});

describe("lastPerformanceLabel", () => {
  test("reads back last session's sets", () => {
    expect(
      lastPerformanceLabel({
        dateKey: "2026-09-03",
        sets: [
          { reps: 8, rir: 2, weightKg: 60 },
          { reps: 8, rir: 1, weightKg: 60 },
          { reps: 6, rir: 0, weightKg: 60 },
        ],
      })
    ).toBe("60 kg × 8, 8, 6");
  });

  test("mixed loads are spelled out per set", () => {
    expect(lastPerformanceLabel({ dateKey: "2026-09-03", sets: [{ reps: 8, rir: null, weightKg: 60 }, { reps: 6, rir: null, weightKg: 65 }] })).toBe("60×8, 65×6 kg");
  });

  test("bodyweight sets read as reps only", () => {
    expect(lastPerformanceLabel({ dateKey: "2026-09-03", sets: [{ reps: 12, rir: null, weightKg: null }, { reps: 10, rir: null, weightKg: null }] })).toBe("12, 10 tekrar");
  });

  test("nothing logged → nothing to say", () => {
    expect(lastPerformanceLabel({ dateKey: null, sets: [] })).toBeNull();
    expect(lastPerformanceLabel(null)).toBeNull();
  });
});

describe("keyMuscles", () => {
  const m = (key: string, load: number) => ({ key, load });

  test("keeps the muscles the movement trains, heaviest first", () => {
    const pushUp = [m("triceps", 0.6), m("chest", 1), m("frontDelts", 0.7), m("biceps", 0.15), m("quads", 0.1), m("abs", 0.35)];
    expect(keyMuscles(pushUp).map((x) => x.key)).toEqual(["chest", "frontDelts", "triceps"]);
  });

  test("never names more than four", () => {
    const all = ["a", "b", "c", "d", "e", "f"].map((k) => m(k, 1));
    expect(keyMuscles(all)).toHaveLength(4);
  });

  test("falls back to the single heaviest when nothing reaches half a set", () => {
    expect(keyMuscles([m("abs", 0.3), m("obliques", 0.4)]).map((x) => x.key)).toEqual(["obliques"]);
    expect(keyMuscles([])).toEqual([]);
  });
});

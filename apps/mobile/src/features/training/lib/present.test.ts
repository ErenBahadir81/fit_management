import type { MuscleReadiness, MuscleVolume, ScheduleEntry, WorkoutLogDTO } from "@fitfloow/core";
import {
  dayCounts,
  groupLogsByWeek,
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
    dayOrder: 1,
    weekNumber: 6,
    title: "Üst Vücut A",
    kind: "strength",
    isOffDay: false,
    strength: [
      { name: "Bench", muscles: [{ key: "chest", load: 1 }], plannedSets: 3, plannedReps: 8, plannedRIR: 2, source: "planned", skipped: false, metric: "reps", sets: [{ reps: 8, rir: 2 }, { reps: 7, rir: 1 }] },
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
    expect(dayCounts({ order: 3, title: "Koşu", focus: "", kind: "run", exercises: [], run: { targetKm: 5, targetMin: 30, label: "" }, swim: null })).toEqual({
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

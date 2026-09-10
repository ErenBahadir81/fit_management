import { describe, expect, it } from "vitest";
import { zMuscleReadiness, zMuscleVolume, zRecoveryView, zScheduleEntry, zTrainingStats } from "../schemas/index";
import { computeReadiness, computeRecovery } from "./recovery";
import { weeklyVolume } from "./volume";
import { buildSchedule } from "./schedule";
import { buildTrainingStats } from "./stats";
import { EREN_DAYS, TEST_MUSCLES } from "./fixtures";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const TODAY = "2026-09-10";
const logs = [
  {
    id: "6516f0000000000000000001",
    date: "2026-09-10T08:00:00.000Z",
    dateKey: TODAY,
    dayOrder: 1,
    isOffDay: false,
    strength: [{ name: "Push-up", muscles: [{ key: "chest", load: 1 }], sets: [{ reps: 12, rir: 2 }, { reps: 10, rir: 1 }] }],
    run: null,
    swim: null,
  },
];

describe("engine output ↔ zod DTO contract", () => {
  it("computeReadiness rows validate as MuscleReadiness", () => {
    for (const row of computeReadiness([], TEST_MUSCLES, NOW)) expect(() => zMuscleReadiness.parse(row)).not.toThrow();
  });

  it("computeRecovery validates as RecoveryView", () => {
    expect(() => zRecoveryView.parse(computeRecovery(logs, TEST_MUSCLES, NOW))).not.toThrow();
  });

  it("weeklyVolume rows validate as MuscleVolume", () => {
    for (const row of weeklyVolume(logs, TEST_MUSCLES, NOW)) expect(() => zMuscleVolume.parse(row)).not.toThrow();
  });

  it("buildSchedule entries validate as ScheduleEntry", () => {
    for (const e of buildSchedule({ days: EREN_DAYS, currentIndex: 1, weekNumber: 1 }, logs, TODAY)) {
      expect(() => zScheduleEntry.parse(e)).not.toThrow();
    }
  });

  it("buildTrainingStats validates as TrainingStats", () => {
    const stats = buildTrainingStats({ logs, muscles: TEST_MUSCLES, weeks: 4, measurementDay: 0, todayKey: TODAY });
    expect(() => zTrainingStats.parse(stats)).not.toThrow();
  });
});

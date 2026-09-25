/**
 * T8 — the first program a new account gets, sized from two onboarding answers: how many days a
 * week they can train and how long they have been training.
 *
 * Deliberately small and editable, not a coach: a 7-day cycle (so "next = the day after the last
 * one done" keeps working when life gets in the way), the training days spread through the week
 * with rest days between, and only exercises from the seed catalog's original twenty (so every
 * name resolves to its muscles when the API normalises it). Muscles are left out on purpose; the
 * catalog is their single source.
 */
import type { TrainingExperience } from "../schemas/onboarding";
import type { TrainingLevel } from "../schemas/goal";
import type { ProgramInput } from "../schemas/program";

/** none / < 1 y → beginner, 1–3 y → intermediate, 3 y + → advanced (docs/plan/11, T7 contract). */
export function trainingLevelForExperience(experience: TrainingExperience): TrainingLevel {
  if (experience === "overThree") return "advanced";
  if (experience === "oneToThree") return "intermediate";
  return "beginner";
}

export interface StarterProgramInput {
  /** 2–6; clamped. */
  daysPerWeek: number;
  level: TrainingLevel;
}

type Slot = "squat" | "hinge" | "singleLeg" | "calf" | "hPush" | "vPush" | "fly" | "dip" | "hPull" | "vPull" | "shrug" | "lateral" | "core" | "coreB";
type Exercise = ProgramInput["days"][number]["exercises"][number];

/** Exercise per movement slot and level. Every name here exists in the v1 seed catalog. */
const SLOT: Record<Slot, Record<TrainingLevel, { name: string; time?: boolean }>> = {
  squat: { beginner: { name: "Squat" }, intermediate: { name: "Squat" }, advanced: { name: "Squat" } },
  hinge: { beginner: { name: "Wall Sit", time: true }, intermediate: { name: "Lunge" }, advanced: { name: "Pistol Squat" } },
  singleLeg: { beginner: { name: "Lunge" }, intermediate: { name: "Lunge" }, advanced: { name: "Pistol Squat" } },
  calf: { beginner: { name: "Calf Raise" }, intermediate: { name: "Calf Raise" }, advanced: { name: "Calf Raise" } },
  hPush: { beginner: { name: "Push-up" }, intermediate: { name: "Push-up" }, advanced: { name: "Dips" } },
  vPush: { beginner: { name: "Pike Push-up" }, intermediate: { name: "Pike Push-up" }, advanced: { name: "HSPU" } },
  fly: { beginner: { name: "DB Fly" }, intermediate: { name: "DB Fly" }, advanced: { name: "DB Fly" } },
  dip: { beginner: { name: "Push-up" }, intermediate: { name: "Dips" }, advanced: { name: "Dips" } },
  hPull: { beginner: { name: "Row" }, intermediate: { name: "Row" }, advanced: { name: "Row" } },
  vPull: { beginner: { name: "Row" }, intermediate: { name: "Pull-up" }, advanced: { name: "Pull-up" } },
  shrug: { beginner: { name: "Shrug" }, intermediate: { name: "Shrug" }, advanced: { name: "Shrug" } },
  lateral: { beginner: { name: "Lateral Raise" }, intermediate: { name: "Lateral Raise" }, advanced: { name: "Lateral Raise" } },
  core: { beginner: { name: "Plank", time: true }, intermediate: { name: "Hollow Hold", time: true }, advanced: { name: "Hollow Hold", time: true } },
  coreB: { beginner: { name: "Leg Raises" }, intermediate: { name: "Leg Raises" }, advanced: { name: "Leg Raises" } },
};

/** Big multi-joint slots get the extra set first. */
const COMPOUND: ReadonlySet<Slot> = new Set(["squat", "hinge", "singleLeg", "hPush", "vPush", "dip", "hPull", "vPull"]);

export const STARTER_EXERCISE_NAMES: readonly string[] = [
  ...new Set(Object.values(SLOT).flatMap((byLevel) => Object.values(byLevel).map((e) => e.name))),
];

function exercise(slot: Slot, level: TrainingLevel): Exercise {
  const e = SLOT[slot][level];
  const compound = COMPOUND.has(slot);
  const targetSets = level === "beginner" ? 3 : level === "advanced" ? 4 : compound ? 4 : 3;
  if (e.time) {
    return { name: e.name, targetSets, targetReps: level === "beginner" ? 30 : level === "intermediate" ? 40 : 45, targetRIR: null, metric: "time" };
  }
  const targetReps = compound ? (level === "advanced" ? 8 : 10) : slot === "calf" ? 15 : 12;
  return { name: e.name, targetSets, targetReps, targetRIR: 2, metric: "reps" };
}

interface DayPlan {
  title: string;
  focus: string;
  slots: Slot[];
}

const FULL_A: DayPlan = { title: "Tüm Vücut A", focus: "Squat · İtiş · Çekiş", slots: ["squat", "hPush", "hPull", "core"] };
const FULL_B: DayPlan = { title: "Tüm Vücut B", focus: "Tek bacak · Omuz · Çekiş", slots: ["singleLeg", "vPush", "vPull", "coreB"] };
const FULL_C: DayPlan = { title: "Tüm Vücut C", focus: "Squat · Göğüs · Sırt", slots: ["squat", "dip", "hPull", "lateral"] };
const UPPER_A: DayPlan = { title: "Üst Vücut A", focus: "Göğüs · Sırt · Yan omuz", slots: ["hPush", "hPull", "lateral", "core"] };
const UPPER_B: DayPlan = { title: "Üst Vücut B", focus: "Omuz · Çekiş · Göğüs", slots: ["vPush", "vPull", "fly", "shrug"] };
const LOWER_A: DayPlan = { title: "Alt Vücut A", focus: "Squat · Baldır · Karın", slots: ["squat", "singleLeg", "calf", "coreB"] };
const LOWER_B: DayPlan = { title: "Alt Vücut B", focus: "Tek bacak · Dayanıklılık", slots: ["hinge", "squat", "calf", "core"] };
const PUSH: DayPlan = { title: "İtiş", focus: "Göğüs · Omuz · Triceps", slots: ["hPush", "vPush", "fly", "lateral"] };
const PULL: DayPlan = { title: "Çekiş", focus: "Sırt · Trapez · Karın", slots: ["vPull", "hPull", "shrug", "coreB"] };
const LEGS: DayPlan = { title: "Bacak", focus: "Squat · Tek bacak · Baldır", slots: ["squat", "singleLeg", "calf", "core"] };
const PUSH_B: DayPlan = { ...PUSH, title: "İtiş B", slots: ["dip", "vPush", "lateral", "core"] };
const PULL_B: DayPlan = { ...PULL, title: "Çekiş B", slots: ["hPull", "vPull", "shrug", "core"] };
const LEGS_B: DayPlan = { ...LEGS, title: "Bacak B", slots: ["hinge", "squat", "calf", "coreB"] };

/** Which weekday slots of the 7-day cycle train (1) and rest (0), and the split name. */
const WEEK: Record<number, { name: string; pattern: number[]; days: DayPlan[] }> = {
  2: { name: "Tüm Vücut · 2 gün", pattern: [1, 0, 0, 1, 0, 0, 0], days: [FULL_A, FULL_B] },
  3: { name: "Tüm Vücut · 3 gün", pattern: [1, 0, 1, 0, 1, 0, 0], days: [FULL_A, FULL_B, FULL_C] },
  4: { name: "Üst / Alt · 4 gün", pattern: [1, 1, 0, 1, 1, 0, 0], days: [UPPER_A, LOWER_A, UPPER_B, LOWER_B] },
  5: { name: "İt / Çek / Bacak + Üst / Alt · 5 gün", pattern: [1, 1, 1, 0, 1, 1, 0], days: [PUSH, PULL, LEGS, UPPER_A, LOWER_A] },
  6: { name: "İt / Çek / Bacak · 6 gün", pattern: [1, 1, 1, 0, 1, 1, 1], days: [PUSH, PULL, LEGS, PUSH_B, PULL_B, LEGS_B] },
};

export function starterProgram(input: StarterProgramInput): ProgramInput & { name: string; mode: "cycle" } {
  const n = Math.min(6, Math.max(2, Math.round(Number.isFinite(input.daysPerWeek) ? input.daysPerWeek : 3)));
  const week = WEEK[n];
  let next = 0;
  const days = week.pattern.map((train, i) => {
    const base = { order: i + 1, run: null, swim: null };
    if (!train) return { ...base, title: "Dinlenme", focus: "Toparlan, yürüyüş serbest", kind: "rest" as const, exercises: [] };
    const plan = week.days[next++];
    return { ...base, title: plan.title, focus: plan.focus, kind: "strength" as const, exercises: plan.slots.map((s) => exercise(s, input.level)) };
  });
  return { name: week.name, mode: "cycle", days };
}

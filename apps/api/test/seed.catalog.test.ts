import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { exerciseNameKey } from "@fitfloow/core";
import { SEED_EXERCISES, SEED_TEMPLATES } from "../src/seed/data/index";
import { EXERCISE_ACTIVATION_V1 } from "../src/seed/data/exerciseActivation.v1";
import { MUSCLE_KEYS_V3 } from "../src/seed/data/muscles";
import { LEGACY_V1_EXERCISE_MUSCLES } from "../src/seed/catalogActivationV1";

const bySeedName = new Map(SEED_EXERCISES.map((e) => [exerciseNameKey(e.name), e]));
const seed = (name: string) => {
  const found = bySeedName.get(exerciseNameKey(name));
  if (!found) throw new Error(`${name} is not in SEED_EXERCISES`);
  return found;
};
const load = (name: string, key: string) => seed(name).muscles.find((m) => m.key === key)?.load ?? 0;

describe("activation v1 generated data", () => {
  it("is exactly what the evidence file produces (never hand-edited)", () => {
    const script = fileURLToPath(new URL("../scripts/build-activation-seed.mjs", import.meta.url));
    expect(() => execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" })).not.toThrow();
  });
});

describe("SEED_EXERCISES (derived from EXERCISE_ACTIVATION_V1)", () => {
  it("carries every activation row once, with a stable slug", () => {
    expect(SEED_EXERCISES).toHaveLength(EXERCISE_ACTIVATION_V1.length);
    expect(SEED_EXERCISES).toHaveLength(143);
    expect(new Set(SEED_EXERCISES.map((e) => e.slug)).size).toBe(143);
    expect(new Set(SEED_EXERCISES.map((e) => exerciseNameKey(e.name))).size).toBe(143);
    const row = EXERCISE_ACTIVATION_V1.find((r) => r.slug === "barbell-bench-press")!;
    expect(seed("Barbell Bench Press")).toMatchObject({
      slug: "barbell-bench-press",
      kind: row.kind,
      metric: row.metric,
      defaultSets: row.defaultSets,
      defaultReps: row.defaultReps,
      equipment: row.equipment,
      instructions: row.instructions,
      muscles: row.muscles.map(({ key, load: l }) => ({ key, load: l })),
    });
  });

  it("keeps every legacy (v1) exercise name, so existing programs still resolve", () => {
    expect(Object.keys(LEGACY_V1_EXERCISE_MUSCLES)).toHaveLength(20);
    for (const name of Object.keys(LEGACY_V1_EXERCISE_MUSCLES)) expect(seed(name).name).toBe(name);
  });

  it("uses only the 17 active muscle keys, with loads in (0, 1] on the 0.05 grid", () => {
    for (const e of SEED_EXERCISES) {
      expect(new Set(e.muscles.map((m) => m.key)).size).toBe(e.muscles.length);
      for (const m of e.muscles) {
        expect(MUSCLE_KEYS_V3).toContain(m.key);
        expect(m.load).toBeGreaterThan(0);
        expect(m.load).toBeLessThanOrEqual(1);
        expect(Math.round(m.load * 20) / 20).toBe(m.load);
        expect(Object.keys(m).sort()).toEqual(["key", "load"]);
      }
    }
  });

  it("counts muscles only for strength work: cardio, conditioning and mobility carry none", () => {
    for (const e of SEED_EXERCISES) {
      if (e.kind === "strength") expect(e.muscles.length, e.name).toBeGreaterThan(0);
      else expect(e.muscles, e.name).toEqual([]);
    }
    for (const name of ["Burpee", "Running", "Cycling", "Rowing Machine", "Jump Rope", "Swimming", "Stretch", "Mobility", "Sled Push"])
      expect(seed(name).muscles, name).toEqual([]);
  });

  it("holds the reviewed values (docs/plan/12 §4.4 item 2)", () => {
    expect(load("Muscle-up", "chest")).toBe(0.75);
    expect(load("Muscle-up", "lats")).toBe(1);
    expect(load("Cable Glute Kickback", "hamstrings")).toBe(0.65);
    expect(load("Jump Squat", "quads")).toBe(0.75);
    expect(load("Box Jump", "quads")).toBe(0.75);
    expect(seed("Sled Push").kind).toBe("cardio");
    expect(load("Pallof Press", "obliques")).toBe(0.75);
    expect(load("Cable Curl", "forearms")).toBe(0.65);
  });
});

describe("SEED_TEMPLATES", () => {
  it("take every exercise's muscles from SEED_EXERCISES by name — no `legs` anywhere", () => {
    let checked = 0;
    for (const template of SEED_TEMPLATES) {
      for (const day of template.days) {
        for (const ex of day.exercises) {
          expect(ex.muscles, `${template.name} / ${ex.name}`).toEqual(seed(ex.name).muscles);
          expect((ex.muscles ?? []).some((m) => m.key === "legs")).toBe(false);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(JSON.stringify(SEED_EXERCISES)).not.toContain('"legs"');
    expect(JSON.stringify(SEED_TEMPLATES)).not.toContain('"legs"');
  });
});

import { programVolume, volumeAdvice, type ExerciseDTO, type VolumeAdvice } from "@fitfloow/core";
import {
  adviceBand,
  fmtSets,
  needsMore,
  newVolumeAlerts,
  plannedRows,
  suggestExercise,
  VOLUME_AXIS_MAX,
  VOLUME_GUIDES,
  VOLUME_RAMP_INPUT,
  volumeFraction,
  volumeRampOutput,
  volumeWord,
} from "./volume";

const ex = (id: string, name: string, muscles: Record<string, number>, extra: Partial<ExerciseDTO> = {}): ExerciseDTO => ({
  id,
  name,
  muscles: Object.entries(muscles).map(([key, load]) => ({ key, load })),
  defaultSets: 3,
  defaultReps: 10,
  metric: "reps",
  kind: "strength",
  equipment: [],
  instructions: "",
  active: true,
  ...extra,
});

const advice = (key: string, weekly: number): VolumeAdvice => volumeAdvice(key, key, weekly)!;

describe("volume presentation", () => {
  test("the axis runs 0..25 and pins beyond it", () => {
    expect(volumeFraction(0)).toBe(0);
    expect(volumeFraction(12.5)).toBe(0.5);
    expect(volumeFraction(40)).toBe(1);
    expect(volumeFraction(-3)).toBe(0);
    expect(volumeFraction(Number.NaN)).toBe(0);
    expect(VOLUME_GUIDES.recommended).toEqual({ from: 10 / VOLUME_AXIS_MAX, to: 15 / VOLUME_AXIS_MAX });
    expect(VOLUME_GUIDES.ticks.map((t) => t.sets)).toEqual([5, 10, 15, 20]);
  });

  test("the colour ramp is anchored on the bands and strictly increasing (so it blends, never steps)", () => {
    expect(VOLUME_RAMP_INPUT[0]).toBe(0);
    expect(VOLUME_RAMP_INPUT).toContain(5);
    expect(VOLUME_RAMP_INPUT).toContain(10);
    expect(VOLUME_RAMP_INPUT.at(-1)).toBe(VOLUME_AXIS_MAX);
    for (let i = 1; i < VOLUME_RAMP_INPUT.length; i++) expect(VOLUME_RAMP_INPUT[i]).toBeGreaterThan(VOLUME_RAMP_INPUT[i - 1]);
    const out = volumeRampOutput({ inkSubtle: "g", primary: "b", success: "s", warningFill: "w", danger: "d" });
    expect(out).toEqual(["g", "b", "s", "s", "w", "d"]);
    expect(out).toHaveLength(VOLUME_RAMP_INPUT.length);
  });

  test("every bar has words, with soft edges around the thresholds", () => {
    expect(volumeWord(0)).toBe("Çalışmıyor");
    expect(volumeWord(3)).toBe("Yetersiz");
    expect(volumeWord(7)).toBe("Koruma");
    expect(volumeWord(12)).toBe("Gelişim");
    expect(volumeWord(16)).toBe("İdeal");
    expect(volumeWord(19)).toBe("İdeal"); // 19 is fine
    expect(volumeWord(20)).toBe("Üst sınır"); // 20 is a mild note…
    expect(volumeWord(24)).toBe("Çok fazla"); // …the real warning comes later
  });

  test("set counts read the Turkish way", () => {
    expect(fmtSets(12)).toBe("12");
    expect(fmtSets(9.94)).toBe("9,9");
    expect(fmtSets(-1)).toBe("0");
  });

  test("planned rows keep the muscles' order and flag the recommended range", () => {
    const vol = programVolume(
      [{ exercises: [{ name: "Bench", targetSets: 4, muscles: [{ key: "chest", load: 1 }] }] }, { exercises: [{ name: "Bench", targetSets: 8, muscles: [{ key: "chest", load: 1 }] }] }],
      [
        { key: "chest", name: "Göğüs", order: 0 },
        { key: "lats", name: "Kanat", order: 1 },
      ],
      { mode: "cycle" }
    );
    const rows = plannedRows(vol.muscles);
    expect(rows.map((r) => r.key)).toEqual(["chest", "lats"]);
    expect(rows[0]).toMatchObject({ sets: 42, word: "Çok fazla", inRange: false });
    expect(rows[1]).toMatchObject({ sets: 0, word: "Çalışmıyor", inRange: false });
  });

  test("the suggestion is the catalog's hardest-working exercise for that muscle, not already in the program", () => {
    const catalog = [
      ex("a", "Lateral Raise", { sideDelt: 1 }),
      ex("b", "Overhead Press", { frontDelt: 1, sideDelt: 0.6, triceps: 0.4 }),
      ex("c", "Cable Lateral Raise", { sideDelt: 1, traps: 0.2 }),
      ex("d", "Band Pull-apart", { rearDelt: 1 }, { metric: "stretch" }),
      ex("e", "Old Raise", { sideDelt: 1 }, { active: false }),
    ];
    expect(suggestExercise(catalog, "sideDelt")?.name).toBe("Lateral Raise"); // isolated beats the one with spill
    expect(suggestExercise(catalog, "sideDelt", ["lateral raise"])?.name).toBe("Cable Lateral Raise");
    expect(suggestExercise(catalog, "sideDelt", ["Lateral Raise", "Cable Lateral Raise"])?.name).toBe("Overhead Press");
    expect(suggestExercise(catalog, "rearDelt")).toBeNull(); // mobility never counts
    expect(suggestExercise(catalog, "calves")).toBeNull();
    // A tie on load and spill goes alphabetically.
    expect(suggestExercise([ex("x", "Zercher", { quads: 1 }), ex("y", "Hack Squat", { quads: 1 })], "quads")?.name).toBe("Hack Squat");
  });

  test("needs more below the growth band, with half a set of slack", () => {
    expect(needsMore(0)).toBe(true);
    expect(needsMore(9.4)).toBe(true);
    expect(needsMore(9.6)).toBe(false);
  });

  test("Floo speaks only when an edit makes something worth a warning", () => {
    const calm = [advice("lats", 7)]; // maintain → info
    expect(newVolumeAlerts(null, [advice("chest", 24)])).toEqual([]); // opening the editor is silent
    const worse = [advice("lats", 3), advice("chest", 24)];
    expect(newVolumeAlerts(calm, worse).map((a) => a.key)).toEqual(["lats", "chest"]);
    expect(newVolumeAlerts(worse, worse)).toEqual([]); // no repeats
    expect(newVolumeAlerts(worse, [advice("lats", 3), advice("chest", 26)])).toEqual([]); // warn → still warn/alert only when rank rises
    expect(newVolumeAlerts([advice("chest", 21)], [advice("chest", 25)]).map((a) => a.severity)).toEqual(["alert"]);
    expect(newVolumeAlerts([], [advice("abs", 0)])).toEqual([]); // "not trained" is an info
  });

  test("advice maps onto Floo's volumeWarning bands", () => {
    expect(adviceBand(advice("x", 25))).toBe("injury");
    expect(adviceBand(advice("x", 20))).toBe("high");
    expect(adviceBand(advice("x", 3))).toBe("low");
  });
});

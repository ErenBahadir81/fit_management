import { describe, expect, it } from "vitest";
import { programVolume } from "./volumeBands";

const MUSCLES = [
  { key: "chest", name: "Göğüs", order: 0, active: true },
  { key: "quads", name: "Ön Bacak", order: 1, active: true },
  { key: "abs", name: "Karın", order: 2, active: true },
];

const day = (exercises: Array<{ name: string; targetSets: number; metric?: string; muscles?: Array<{ key: string; load: number }> }>) => ({ exercises });

const weekly = (v: ReturnType<typeof programVolume>, key: string) => v.muscles.find((m) => m.key === key)?.weekly;

describe("programVolume — which activation values count", () => {
  it("counts fractional sets: sets × the catalog's load, scaled to a week", () => {
    const v = programVolume([day([{ name: "Push-up", targetSets: 5, muscles: [{ key: "chest", load: 1 }] }])], MUSCLES, {
      mode: "weekly",
      catalog: [{ name: "push-up", muscles: [{ key: "chest", load: 0.8 }] }],
    });
    // The catalog (0.8) wins over the snapshot stored on the program (1.0).
    expect(weekly(v, "chest")).toBe(4);
  });

  it("an exercise the catalog knows but gives no muscles counts nothing, whatever the snapshot says", () => {
    const v = programVolume([day([{ name: "Sled Push", targetSets: 4, muscles: [{ key: "quads", load: 0.85 }] }])], MUSCLES, {
      mode: "weekly",
      catalog: [{ name: "Sled Push", muscles: [] }],
    });
    expect(weekly(v, "quads")).toBe(0);
  });

  it("falls back to the snapshot for exercises the catalog does not know (or has retired)", () => {
    const v = programVolume(
      [day([{ name: "Kendi Hareketim", targetSets: 3, muscles: [{ key: "abs", load: 0.5 }] }, { name: "Eski", targetSets: 2, muscles: [{ key: "chest", load: 1 }] }])],
      MUSCLES,
      { mode: "weekly", catalog: [{ name: "Eski", muscles: [{ key: "chest", load: 0.1 }], active: false }] }
    );
    expect(weekly(v, "abs")).toBe(1.5);
    expect(weekly(v, "chest")).toBe(2);
  });

  it("never counts mobility work", () => {
    const v = programVolume([day([{ name: "Stretch", targetSets: 3, metric: "stretch", muscles: [{ key: "abs", load: 1 }] }])], MUSCLES, { mode: "weekly" });
    expect(weekly(v, "abs")).toBe(0);
  });
});

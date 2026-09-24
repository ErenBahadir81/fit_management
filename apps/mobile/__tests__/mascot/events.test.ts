import { act, waitFor } from "@testing-library/react-native";
import type { NutritionDayView } from "@fitfloow/core";
import { makeQueryClient, renderHookUI } from "../helpers";
import { FLOO_EVENTS, FLOO_LINE_MAX_CHARS, describeFlooEvent, flooBus, overTargetKey, useFlooEvents, type FlooEvent, type FlooEventName } from "../../src/mascot/events";
import { MOODS, TRIGGERS } from "../../src/mascot/model/params";
import { useSession } from "../../src/features/auth/session";
import { nutritionDayKey, useAddEntry } from "../../src/features/nutrition/useNutrition";
import { useCreateBodyEntry, useQuickWeighIn } from "../../src/features/body/useBody";
import { useCompleteGoal } from "../../src/features/goals/useGoal";
import { getApi, setApi } from "../../src/lib/api";
import { todayKey } from "../../src/lib/dates";
import { createFakeApi } from "../../src/lib/fake";

jest.mock("expo-router", () => jest.requireActual("../mocks/expo-router"));

const ev = (name: FlooEventName, payload?: Record<string, unknown>): FlooEvent => ({ name, payload, at: Date.now() });

const PAYLOADS: Record<FlooEventName, Record<string, unknown>> = {
  mealLogged: { kcal: 420, name: "Mercimek çorbası" },
  waterLogged: { ml: 250, totalMl: 1500, goalMl: 2500 },
  setCompleted: { exercise: "Bench Press", setIndex: 2, reps: 8, kg: 60 },
  workoutDone: { title: "Üst vücut", durationMin: 48 },
  measurementLogged: { weightKg: 78.4 },
  goalHit: { what: "Protein" },
  streakUp: { days: 7 },
  missedDay: {},
  overTarget: { overKcal: 180 },
  volumeWarning: { muscle: "Göğüs", sets: 24, band: "high" },
  goalAdjustProposal: { text: "Kalori hedefini 100 kcal düşürelim mi?" },
  greet: {},
};

beforeEach(() => flooBus.reset());

describe("flooBus", () => {
  test("emit reaches subscribers; unsubscribe stops delivery", () => {
    const fn = jest.fn();
    const off = flooBus.subscribe(fn);
    flooBus.emit("mealLogged", { kcal: 100 });
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ name: "mealLogged", payload: { kcal: 100 }, at: expect.any(Number) }));
    off();
    flooBus.emit("mealLogged");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("emitting with no listeners is a no-op", () => {
    expect(() => flooBus.emit("greet")).not.toThrow();
  });

  test("a throwing listener does not block the others", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const a = jest.fn(() => {
      throw new Error("boom");
    });
    const b = jest.fn();
    flooBus.subscribe(a);
    flooBus.subscribe(b);
    expect(() => flooBus.emit("workoutDone")).not.toThrow();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("recent() returns the newest event only while it is young", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(10_000);
    expect(flooBus.recent()).toBeNull();
    flooBus.emit("mealLogged");
    flooBus.emit("goalHit");
    now.mockReturnValue(12_000);
    expect(flooBus.recent(3000)?.name).toBe("goalHit");
    now.mockReturnValue(13_000);
    expect(flooBus.recent(3000)).toBeNull();
    expect(flooBus.recent(5000)?.name).toBe("goalHit");
    now.mockRestore();
  });

  test("useFlooEvents subscribes for the component's life and always calls the latest handler", async () => {
    const first = jest.fn();
    const second = jest.fn();
    let current: (e: FlooEvent) => void = first;
    const hook = await renderHookUI(() => useFlooEvents(current));
    await act(async () => flooBus.emit("streakUp", { days: 3 }));
    expect(first).toHaveBeenCalledTimes(1);
    current = second;
    await hook.rerender(undefined as never);
    await act(async () => flooBus.emit("streakUp"));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    await hook.unmount();
    flooBus.emit("streakUp");
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("describeFlooEvent", () => {
  const rands = [0, 0.26, 0.51, 0.76, 0.999];

  test.each(FLOO_EVENTS.map((n) => [n]))("%s reads fine with and without payload", (name) => {
    for (const payload of [undefined, PAYLOADS[name]]) {
      for (const r of rands) {
        const line = describeFlooEvent(ev(name, payload), { rand: () => r, now: new Date(2026, 8, 24, 14) });
        expect(line.text.trim().length).toBeGreaterThan(0);
        expect(line.text.length).toBeLessThanOrEqual(FLOO_LINE_MAX_CHARS);
        expect(line.text).not.toMatch(/undefined|null|NaN/);
        expect(MOODS).toContain(line.mood);
        expect(TRIGGERS).toContain(line.trigger);
        expect(line.trigger).toBe(name);
        expect(line.ttlMs).toBeGreaterThanOrEqual(3000);
        expect(line.ttlMs).toBeLessThanOrEqual(6000);
        expect(line.key.startsWith(name)).toBe(true);
      }
    }
  });

  test("is deterministic for a fixed rand and varies across rand", () => {
    const a = describeFlooEvent(ev("mealLogged"), { rand: () => 0.1 });
    const b = describeFlooEvent(ev("mealLogged"), { rand: () => 0.1 });
    expect(a).toEqual(b);
    const texts = new Set(rands.map((r) => describeFlooEvent(ev("mealLogged"), { rand: () => r }).text));
    expect(texts.size).toBeGreaterThan(1);
  });

  test("uses the payload when it is there", () => {
    expect(describeFlooEvent(ev("mealLogged", { kcal: 420 }), { rand: () => 0 }).text).toContain("420");
    expect(describeFlooEvent(ev("streakUp", { days: 7 }), { rand: () => 0 }).text).toContain("7 gün");
    expect(describeFlooEvent(ev("overTarget", { overKcal: 180 }), { rand: () => 0 }).text).toContain("180");
    expect(describeFlooEvent(ev("volumeWarning", PAYLOADS.volumeWarning), { rand: () => 0 }).text).toContain("Göğüs");
    expect(describeFlooEvent(ev("goalAdjustProposal", PAYLOADS.goalAdjustProposal), { rand: () => 0 }).text).toBe(PAYLOADS.goalAdjustProposal.text);
  });

  test("moods, priorities and the missed-day line stay kind", () => {
    const d = (name: FlooEventName, payload?: Record<string, unknown>) => describeFlooEvent(ev(name, payload), { rand: () => 0 });
    expect(d("goalHit").mood).toBe("celebrate");
    expect(d("goalHit").priority).toBe("high");
    expect(d("setCompleted").priority).toBe("low");
    expect(d("waterLogged").priority).toBe("low");
    expect(d("workoutDone").mood).toBe("proud");
    expect(d("workoutDone").priority).toBe("normal");
    expect(d("overTarget").mood).toBe("worried");
    expect(d("volumeWarning", { muscle: "Sırt", band: "high" }).mood).toBe("worried");
    expect(d("volumeWarning", { muscle: "Sırt", band: "low" }).mood).toBe("think");
    expect(d("missedDay").mood).toBe("sad");
    expect(d("missedDay").text).toBe("Dün kaçtı, bugün yeniden başlıyoruz.");
  });

  test("warnings wear the warning tone; everything else stays neutral (its mutation already buzzed)", () => {
    const d = (name: FlooEventName, payload?: Record<string, unknown>) => describeFlooEvent(ev(name, payload), { rand: () => 0 });
    expect(d("overTarget", PAYLOADS.overTarget).tone).toBe("warning");
    expect(d("volumeWarning", { muscle: "Göğüs", band: "high" }).tone).toBe("warning");
    expect(d("volumeWarning", { muscle: "Göğüs", band: "injury" }).tone).toBe("warning");
    expect(d("volumeWarning", { muscle: "Göğüs", band: "low" }).tone).toBe("neutral");
    const neutral = FLOO_EVENTS.filter((n) => n !== "overTarget" && n !== "volumeWarning");
    for (const name of neutral) expect([name, d(name, PAYLOADS[name]).tone]).toEqual([name, "neutral"]);
  });

  test("going over target is a fact about a day: keyed by that day and said once", () => {
    const line = describeFlooEvent(ev("overTarget", { overKcal: 150, dateKey: "2026-09-24" }));
    expect(line.key).toBe(overTargetKey("2026-09-24"));
    expect(line.once).toBe(true);
    // Without a day there is nothing to remember it by: an ordinary line.
    expect(describeFlooEvent(ev("overTarget", { overKcal: 150 })).once).toBeFalsy();
    expect(describeFlooEvent(ev("mealLogged")).once).toBeFalsy();
  });

  test("volumeWarning keys per muscle so two muscles do not dedupe", () => {
    const a = describeFlooEvent(ev("volumeWarning", { muscle: "Göğüs", band: "high" }));
    const b = describeFlooEvent(ev("volumeWarning", { muscle: "Sırt", band: "high" }));
    expect(a.key).not.toBe(b.key);
    expect(describeFlooEvent(ev("mealLogged")).key).toBe("mealLogged");
  });

  test("greet follows the time of day", () => {
    const at = (h: number) => describeFlooEvent(ev("greet"), { now: new Date(2026, 8, 24, h), rand: () => 0 });
    expect(at(8).text).toMatch(/^Günaydın/);
    expect(at(8).mood).toBe("happy");
    expect(at(23).mood).toBe("sleepy");
    expect(at(3).mood).toBe("sleepy");
    expect(at(15).mood).toBe("happy");
    expect(at(15).text).not.toMatch(/Günaydın/);
  });
});

describe("data layer emits", () => {
  let emit: jest.SpyInstance;
  beforeEach(async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    setApi(api);
    useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
    emit = jest.spyOn(flooBus, "emit");
  });
  afterEach(() => emit.mockRestore());

  const custom = { name: "Lahmacun", per100g: { kcal: 250, protein: 10, carbs: 30, fat: 9 } };

  test("useAddEntry emits mealLogged, and overTarget only when the day crosses its target", async () => {
    const qc = makeQueryClient();
    const dateKey = todayKey();
    const hook = await renderHookUI(() => useAddEntry(dateKey), { queryClient: qc });
    await act(async () => {
      hook.result.current.mutate({ meal: "lunch", grams: 200, custom });
    });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(emit).toHaveBeenCalledWith("mealLogged", { kcal: 500, name: "Lahmacun" });
    expect(emit).not.toHaveBeenCalledWith("overTarget", expect.anything());

    // Seed a day that sits just under a tiny target, then log something that pushes it over.
    const day = await getApi().nutrition.day(dateKey);
    const under: NutritionDayView = { ...day, target: { ...day.target, calories: day.totals.kcal + 100 } };
    qc.setQueryData(nutritionDayKey(dateKey), under);
    emit.mockClear();
    await act(async () => {
      hook.result.current.mutate({ meal: "dinner", grams: 100, custom });
    });
    await waitFor(() => expect(emit).toHaveBeenCalledWith("overTarget", { overKcal: 150, dateKey }));
    expect(emit).toHaveBeenCalledWith("mealLogged", { kcal: 250, name: "Lahmacun" });
  });

  test("weigh-in and full measurement emit measurementLogged", async () => {
    const qc = makeQueryClient();
    const weigh = await renderHookUI(() => useQuickWeighIn(), { queryClient: qc });
    await act(async () => {
      weigh.result.current.mutate({ weightKg: 80.2 });
    });
    await waitFor(() => expect(weigh.result.current.isSuccess).toBe(true));
    expect(emit).toHaveBeenCalledWith("measurementLogged", expect.objectContaining({ weightKg: 80.2, kind: "weighIn" }));

    const entry = await renderHookUI(() => useCreateBodyEntry(), { queryClient: qc });
    await act(async () => {
      entry.result.current.mutate({ gender: "male", heightCm: 180, weightKg: 80, waistCm: 85, neckCm: 38 });
    });
    await waitFor(() => expect(entry.result.current.isSuccess).toBe(true));
    expect(emit).toHaveBeenCalledWith("measurementLogged", expect.objectContaining({ kind: "entry" }));
  });

  test("completing the goal emits goalHit", async () => {
    const hook = await renderHookUI(() => useCompleteGoal(), { queryClient: makeQueryClient() });
    await act(async () => {
      hook.result.current.mutate();
    });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(emit).toHaveBeenCalledWith("goalHit", expect.objectContaining({ goalId: expect.any(String) }));
  });
});

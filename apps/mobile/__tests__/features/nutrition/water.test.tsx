import { zWaterDay } from "@fitfloow/core";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { makeQueryClient, renderUI } from "../../helpers";
import { WaterCard } from "../../../src/features/nutrition/components/WaterCard";
import { setApi } from "../../../src/lib/api";
import { todayKey } from "../../../src/lib/dates";
import { createFakeApi } from "../../../src/lib/fake";
import { describeFlooEvent, flooBus, type FlooEvent } from "../../../src/mascot/events";
import { getFlooHydration, hydrationFor, setFlooHydration } from "../../../src/mascot/hydration";

describe("water in the fake API", () => {
  test("GET/POST/DELETE keep a parseable running total", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    const start = await api.nutrition.water();
    expect(() => zWaterDay.parse(start)).not.toThrow();
    const added = await api.nutrition.addWater(250);
    expect(added.totalMl).toBe(start.totalMl + 250);
    expect(added.count).toBe(start.count + 1);
    const undone = await api.nutrition.undoWater();
    expect(undone.totalMl).toBe(start.totalMl);
    await expect(api.nutrition.addWater(0)).rejects.toMatchObject({ status: 400 });
  });
});

describe("Floo hydration", () => {
  afterEach(() => setFlooHydration(null));
  test("maps the day's share to 0.35..1 and clamps", () => {
    expect(hydrationFor(0, 2500)).toBe(0.35);
    expect(hydrationFor(2500, 2500)).toBe(1);
    expect(hydrationFor(9000, 2500)).toBe(1);
    setFlooHydration(2);
    expect(getFlooHydration()).toBe(1);
  });
});

describe("WaterCard", () => {
  afterEach(() => {
    flooBus.reset();
    setFlooHydration(null);
  });

  test("one tap adds a glass, tells Floo, and raises his hydration", async () => {
    setApi(createFakeApi({ latencyMs: 0, signedIn: true }));
    const heard: FlooEvent[] = [];
    flooBus.subscribe((e) => heard.push(e));
    await renderUI(<WaterCard dateKey={todayKey()} />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(getFlooHydration()).not.toBeNull());
    const before = getFlooHydration()!;
    await act(async () => {
      fireEvent.press(screen.getByTestId("water-card-add"));
    });
    await waitFor(() => expect(heard.some((e) => e.name === "waterLogged")).toBe(true));
    expect(heard.find((e) => e.name === "waterLogged")!.payload).toMatchObject({ ml: 250 });
    await waitFor(() => expect(getFlooHydration()!).toBeGreaterThan(before));
    expect(screen.getByTestId("water-card-undo")).toBeTruthy();
  });
});

describe("waterLogged copy", () => {
  test("the glass that reaches the goal always celebrates it", () => {
    for (const r of [0, 0.5, 0.99]) {
      const line = describeFlooEvent({ name: "waterLogged", payload: { ml: 250, totalMl: 2750, goalMl: 2750 }, at: 0 }, { rand: () => r });
      expect(line.text).toBe("Günlük su hedefin tamam, harika!");
    }
  });
});

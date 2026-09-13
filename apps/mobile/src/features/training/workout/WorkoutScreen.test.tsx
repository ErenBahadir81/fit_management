import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { makeQueryClient, renderUI } from "../../../../__tests__/helpers";
import { mockRouter } from "../../../../__tests__/mocks/expo-router";
import { useSession } from "../../auth/session";
import { setApi } from "../../../lib/api";
import { createFakeApi } from "../../../lib/fake";
import { trainingState, withCardioDay, withRestDay } from "../../../lib/fake/training";
import { getJSON, storage } from "../../../lib/storage";
import { createLoggerState, loggerReducer, type LoggerState } from "../lib/logger";
import { WORKOUT_DRAFT_KEY } from "./useWorkoutSession";
import { WorkoutScreen } from "./WorkoutScreen";

jest.mock("expo-router", () => jest.requireActual("../../../../__tests__/mocks/expo-router"));

async function mount(state?: ReturnType<typeof trainingState>) {
  const api = createFakeApi({ latencyMs: 0, signedIn: true, state });
  setApi(api);
  useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  await renderUI(<WorkoutScreen />, { queryClient: makeQueryClient() });
  return api;
}

/** Today's cycle day and date, straight from the fake — what a real draft on this device would hold. */
async function todaysDay() {
  const api = createFakeApi({ latencyMs: 0, signedIn: true });
  const view = await api.training.program();
  return { view, dateKey: view.schedule.find((s) => s.isToday)!.dateKey };
}

const draft = () => getJSON<LoggerState>(WORKOUT_DRAFT_KEY)!;

describe("WorkoutScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.clearAll();
  });

  test("opens on the first exercise with the header progress and the single primary action", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("pane-0")).toBeTruthy());
    expect(within(screen.getByTestId("pane-0")).getByText("Bench Press")).toBeTruthy();
    expect(screen.getByTestId("workout-progress")).toHaveTextContent("0/14 set");
    expect(screen.getByTestId("workout-elapsed")).toBeTruthy();
    expect(screen.getByTestId("complete-set")).toBeTruthy();
    expect(screen.getByTestId("set-active-0")).toBeTruthy();
  });

  test("completing a set moves the progress, marks the row done and starts the rest timer", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("complete-set")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("complete-set"));

    await waitFor(() => expect(screen.getByTestId("workout-progress")).toHaveTextContent("1/14 set"));
    expect(screen.getByTestId("set-done-0-0")).toBeTruthy();
    expect(screen.getByTestId("rest-timer")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("rest-skip"));
    await waitFor(() => expect(screen.queryByTestId("rest-timer")).toBeNull());
  });

  test("a completed set can be undone by tapping it", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("complete-set")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("complete-set"));
    await waitFor(() => expect(screen.getByTestId("set-done-0-0")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("set-done-0-0"));
    await waitFor(() => expect(screen.getByTestId("workout-progress")).toHaveTextContent("0/14 set"));
  });

  test("weight is typed straight into the set, comma or dot", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("weight-0-input")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("weight-0-input"), "62,5");
    await waitFor(() => expect(draft().exercises[0].sets[0].weightKg).toBe(62.5));
  });

  test("reps are typed too — no tapping from 8 to 12", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("reps-0-input")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("reps-0-input"), "12");
    await waitFor(() => expect(draft().exercises[0].sets[0].reps).toBe(12));
  });

  test("the ± affordances move a plate at a time and a rep at a time", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("weight-0-input")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("weight-0-input"), "60");
    await fireEvent.press(screen.getByTestId("weight-0-inc"));
    await waitFor(() => expect(draft().exercises[0].sets[0].weightKg).toBe(62.5));
    await fireEvent.press(screen.getByTestId("weight-0-dec"));
    await waitFor(() => expect(draft().exercises[0].sets[0].weightKg).toBe(60));

    const reps = draft().exercises[0].sets[0].reps;
    await fireEvent.press(screen.getByTestId("reps-0-inc"));
    await waitFor(() => expect(draft().exercises[0].sets[0].reps).toBe(reps + 1));
  });

  test("a load typed on one set carries to the sets after it", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("weight-0-input")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("weight-0-input"), "60");
    await waitFor(() => expect(draft().exercises[0].sets.map((s) => s.weightKg)).toEqual([60, 60, 60, 60]));
  });

  test("the header carries the session tonnage once something is loaded", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("weight-0-input")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("weight-0-input"), "60");
    await fireEvent.press(screen.getByTestId("complete-set"));
    await waitFor(() => expect(screen.getByTestId("workout-tonnage")).toBeTruthy());
  });

  test("last session's numbers are shown and prefilled into the pending sets", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("last-performance-0")).toBeTruthy());
    expect(screen.getByTestId("last-performance-0")).toHaveTextContent(/Geçen sefer/);
    await waitFor(() => expect(draft().exercises[0].sets[0].weightKg).not.toBeNull());
  });

  test("skipping an exercise removes its sets from the total", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("skip-exercise-0")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("skip-exercise-0"));
    await waitFor(() => expect(screen.getByTestId("pane-skipped-0")).toBeTruthy());
    expect(screen.getByTestId("workout-progress")).toHaveTextContent("0/10 set");
  });

  test("an ad-hoc exercise from the catalog is appended as a new pane", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("workout-add-exercise")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("workout-add-exercise"));
    await waitFor(() => expect(screen.getByTestId("add-exercise-ex_squat")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("add-exercise-ex_squat"));
    await waitFor(() => expect(screen.getByTestId("pane-4")).toBeTruthy());
    expect(within(screen.getByTestId("pane-4")).getByText("Squat")).toBeTruthy();
    expect(draft().exercises[4]).toEqual(expect.objectContaining({ name: "Squat", source: "extra" }));
  });

  test("the session sheet lists every pane and jumps to the one you tap", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("session-overview")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("session-overview"));
    await waitFor(() => expect(screen.getByTestId("session-sheet")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("session-jump-2"));
    await waitFor(() => expect(draft().activeIndex).toBe(2));
  });

  test("the workout is persisted to MMKV and restored after a relaunch", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("complete-set")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("complete-set"));
    await waitFor(() => expect(draft().exercises[0].sets[0].done).toBe(true));

    screen.unmount();
    await mount();
    await waitFor(() => expect(screen.getByTestId("workout-progress")).toHaveTextContent("1/14 set"));
    expect(screen.getByTestId("set-done-0-0")).toBeTruthy();
  });

  test("a v1 draft written before loads existed opens instead of crashing", async () => {
    const { view, dateKey } = await todaysDay();
    const day = view.current.day;
    // Exactly what the previous release persisted: no `weightKg`, and a rest deadline the reducer
    // no longer owns.
    const v1 = {
      version: 1,
      programId: view.program.id,
      dayIndex: view.current.index,
      dayOrder: day.order,
      title: day.title,
      focus: day.focus,
      kind: day.kind,
      weekNumber: view.program.weekNumber,
      dateKey,
      startedAt: Date.now() - 10 * 60_000,
      exercises: day.exercises.map((e, i) => ({
        id: `ex-${i}`,
        name: e.name,
        muscles: e.muscles,
        metric: e.metric,
        plannedSets: e.targetSets,
        plannedReps: e.targetReps,
        plannedRIR: e.targetRIR,
        source: "planned",
        skipped: false,
        sets: Array.from({ length: e.targetSets }, (_, s) => ({ reps: e.targetReps, rir: e.targetRIR, done: i === 0 && s === 0 })),
      })),
      activeIndex: 0,
      run: null,
      swim: null,
      restSeconds: 90,
      restEndsAt: Date.now() + 45_000,
      rpe: null,
      notes: "",
      seq: 1,
    };
    storage.set(WORKOUT_DRAFT_KEY, JSON.stringify(v1));

    await mount();
    await waitFor(() => expect(screen.getByTestId("workout-progress")).toHaveTextContent("1/14 set"));
    expect(screen.getByTestId("set-done-0-0")).toBeTruthy();
    expect(draft().version).toBe(2);
    expect(draft().exercises[0].sets[0].weightKg).toBeNull();
    expect(draft()).not.toHaveProperty("restEndsAt");
  });

  test("a draft from another day is discarded", async () => {
    const { view } = await todaysDay();
    const stale = createLoggerState({
      day: { ...view.current.day, order: 99, title: "Eski gün" },
      dayIndex: 0,
      programId: view.program.id,
      weekNumber: 1,
      dateKey: "2020-01-01",
      startedAt: 0,
    });
    storage.set(WORKOUT_DRAFT_KEY, JSON.stringify(stale));

    await mount();
    await waitFor(() => expect(screen.getByTestId("workout-progress")).toHaveTextContent("0/14 set"));
    expect(screen.queryByText("Eski gün")).toBeNull();
  });

  test("finishing sends the completed sets with their load and reports the session back", async () => {
    const api = await mount();
    const spy = jest.spyOn(api.training, "complete");
    await waitFor(() => expect(screen.getByTestId("weight-0-input")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("weight-0-input"), "60");
    await fireEvent.press(screen.getByTestId("complete-set"));
    await fireEvent.press(screen.getByTestId("complete-set"));

    await fireEvent.press(screen.getByTestId("workout-finish"));
    await waitFor(() => expect(screen.getByTestId("finish-sheet")).toBeTruthy());
    expect(screen.getByTestId("finish-muscle-chips")).toBeTruthy();
    expect(screen.getByTestId("finish-tonnage")).toBeTruthy();
    expect(screen.getByTestId("finish-compare")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("rpe-8"));
    await fireEvent.press(screen.getByTestId("finish-confirm"));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const input = spy.mock.calls[0][0];
    expect(input.rpe).toBe(8);
    expect(input.strength?.[0].sets).toHaveLength(2);
    expect(input.strength?.[0].sets[0].weightKg).toBe(60);
    expect(input.strength?.[1].sets).toHaveLength(0);

    await waitFor(() => expect(screen.getByTestId("workout-saved")).toBeTruthy());
    expect(screen.getByTestId("workout-saved-compare")).toBeTruthy();
    expect(getJSON(WORKOUT_DRAFT_KEY)).toBeNull();
  });

  test("closing with logged sets asks before leaving", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("complete-set")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("complete-set"));
    await fireEvent.press(screen.getByTestId("workout-close"));
    await waitFor(() => expect(screen.getByTestId("leave-sheet")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("leave-keep"));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(getJSON(WORKOUT_DRAFT_KEY)).not.toBeNull();
  });

  test("a cardio day shows the segment logger with the target and pace", async () => {
    await mount(withCardioDay(trainingState()));
    await waitFor(() => expect(screen.getByTestId("cardio-pane-run")).toBeTruthy());
    expect(screen.getByTestId("segment-0")).toBeTruthy();
    expect(screen.getByText("Hedef 5,0 km")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("segment-add"));
    await waitFor(() => expect(screen.getByTestId("segment-1")).toBeTruthy());
    expect(within(screen.getByTestId("complete-set")).getByText("Antrenmanı bitir")).toBeTruthy();
  });

  test("cardio distance and time are typed, like everything else on this screen", async () => {
    await mount(withCardioDay(trainingState()));
    await waitFor(() => expect(screen.getByTestId("segment-km-0-input")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("segment-km-0-input"), "7,4");
    await fireEvent.changeText(screen.getByTestId("segment-min-0-input"), "41");
    await waitFor(() => expect(draft().run?.segments[0]).toEqual(expect.objectContaining({ km: 7.4, min: 41 })));
  });

  test("a rest day has nothing to log", async () => {
    await mount(withRestDay(trainingState()));
    await waitFor(() => expect(screen.getByTestId("workout-empty")).toBeTruthy());
  });
});

describe("logger reducer through the screen", () => {
  test("the draft written by the screen replays through the pure reducer", async () => {
    storage.clearAll();
    const { view, dateKey } = await todaysDay();
    const state = createLoggerState({ day: view.current.day, dayIndex: view.current.index, programId: view.program.id, weekNumber: view.program.weekNumber, dateKey, startedAt: 0 });
    const after = loggerReducer(state, { type: "complete-set", at: 0 });
    expect(after.exercises[0].sets[0].done).toBe(true);
  });
});

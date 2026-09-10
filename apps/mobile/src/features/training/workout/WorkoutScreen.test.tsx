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

jest.mock("expo-router", () => require("../../../../__tests__/mocks/expo-router"));

async function mount(state?: ReturnType<typeof trainingState>) {
  const api = createFakeApi({ latencyMs: 0, signedIn: true, state });
  setApi(api);
  useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  await renderUI(<WorkoutScreen />, { queryClient: makeQueryClient() });
  return api;
}

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

    await fireEvent.press(screen.getByTestId("rest-timer"));
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

  test("the reps stepper edits the active set", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("reps-0-inc")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("reps-0-inc"));
    await fireEvent.press(screen.getByTestId("reps-0-inc"));
    const draft = getJSON<LoggerState>(WORKOUT_DRAFT_KEY)!;
    expect(draft.exercises[0].sets[0].reps).toBe(10);
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
    const draft = getJSON<LoggerState>(WORKOUT_DRAFT_KEY)!;
    expect(draft.exercises[4]).toEqual(expect.objectContaining({ name: "Squat", source: "extra" }));
  });

  test("the workout is persisted to MMKV and restored after a relaunch", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("complete-set")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("complete-set"));
    await waitFor(() => expect(getJSON<LoggerState>(WORKOUT_DRAFT_KEY)?.exercises[0].sets[0].done).toBe(true));

    screen.unmount();
    await mount();
    await waitFor(() => expect(screen.getByTestId("workout-progress")).toHaveTextContent("1/14 set"));
    expect(screen.getByTestId("set-done-0-0")).toBeTruthy();
  });

  test("a draft from another day is discarded", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    const view = await api.training.program();
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

  test("finishing sends only the completed sets and shows the success state", async () => {
    const api = await mount();
    const spy = jest.spyOn(api.training, "complete");
    await waitFor(() => expect(screen.getByTestId("complete-set")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("complete-set"));
    await fireEvent.press(screen.getByTestId("complete-set"));

    await fireEvent.press(screen.getByTestId("workout-finish"));
    await waitFor(() => expect(screen.getByTestId("finish-sheet")).toBeTruthy());
    expect(screen.getByTestId("finish-muscle-chips")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("rpe-8"));
    await fireEvent.press(screen.getByTestId("finish-confirm"));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const input = spy.mock.calls[0][0];
    expect(input.rpe).toBe(8);
    expect(input.strength?.[0].sets).toHaveLength(2);
    expect(input.strength?.[1].sets).toHaveLength(0);
    await waitFor(() => expect(screen.getByTestId("workout-saved")).toBeTruthy());
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

  test("a rest day has nothing to log", async () => {
    await mount(withRestDay(trainingState()));
    await waitFor(() => expect(screen.getByTestId("workout-empty")).toBeTruthy());
  });
});

describe("logger reducer through the screen", () => {
  test("the draft written by the screen replays through the pure reducer", async () => {
    await (async () => {
      storage.clearAll();
      const api = createFakeApi({ latencyMs: 0, signedIn: true });
      const view = await api.training.program();
      const state = createLoggerState({
        day: view.current.day,
        dayIndex: view.current.index,
        programId: view.program.id,
        weekNumber: view.program.weekNumber,
        dateKey: view.schedule.find((s) => s.isToday)!.dateKey,
        startedAt: 0,
      });
      const after = loggerReducer(state, { type: "complete-set", at: 0 });
      expect(after.exercises[0].sets[0].done).toBe(true);
    })();
  });
});

import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { makeQueryClient, renderUI } from "../../../../__tests__/helpers";
import { mockRouter } from "../../../../__tests__/mocks/expo-router";
import { useSession } from "../../auth/session";
import { setApi } from "../../../lib/api";
import { createFakeApi } from "../../../lib/fake";
import { trainingState, withCompletedToday, withEmptyHistory, withRestDay, withoutProgram } from "../../../lib/fake/training";
import { trainingKeys } from "../queries";
import { ProgramScreen } from "./ProgramScreen";

jest.mock("expo-router", () => require("../../../../__tests__/mocks/expo-router"));

async function signIn(api: ReturnType<typeof createFakeApi>) {
  useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
}

async function mount(state?: ReturnType<typeof trainingState>, latencyMs = 0) {
  const api = createFakeApi({ latencyMs, signedIn: true, state });
  setApi(api);
  await signIn(api);
  const qc = makeQueryClient();
  await renderUI(<ProgramScreen />, { queryClient: qc });
  return { api, qc };
}

describe("ProgramScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("shows the skeleton first, then the week strip, today's card and the weekly volume", async () => {
    await mount(undefined, 20);
    expect(screen.getByTestId("program-skeleton", { includeHiddenElements: true })).toBeTruthy();

    await waitFor(() => expect(screen.getByTestId("current-day-card")).toBeTruthy());
    expect(screen.getByTestId("week-strip")).toBeTruthy();
    expect(within(screen.getByTestId("current-day-card")).getByText("Üst Vücut A")).toBeTruthy();
    expect(screen.getByText("Antrenmana başla")).toBeTruthy();
    expect(screen.getByTestId("volume-card")).toBeTruthy();
    expect(screen.getByText("Haftalık hacim")).toBeTruthy();
    expect(screen.getByTestId("volume-toggle")).toBeTruthy(); // 9 muscles, 5 shown collapsed
    expect(screen.getByText("Geçmiş")).toBeTruthy();
  });

  test("renders instantly from a warm cache without ever mounting the skeleton", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    setApi(api);
    await signIn(api);
    const qc = makeQueryClient();
    qc.setQueryData(trainingKeys.program, await api.training.program());
    await renderUI(<ProgramScreen />, { queryClient: qc });
    expect(screen.queryByTestId("program-skeleton", { includeHiddenElements: true })).toBeNull();
    expect(within(screen.getByTestId("current-day-card")).getByText("Üst Vücut A")).toBeTruthy();
  });

  test("the primary action opens the workout modal", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("start-workout")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("start-workout"));
    expect(mockRouter.push).toHaveBeenCalledWith("/(modals)/workout");
  });

  test("skipping today goes through the confirm sheet and updates the card optimistically", async () => {
    const { qc } = await mount();
    await waitFor(() => expect(screen.getByTestId("skip-day")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("skip-day"));
    await fireEvent.press(screen.getByTestId("skip-reason-Yorgunum"));
    await fireEvent.press(screen.getByTestId("skip-confirm"));

    await waitFor(() => expect(screen.getAllByText("Bugün atlandı").length).toBeGreaterThan(0));
    expect(qc.getQueryData<{ todayLog: { isOffDay: boolean } | null }>(trainingKeys.program)?.todayLog?.isOffDay).toBe(true);
  });

  test("the jump sheet lists the cycle days and moves the pointer", async () => {
    const { qc } = await mount();
    await waitFor(() => expect(screen.getByTestId("jump-day")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("jump-day"));
    expect(screen.getByTestId("jump-sheet")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("jump-day-2"));
    await waitFor(() => expect(qc.getQueryData<{ program: { currentIndex: number } }>(trainingKeys.program)?.program.currentIndex).toBe(2));
  });

  test("a rest day shows the rest copy and no start CTA", async () => {
    await mount(withRestDay(trainingState()));
    await waitFor(() => expect(screen.getByText("Dinlenme günü")).toBeTruthy());
    expect(screen.queryByTestId("start-workout")).toBeNull();
    expect(screen.getByTestId("skip-day")).toBeTruthy();
  });

  test("a completed day shows the summary with undo", async () => {
    await mount(withCompletedToday(trainingState()));
    await waitFor(() => expect(screen.getByText("Bugün tamamlandı")).toBeTruthy());
    expect(screen.getByTestId("undo-today")).toBeTruthy();
    expect(screen.queryByTestId("start-workout")).toBeNull();
  });

  test("no program → the empty state, no week strip", async () => {
    await mount(withoutProgram(trainingState()));
    await waitFor(() => expect(screen.getByTestId("no-program")).toBeTruthy());
    expect(screen.getByText("Program atanmamış")).toBeTruthy();
    expect(screen.queryByTestId("current-day-card")).toBeNull();
  });

  test("no history → the empty history state", async () => {
    await mount(withEmptyHistory(trainingState()));
    await waitFor(() => expect(screen.getByTestId("no-history")).toBeTruthy());
  });

  test("history rows are grouped by week and open the detail sheet", async () => {
    const { api } = await mount();
    const logs = (await api.training.workouts({ limit: 60 })).logs;
    const first = logs[0];
    await waitFor(() => expect(screen.getByTestId(`history-row-${first.id}`)).toBeTruthy());
    expect(screen.getByText("Bu hafta")).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`history-row-${first.id}`));
    await waitFor(() => expect(screen.getByTestId("log-muscle-chips")).toBeTruthy());
    expect(screen.getByTestId("log-delete")).toBeTruthy();
  });

  test("deleting a session hides the row and offers undo before the request fires", async () => {
    const { api } = await mount();
    const logs = (await api.training.workouts({ limit: 60 })).logs;
    const victim = logs[0];
    await waitFor(() => expect(screen.getByTestId(`history-row-${victim.id}`)).toBeTruthy());

    await fireEvent.press(screen.getByTestId(`history-delete-${victim.id}`));
    await waitFor(() => expect(screen.getByTestId("undo-bar")).toBeTruthy());
    expect(screen.queryByTestId(`history-row-${victim.id}`)).toBeNull();

    // The undo window has not elapsed, so nothing has been sent yet.
    await fireEvent.press(screen.getByTestId("undo-delete"));
    await waitFor(() => expect(screen.getByTestId(`history-row-${victim.id}`)).toBeTruthy());
    expect((await api.training.workouts({ limit: 60 })).logs.some((l) => l.id === victim.id)).toBe(true);
  });

  test("the segmented control swaps in the recovery grid", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("current-day-card")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("training-tabs-recovery"));
    await waitFor(() => expect(screen.getByTestId("recovery-overall")).toBeTruthy());
    expect(screen.getByTestId("muscle-grid")).toBeTruthy();
    expect(screen.getByTestId("muscle-chest")).toBeTruthy();
  });

  test("the editor sheet lists the days and saves a reordered program", async () => {
    const { api, qc } = await mount();
    await waitFor(() => expect(screen.getByTestId("edit-program")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("edit-program"));
    expect(screen.getByTestId("editor-days")).toBeTruthy();

    const before = (await api.training.program()).program.days.map((d) => d.title);
    await fireEvent(screen.getByTestId("editor-day-1"), "accessibilityAction", { nativeEvent: { actionName: "moveUp" } });
    await fireEvent.press(screen.getByTestId("editor-save"));

    await waitFor(() => {
      const after = qc.getQueryData<{ program: { days: { title: string }[] } }>(trainingKeys.program)!.program.days.map((d) => d.title);
      expect(after[0]).toBe(before[1]);
      expect(after[1]).toBe(before[0]);
    });
  });

  test("the day editor edits targets and adds a catalog exercise", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("edit-program")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("edit-program"));
    await fireEvent.press(screen.getByTestId("editor-day-0"));
    expect(screen.getByTestId("editor-exercise-0")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("editor-sets-0-inc"));
    await fireEvent.press(screen.getByTestId("editor-add-exercise"));
    await waitFor(() => expect(screen.getByTestId("picker-search")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("picker-item-ex_squat"));
    await waitFor(() => expect(screen.getByText("Squat")).toBeTruthy());
  });
});

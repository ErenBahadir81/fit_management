import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { makeQueryClient, renderUI } from "../../../../__tests__/helpers";
import { mockRouter } from "../../../../__tests__/mocks/expo-router";
import { useSession } from "../../auth/session";
import { setApi } from "../../../lib/api";
import { createFakeApi } from "../../../lib/fake";
import { trainingState, withCompletedToday, withEmptyHistory, withRestDay, withoutProgram } from "../../../lib/fake/training";
import { storage } from "../../../lib/storage";
import { weekdaySlot, type DayDTO, type ProgramView, type Weekday } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { createLoggerState, loggerReducer } from "../lib/logger";
import { groupLogsByWeek } from "../lib/present";
import { trainingKeys } from "../queries";
import { WORKOUT_DRAFT_KEY } from "../workout/useWorkoutSession";
import { EDITOR_ROUTE, ProgramScreen, WORKOUT_ROUTE } from "./ProgramScreen";

jest.mock("expo-router", () => jest.requireActual("../../../../__tests__/mocks/expo-router"));

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

const cached = (qc: ReturnType<typeof makeQueryClient>) => qc.getQueryData<ProgramView>(trainingKeys.program)!;

/** The demo cycle laid out Monday → Sunday: a weekly program. */
function withWeekly(state: ReturnType<typeof trainingState>) {
  const days = state.program.days;
  const rest: DayDTO = { id: "d7", order: 7, title: "Dinlenme", focus: "", kind: "rest", exercises: [], run: null, swim: null };
  state.program = { ...state.program, mode: "weekly", days: [...days, rest].map((d, i) => ({ ...d, order: i + 1 })), cycleNumber: 3, weekNumber: 3 };
  return state;
}

async function openOtherDay() {
  await waitFor(() => expect(screen.getByTestId("other-day")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("other-day"));
  await waitFor(() => expect(screen.getByTestId("other-day-sheet")).toBeTruthy());
}

describe("ProgramScreen — plan", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.clearAll();
  });

  test("an unfinished session turns the primary action into 'carry on', with how far you got", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    setApi(api);
    await signIn(api);
    const view = await api.training.program();
    let inProgress = createLoggerState({
      day: view.current.day,
      dayIndex: view.current.index,
      programId: view.program.id,
      weekNumber: view.program.weekNumber,
      dateKey: view.schedule.find((s) => s.isToday)!.dateKey,
      startedAt: Date.now() - 12 * 60_000,
    });
    inProgress = loggerReducer(inProgress, { type: "set-weight", exercise: 0, set: 0, value: 60 });
    inProgress = loggerReducer(inProgress, { type: "complete-set", at: Date.now() });
    inProgress = loggerReducer(inProgress, { type: "complete-set", at: Date.now() });
    storage.set(WORKOUT_DRAFT_KEY, JSON.stringify(inProgress));

    await renderUI(<ProgramScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("start-workout")).toBeTruthy());
    expect(screen.getByTestId("resume-progress")).toHaveTextContent(/2\/14 set/);
    expect(within(screen.getByTestId("start-workout")).getByText("Antrenmana devam et")).toBeTruthy();
  });

  test("shows the skeleton first, then today big, the next 7 days and the weekly volume", async () => {
    await mount(undefined, 20);
    expect(screen.getByTestId("program-skeleton", { includeHiddenElements: true })).toBeTruthy();

    await waitFor(() => expect(screen.getByTestId("current-day-card")).toBeTruthy());
    expect(screen.getByTestId("today-title")).toHaveTextContent("Üst Vücut A");
    // The pass counter is the cycle number, and today's place in the cycle.
    expect(screen.getByTestId("today-eyebrow")).toHaveTextContent("Bugün · 6. döngü · 1/6. gün");
    expect(screen.getByText("Antrenmana başla")).toBeTruthy();
    expect(screen.queryByTestId("resume-progress")).toBeNull();

    const upcoming = screen.getByTestId("upcoming-days");
    expect(within(upcoming).getByText("Önümüzdeki 7 gün")).toBeTruthy();
    expect(within(upcoming).getAllByTestId(/^upcoming-day-/)).toHaveLength(7);
    expect(within(upcoming).getAllByText("Koşu").length).toBeGreaterThan(0);

    expect(screen.getByTestId("volume-card")).toBeTruthy();
    expect(screen.getByText("Haftalık hacim")).toBeTruthy();
    // Program subtitle carries the program name and the pass.
    expect(screen.getByText("Üst / Alt + Koşu · 6. döngü")).toBeTruthy();
  });

  test("renders instantly from a warm cache without ever mounting the skeleton", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    setApi(api);
    await signIn(api);
    const qc = makeQueryClient();
    qc.setQueryData(trainingKeys.program, await api.training.program());
    await renderUI(<ProgramScreen />, { queryClient: qc });
    expect(screen.queryByTestId("program-skeleton", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId("today-title")).toHaveTextContent("Üst Vücut A");
  });

  test("the primary action opens the workout modal", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("start-workout")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("start-workout"));
    expect(mockRouter.push).toHaveBeenCalledWith(WORKOUT_ROUTE);
  });

  test("'Ara ver' goes through the reason sheet: a break, the planned day stays next", async () => {
    const { qc } = await mount();
    await waitFor(() => expect(screen.getByTestId("skip-day")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("skip-day"));
    await fireEvent.press(screen.getByTestId("skip-reason-Yorgunum"));
    await fireEvent.press(screen.getByTestId("skip-confirm"));

    await waitFor(() => expect(screen.getAllByText("Bugün atlandı").length).toBeGreaterThan(0));
    expect(cached(qc).todayLog?.isOffDay).toBe(true);
    expect(cached(qc).program.currentDayId).toBe("d1");
    expect(screen.getByTestId("undo-today")).toBeTruthy();
  });

  test("'Bugün başka bir şey yaptım' logs the chosen day and the cycle continues after it", async () => {
    const { api, qc } = await mount();
    const spy = jest.spyOn(api.training, "logDay");
    await openOtherDay();
    // Every day of the cycle is offered; the planned one is marked.
    expect(screen.getAllByTestId(/^other-day-\d+$/)).toHaveLength(6);
    expect(within(screen.getByTestId("other-day-0")).getByText("1. gün · plandaki")).toBeTruthy();
    expect(screen.queryByTestId("resume-planned")).toBeNull(); // nothing chosen yet

    await fireEvent.press(screen.getByTestId("other-day-2")); // Koşu
    expect(screen.getByTestId("resume-planned")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("other-log"));

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ dayId: "d3", resumePlanned: false }));
    await waitFor(() => expect(cached(qc).todayLog?.dayId).toBe("d3"));
    expect(cached(qc).program.currentDayId).toBe("d4");
    await waitFor(() => expect(screen.getByText("Bugün tamamlandı")).toBeTruthy());
    const server = await api.training.program();
    expect(server.program.currentDayId).toBe("d4");
  });

  test("'İdmanı kaçırdım, sıraya geri koy' keeps the missed day next", async () => {
    const { api } = await mount();
    const spy = jest.spyOn(api.training, "logDay");
    await openOtherDay();
    await fireEvent.press(screen.getByTestId("other-day-2"));
    await fireEvent.press(screen.getByTestId("resume-planned"));
    await fireEvent.press(screen.getByTestId("other-log"));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ dayId: "d3", resumePlanned: true }));
    await waitFor(async () => expect((await api.training.program()).program.currentDayId).toBe("d1"));
    expect((await api.training.program()).todayLog?.dayId).toBe("d3");
  });

  test("the other day can be logged set by set: the logger opens on that day", async () => {
    await mount();
    await openOtherDay();
    await fireEvent.press(screen.getByTestId("other-day-4"));
    await fireEvent.press(screen.getByTestId("resume-planned"));
    await fireEvent.press(screen.getByTestId("other-start"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: WORKOUT_ROUTE, params: { dayId: "d5", resumePlanned: "1" } });
  });

  test("a rest day cannot be logged set by set, and a planned day offers no 'sıraya geri koy'", async () => {
    await mount();
    await openOtherDay();
    await fireEvent.press(screen.getByTestId("other-day-3")); // rest
    expect(screen.queryByTestId("other-start")).toBeNull();
    await fireEvent.press(screen.getByTestId("other-day-0")); // the planned day itself
    expect(screen.queryByTestId("resume-planned")).toBeNull();
    expect(screen.queryByTestId("other-jump")).toBeNull();
  });

  test("'Kaydetmeden buradan devam et' moves the pointer and logs nothing", async () => {
    const { api, qc } = await mount();
    await openOtherDay();
    await fireEvent.press(screen.getByTestId("other-day-2"));
    await fireEvent.press(screen.getByTestId("other-jump"));
    await waitFor(() => expect(cached(qc).program.currentDayId).toBe("d3"));
    expect(cached(qc).todayLog).toBeNull();
    await waitFor(async () => expect((await api.training.program()).program.currentDayId).toBe("d3"));
    await waitFor(() => expect(screen.getByTestId("today-title")).toHaveTextContent("Koşu"));
  });

  test("a rest day: 'Dinlendim' completes it through logDay and the cycle advances (B1)", async () => {
    const { api, qc } = await mount(withRestDay(trainingState()));
    await waitFor(() => expect(screen.getByText("Dinlenme günü")).toBeTruthy());
    expect(screen.queryByTestId("start-workout")).toBeNull();
    expect(screen.queryByTestId("skip-day")).toBeNull();
    const restId = cached(qc).program.currentDayId;
    const logDay = jest.spyOn(api.training, "logDay");
    const skip = jest.spyOn(api.training, "skip");
    await fireEvent.press(screen.getByTestId("rest-done"));

    await waitFor(() => expect(screen.getByText("Dinlenme tamam")).toBeTruthy());
    expect(logDay).toHaveBeenCalledWith({ dayId: restId });
    expect(skip).not.toHaveBeenCalled();
    const server = await api.training.program();
    expect(server.todayLog?.dayId).toBe(restId);
    expect(server.todayLog?.isBreak).toBe(false);
    expect(server.program.currentDayId).not.toBe(restId);
  });

  test("a completed day shows the summary; 'Geri al' reopens it", async () => {
    await mount(withCompletedToday(trainingState()));
    await waitFor(() => expect(screen.getByText("Bugün tamamlandı")).toBeTruthy());
    expect(screen.queryByTestId("start-workout")).toBeNull();
    await fireEvent.press(screen.getByTestId("open-today-log"));
    await waitFor(() => expect(screen.getByTestId("log-muscle-chips")).toBeTruthy());
    // Deleting belongs to "Geçmiş"; the plan pane's detail is read-only.
    expect(screen.queryByTestId("log-delete")).toBeNull();

    await fireEvent.press(screen.getByTestId("undo-today"));
    await waitFor(() => expect(screen.getByTestId("start-workout")).toBeTruthy());
  });

  test("a logged day in the list opens its log", async () => {
    await mount(withCompletedToday(trainingState()));
    await waitFor(() => expect(screen.getByText("Bugün tamamlandı")).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`upcoming-day-${todayKey()}`));
    await waitFor(() => expect(screen.getByTestId("log-sheet")).toBeTruthy());
    expect(screen.getByTestId("log-muscle-chips")).toBeTruthy();
  });

  test("weekly mode: the calendar week (Monday first) and the week number", async () => {
    await mount(withWeekly(trainingState()));
    await waitFor(() => expect(screen.getByTestId("upcoming-days")).toBeTruthy());
    const upcoming = screen.getByTestId("upcoming-days");
    expect(within(upcoming).getByText("Bu hafta")).toBeTruthy();
    const rows = within(upcoming).getAllByTestId(/^upcoming-day-/);
    expect(rows).toHaveLength(7);
    const slot = weekdaySlot(todayKey());
    expect(rows[slot].props.testID).toBe(`upcoming-day-${todayKey()}`);
    expect(within(upcoming).getByText("Pzt")).toBeTruthy();
    expect(screen.getByTestId("today-eyebrow")).toHaveTextContent(/3\. hafta/);
    // In a week the calendar decides tomorrow: nothing to put back in line.
    await openOtherDay();
    await fireEvent.press(screen.getByTestId(`other-day-${slot === 2 ? 3 : 2}`));
    expect(screen.queryByTestId("resume-planned")).toBeNull();
  });

  test("weekly volume: the program's plan by default, the last 7 days on demand, all 9 muscles on request", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("volume-card")).toBeTruthy());
    const card = screen.getByTestId("volume-card");
    expect(within(card).getByTestId("volume-summary")).toHaveTextContent(/kas önerilen aralıkta/);
    expect(within(card).getByTestId("volume-chest-value")).toHaveTextContent(/set · /);
    await fireEvent.press(screen.getByTestId("volume-source-done"));
    await waitFor(() => expect(within(screen.getByTestId("volume-card")).getByTestId("volume-bars")).toBeTruthy());
    const bars = () => within(screen.getByTestId("volume-card")).queryAllByTestId(/^volume-[a-z]+$/).filter((e) => !["volume-card", "volume-bars", "volume-toggle", "volume-summary", "volume-source"].includes(e.props.testID));
    const before = bars().length;
    if (screen.queryByTestId("volume-toggle")) {
      await fireEvent.press(screen.getByTestId("volume-toggle"));
      await waitFor(() => expect(bars().length).toBeGreaterThan(before));
    }
    expect(bars().length).toBeLessThanOrEqual(9);
  });

  test("the edit button opens the full-screen editor", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("edit-program")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("edit-program"));
    expect(mockRouter.push).toHaveBeenCalledWith(EDITOR_ROUTE);
  });

  test("no program → the empty state offers to build one", async () => {
    await mount(withoutProgram(trainingState()));
    await waitFor(() => expect(screen.getByTestId("no-program")).toBeTruthy());
    expect(screen.getByText("Henüz programın yok")).toBeTruthy();
    expect(screen.queryByTestId("current-day-card")).toBeNull();
    expect(screen.queryByTestId("edit-program")).toBeNull();
    await fireEvent.press(screen.getByText("Program oluştur"));
    expect(mockRouter.push).toHaveBeenCalledWith(EDITOR_ROUTE);
  });
});

describe("ProgramScreen — history and recovery segments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.clearAll();
  });

  async function toHistory() {
    await waitFor(() => expect(screen.getByTestId("training-tabs-history")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("training-tabs-history"));
  }

  test("no history → the empty history state", async () => {
    await mount(withEmptyHistory(trainingState()));
    await toHistory();
    await waitFor(() => expect(screen.getByTestId("no-history")).toBeTruthy());
  });

  test("history rows are grouped by week and open the detail sheet", async () => {
    const { api } = await mount();
    await toHistory();
    const logs = (await api.training.workouts({ limit: 60 })).logs;
    const first = logs[0];
    await waitFor(() => expect(screen.getByTestId(`history-row-${first.id}`)).toBeTruthy());
    // Which label the newest section carries depends on the weekday the suite runs on (see present.test.ts).
    const { user } = await api.auth.me();
    const sections = groupLogsByWeek(logs, user.measurementDay as Weekday, todayKey());
    expect(sections.length).toBeGreaterThan(0);
    expect(screen.getByText(sections[0].title)).toBeTruthy();
    expect(screen.getByTestId("history-count")).toHaveTextContent(/antrenman/);

    await fireEvent.press(screen.getByTestId(`history-row-${first.id}`));
    await waitFor(() => expect(screen.getByTestId("log-muscle-chips")).toBeTruthy());
    expect(screen.getByTestId("log-delete")).toBeTruthy();
  });

  test("a history row says what happened: the load moved, the sets, the time", async () => {
    const { api } = await mount();
    await toHistory();
    const logs = (await api.training.workouts({ limit: 60 })).logs;
    const lifted = logs.find((l) => !l.isOffDay && l.strength.some((e) => e.sets.some((s) => (s.weightKg ?? 0) > 0)))!;
    await waitFor(() => expect(screen.getByTestId(`history-row-${lifted.id}`)).toBeTruthy());
    expect(screen.getByTestId(`history-meta-${lifted.id}`)).toHaveTextContent(/kg/);
    expect(screen.getByTestId(`history-meta-${lifted.id}`)).toHaveTextContent(/set/);
  });

  test("deleting a session hides the row and offers undo before the request fires", async () => {
    const { api } = await mount();
    await toHistory();
    const logs = (await api.training.workouts({ limit: 60 })).logs;
    const victim = logs[0];
    await waitFor(() => expect(screen.getByTestId(`history-row-${victim.id}`)).toBeTruthy());

    await fireEvent.press(screen.getByTestId(`history-delete-${victim.id}`));
    await waitFor(() => expect(screen.getByTestId("undo-bar")).toBeTruthy());
    expect(screen.queryByTestId(`history-row-${victim.id}`)).toBeNull();

    await fireEvent.press(screen.getByTestId("undo-delete"));
    await waitFor(() => expect(screen.getByTestId(`history-row-${victim.id}`)).toBeTruthy());
    expect((await api.training.workouts({ limit: 60 })).logs.some((l) => l.id === victim.id)).toBe(true);
  });

  test("the segmented control swaps in the recovery grid and back", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("current-day-card")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("training-tabs-recovery"));
    await waitFor(() => expect(screen.getByTestId("recovery-overall")).toBeTruthy());
    expect(screen.getByTestId("muscle-grid")).toBeTruthy();
    expect(screen.getByTestId("muscle-chest")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("training-tabs-program"));
    await waitFor(() => expect(screen.getByTestId("current-day-card")).toBeTruthy());
  });
});

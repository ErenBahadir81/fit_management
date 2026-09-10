import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { shiftKey, weekKeyFor } from "@fitfloow/core";
import { makeQueryClient, renderUI } from "../../helpers";
import { mockRouter } from "../../mocks/expo-router";
import { WeeklyReportScreen } from "../../../src/features/reports/WeeklyReportScreen";
import { REPORT_KEYS } from "../../../src/features/reports/useReport";
import { deficitSentence, weekLabel } from "../../../src/features/reports/reportMath";
import { useSession } from "../../../src/features/auth/session";
import { setApi } from "../../../src/lib/api";
import { todayKey } from "../../../src/lib/dates";
import { createFakeApi } from "../../../src/lib/fake";
import { fmtKcal, fmtKg } from "../../../src/lib/format";

jest.mock("expo-router", () => jest.requireActual("../../mocks/expo-router"));

// Real Türkiye clock (the screen uses it for the week switcher); the demo user's week starts on Sunday.
const TODAY = todayKey();
const CURRENT = weekKeyFor(TODAY, 0);
const makeApi = () => createFakeApi({ latencyMs: 0, signedIn: true, today: () => TODAY });

describe("WeeklyReportScreen", () => {
  let api: ReturnType<typeof makeApi>;
  beforeEach(async () => {
    jest.clearAllMocks();
    api = makeApi();
    setApi(api);
    useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  });

  test("skeleton, then the magazine page: score ring + count-up, Floo's line, deficit sentence, cards, highlights, history", async () => {
    await renderUI(<WeeklyReportScreen />, { queryClient: makeQueryClient() });
    expect(screen.getByTestId("report-skeleton", { includeHiddenElements: true })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("report-hero")).toBeTruthy());
    const report = await api.reports.weekly();
    expect(screen.getByTestId("report-score-ring").props.accessibilityValue).toMatchObject({ now: Math.round(report.score) });
    expect(screen.getByTestId("report-score").props.accessibilityLabel).toBe(String(Math.round(report.score)));
    expect(screen.getByTestId("report-bubble").props.accessibilityLabel).toBe(`Floo: ${report.mascot.text}`);
    expect(screen.getByTestId("report-floo")).toBeTruthy();
    expect(screen.getByTestId("report-live")).toBeTruthy();
    expect(screen.getByTestId("week-label").props.children).toBe(weekLabel(CURRENT));
    expect(screen.getByTestId("report-deficit-sentence").props.children).toBe(deficitSentence(report, fmtKcal, fmtKg));
    expect(screen.getByTestId("report-deficit-bars")).toBeTruthy();
    expect(screen.getByTestId("report-ewma-delta")).toBeTruthy();
    expect(screen.getByTestId("report-sessions").props.children.join("")).toBe(`${report.training.sessions}/${report.training.plannedSessions}`);
    expect(screen.getByTestId("report-track")).toBeTruthy();
    expect(screen.getByText(report.highlights[0])).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId(/^history-/).length).toBe(12));
    expect(screen.getByTestId("week-next").props.accessibilityState).toMatchObject({ disabled: true });
  });

  test("‹ › switch weeks: the previous week is a finished report without the live badge; › returns to the live week", async () => {
    await renderUI(<WeeklyReportScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("report-hero")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("week-prev"));
    const prevKey = shiftKey(CURRENT, -7);
    await waitFor(() => expect(screen.getByTestId("week-label").props.children).toBe(weekLabel(prevKey)));
    await waitFor(() => expect(screen.queryByTestId("report-live")).toBeNull());
    const past = await api.reports.weekly(prevKey);
    await waitFor(() => expect(screen.getByTestId("report-score").props.accessibilityLabel).toBe(String(Math.round(past.score))));
    expect(screen.getByText("Tamamlandı")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("week-next"));
    await waitFor(() => expect(screen.getByTestId("report-live")).toBeTruthy());
  });

  test("a history tile jumps to that week; a deep link opens a given week", async () => {
    const qc = makeQueryClient();
    await renderUI(<WeeklyReportScreen />, { queryClient: qc });
    await waitFor(() => expect(screen.getAllByTestId(/^history-/).length).toBe(12));
    const target = shiftKey(CURRENT, -21);
    await fireEvent.press(screen.getByTestId(`history-${target}`));
    await waitFor(() => expect(screen.getByTestId("week-label").props.children).toBe(weekLabel(target)));
    await waitFor(() => expect(qc.getQueryData(REPORT_KEYS.weekly(target))).toBeTruthy());
    expect(screen.getByTestId(`history-${target}`).props.accessibilityState).toMatchObject({ selected: true });

    await renderUI(<WeeklyReportScreen initialWeek="2026-08-26" />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getAllByTestId("week-label").at(-1)?.props.children).toBe(weekLabel("2026-08-23")));
  });

  test("goal card routes to the roadmap; without a goal it routes to setup", async () => {
    await renderUI(<WeeklyReportScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("report-goal")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("report-goal"));
    expect(mockRouter.push).toHaveBeenCalledWith("/(modals)/goal/roadmap");

    await api.goals.abandon();
    await renderUI(<WeeklyReportScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getAllByText("Hedef belirle").length).toBeGreaterThan(0));
    await fireEvent.press(screen.getAllByTestId("report-goal").at(-1)!);
    expect(mockRouter.push).toHaveBeenCalledWith("/(modals)/goal/setup");
  });
});

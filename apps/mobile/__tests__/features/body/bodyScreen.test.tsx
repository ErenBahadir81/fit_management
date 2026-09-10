import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { round, type BodySummary, type BodyTrends } from "@fitfloow/core";
import { makeQueryClient, renderUI } from "../../helpers";
import { mockRouter } from "../../mocks/expo-router";
import { BodyScreen } from "../../../src/features/body/BodyScreen";
import { BODY_KEYS } from "../../../src/features/body/useBody";
import { weighInDefault } from "../../../src/features/body/bodyMath";
import { useSession } from "../../../src/features/auth/session";
import { setApi } from "../../../src/lib/api";
import { createFakeApi } from "../../../src/lib/fake";
import { fmtNumber, fmtPct } from "../../../src/lib/format";

jest.mock("expo-router", () => require("../../mocks/expo-router"));
jest.mock("@shopify/flash-list", () => require("../../mocks/flashList").flashListMock());
jest.mock("@shopify/flash-list/dist/recyclerview/utils/measureLayout", () => require("../../mocks/flashList").measureLayoutMock());
jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => require("../../mocks/swipeable"));

const TODAY = "2026-09-10";
const makeApi = (latencyMs = 0) => createFakeApi({ latencyMs, signedIn: true, today: () => TODAY });

describe("BodyScreen", () => {
  let api: ReturnType<typeof makeApi>;
  beforeEach(async () => {
    jest.clearAllMocks();
    api = makeApi();
    setApi(api);
    useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  });

  test("skeleton first, then the hero (trend weight, bf pill ±3,5), chart, links and history rows", async () => {
    await renderUI(<BodyScreen />, { queryClient: makeQueryClient() });
    expect(screen.getByTestId("body-skeleton", { includeHiddenElements: true })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("body-hero")).toBeTruthy());
    const summary = await api.body.summary();
    expect(screen.getByTestId("body-hero-weight").props.accessibilityLabel).toBe(fmtNumber(summary.ewmaWeightKg, 1));
    const hero = within(screen.getByTestId("body-hero"));
    expect(hero.getByText(fmtPct(summary.latest!.bodyFatPct, 1))).toBeTruthy();
    expect(hero.getByText(/±3,5/)).toBeTruthy();
    expect(screen.getByTestId("weighin-save")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("body-trend")).toBeTruthy());
    await waitFor(() => expect(screen.getAllByTestId(/^entry-row-/).length).toBe(6));
    expect(screen.getByText("Ölçüm ekle")).toBeTruthy();
    expect(screen.getByTestId("body-goal-link")).toBeTruthy();
    expect(screen.getByTestId("body-report-link")).toBeTruthy();
  });

  test("renders instantly from a warm cache without mounting the skeleton", async () => {
    const qc = makeQueryClient();
    qc.setQueryData(BODY_KEYS.summary, await api.body.summary());
    await renderUI(<BodyScreen />, { queryClient: qc });
    expect(screen.queryByTestId("body-skeleton", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId("body-hero")).toBeTruthy();
  });

  test("quick weigh-in is optimistic: hero + trend caches move before the server answers, then persist", async () => {
    const slow = makeApi(250);
    setApi(slow);
    const qc = makeQueryClient();
    qc.setQueryData(BODY_KEYS.summary, await api.body.summary());
    qc.setQueryData(BODY_KEYS.trends(90), await api.body.trends(90));
    await renderUI(<BodyScreen />, { queryClient: qc });
    const before = weighInDefault(qc.getQueryData<BodySummary>(BODY_KEYS.summary));
    const expected = round(before - 0.1, 1);

    await fireEvent.press(screen.getByTestId("weighin-stepper-dec"));
    await fireEvent.press(screen.getByTestId("weighin-save"));

    await waitFor(() => expect(qc.getQueryData<BodySummary>(BODY_KEYS.summary)?.latestWeighIn?.weightKg).toBe(expected));
    expect(slow.fake.weighIns.some((w) => w.dateKey === TODAY)).toBe(false); // server has not answered yet
    const trends = qc.getQueryData<BodyTrends>(BODY_KEYS.trends(90))!;
    expect(trends.points[trends.points.length - 1]).toMatchObject({ dateKey: TODAY, weightKg: expected });
    expect(screen.getByTestId("weighin-save").props.accessibilityState).toMatchObject({ busy: true });

    await waitFor(() => expect(slow.fake.weighIns.some((w) => w.dateKey === TODAY && w.weightKg === expected)).toBe(true), { timeout: 3000 });
    await waitFor(() => expect(screen.getByText("Kaydedildi")).toBeTruthy());
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
  });

  test("a failed weigh-in rolls the caches back and shows an error toast", async () => {
    api.body.createWeighIn = (async () => {
      throw new Error("offline");
    }) as typeof api.body.createWeighIn;
    const qc = makeQueryClient();
    await renderUI(<BodyScreen />, { queryClient: qc });
    await waitFor(() => expect(screen.getByTestId("weighin-save")).toBeTruthy());
    await waitFor(() => expect(qc.getQueryData<BodyTrends>(BODY_KEYS.trends(90))).toBeTruthy());
    const summaryBefore = qc.getQueryData<BodySummary>(BODY_KEYS.summary)!;
    await fireEvent.press(screen.getByTestId("weighin-stepper-inc"));
    await fireEvent.press(screen.getByTestId("weighin-save"));
    await waitFor(() => expect(screen.getByText(/kaydedilemedi/i)).toBeTruthy());
    expect(qc.getQueryData<BodySummary>(BODY_KEYS.summary)?.latestWeighIn?.weightKg).toBe(summaryBefore.latestWeighIn?.weightKg);
    expect(qc.getQueryData<BodyTrends>(BODY_KEYS.trends(90))?.points.some((p) => p.dateKey === TODAY)).toBe(false);
  });

  test("a history row can be deleted through its accessibility action (swipe alternative)", async () => {
    await renderUI(<BodyScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getAllByTestId(/^entry-row-/).length).toBe(6));
    const first = screen.getAllByTestId(/^entry-row-/)[0];
    const id = String(first.props.testID).replace("entry-row-", "");
    await fireEvent(first, "accessibilityAction", { nativeEvent: { actionName: "delete" } });
    await waitFor(() => expect(screen.getAllByTestId(/^entry-row-/).length).toBe(5));
    await waitFor(() => expect(api.fake.bodyEntries.some((e) => e.id === id)).toBe(false));
  });

  test("goal / report links route into the modal flows and 'Ölçüm ekle' opens the sheet", async () => {
    await renderUI(<BodyScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("body-goal-link")).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/kaldı/)).toBeTruthy()); // goal progress loaded
    await fireEvent.press(screen.getByTestId("body-goal-link"));
    expect(mockRouter.push).toHaveBeenCalledWith("/(modals)/goal/roadmap");
    await fireEvent.press(screen.getByTestId("body-report-link"));
    expect(mockRouter.push).toHaveBeenCalledWith("/(modals)/report/current");
    expect(screen.queryByTestId("mf-preview")).toBeNull();
    await fireEvent.press(screen.getByTestId("measure-open"));
    expect(screen.getByTestId("mf-preview")).toBeTruthy();
  });

  test("without an active goal the goal card is the setup CTA", async () => {
    await api.goals.abandon();
    await renderUI(<BodyScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByText("Hedef belirle")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("body-goal-link"));
    expect(mockRouter.push).toHaveBeenCalledWith("/(modals)/goal/setup");
  });
});

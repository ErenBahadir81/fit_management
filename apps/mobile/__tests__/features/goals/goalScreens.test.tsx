import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { makeQueryClient, renderUI } from "../../helpers";
import { mockRouter } from "../../mocks/expo-router";
import { GoalSetupScreen } from "../../../src/features/goals/GoalSetupScreen";
import { RoadmapScreen } from "../../../src/features/goals/RoadmapScreen";
import { defaultTarget, instantPlan } from "../../../src/features/goals/goalMath";
import { useSession } from "../../../src/features/auth/session";
import { setApi } from "../../../src/lib/api";
import { createFakeApi } from "../../../src/lib/fake";
import { fmtPct } from "../../../src/lib/format";

jest.mock("expo-router", () => require("../../mocks/expo-router"));
jest.mock("@shopify/flash-list", () => require("../../mocks/flashList").flashListMock());
jest.mock("@shopify/flash-list/dist/recyclerview/utils/measureLayout", () => require("../../mocks/flashList").measureLayoutMock());

const TODAY = "2026-09-10";
const makeApi = () => createFakeApi({ latencyMs: 0, signedIn: true, today: () => TODAY });
const a11y = (el: ReturnType<typeof screen.getByTestId>, actionName: string) => fireEvent(el, "accessibilityAction", { nativeEvent: { actionName } });

describe("GoalSetupScreen", () => {
  let api: ReturnType<typeof makeApi>;
  beforeEach(async () => {
    jest.clearAllMocks();
    api = makeApi();
    setApi(api);
    useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  });

  test("current bf, a default target 5 points lower, the instant preview, and slider snapping through a11y actions", async () => {
    await api.goals.abandon();
    await renderUI(<GoalSetupScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("goal-slider")).toBeTruthy());
    const summary = await api.body.summary();
    const bf = summary.latest!.bodyFatPct;
    const def = defaultTarget("male", bf);
    expect(screen.getByText(fmtPct(bf))).toBeTruthy();
    expect(screen.getByTestId("goal-target").props.children).toBe(fmtPct(def, 1));

    const user = (await api.auth.me()).user;
    const plan = instantPlan({ sex: "male", weightKg: summary.latest!.weightKg, bodyFatPct: bf, heightCm: summary.latest!.heightCm, birthDate: user.birthDate, activityLevel: user.activityLevel, targetBodyFatPct: def, profile: "optimal", todayKey: TODAY });
    expect(screen.getByTestId("preview-weeks").props.children).toBe(`${plan.estimatedWeeks} hafta`);
    expect(screen.getByTestId("goal-slider").props.accessibilityValue).toMatchObject({ min: 5, now: def });

    await a11y(screen.getByTestId("goal-slider"), "decrement");
    expect(screen.getByTestId("goal-target").props.children).toBe(fmtPct(def - 0.5, 1));
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    await a11y(screen.getByTestId("goal-slider"), "increment");
    await a11y(screen.getByTestId("goal-slider"), "increment");
    expect(screen.getByTestId("goal-target").props.children).toBe(fmtPct(def + 0.5, 1));
    // pace switch changes the preview
    await fireEvent.press(screen.getByTestId("goal-profile-aggressive"));
    await waitFor(() => expect(screen.getByTestId("preview-weeks").props.children).not.toBe(`${plan.estimatedWeeks} hafta`));
  });

  test("'Hedefi başlat' creates the goal, Floo cheers, and the roadmap is one tap away", async () => {
    await api.goals.abandon();
    await renderUI(<GoalSetupScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("goal-submit")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("goal-submit"));
    await waitFor(() => expect(screen.getByText("Yola çıktık")).toBeTruthy());
    expect(api.fake.goal?.status).toBe("active");
    expect(api.fake.goal?.profile).toBe("optimal");
    expect(screen.getByTestId("goal-success-floo")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("goal-success-bubble").props.accessibilityLabel).toMatch(/Floo: .*(hafta|%|kg)/));
    await fireEvent.press(screen.getByTestId("goal-see-roadmap"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/(modals)/goal/roadmap");
  });

  test("edit mode preloads the active target/pace and PATCHes the goal", async () => {
    await renderUI(<GoalSetupScreen mode="edit" />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("goal-target").props.children).toBe(fmtPct(15, 1)));
    expect(screen.getByTestId("goal-profile-conservative").props.accessibilityState).toMatchObject({ selected: true });
    await a11y(screen.getByTestId("goal-slider"), "decrement");
    await fireEvent.press(screen.getByText("Hedefi güncelle"));
    await waitFor(() => expect(api.fake.goal?.targetBodyFatPct).toBe(14.5));
    expect(api.fake.goal?.start.dateKey).toBe("2026-08-13"); // start preserved
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  test("without a measurement the screen asks for one instead of a slider", async () => {
    api.fake.bodyEntries = [];
    await renderUI(<GoalSetupScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByText("Önce bir ölçüm gerekli")).toBeTruthy());
    expect(screen.queryByTestId("goal-slider")).toBeNull();
  });
});

describe("RoadmapScreen", () => {
  let api: ReturnType<typeof makeApi>;
  beforeEach(async () => {
    jest.clearAllMocks();
    api = makeApi();
    setApi(api);
    useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  });

  test("progress ring, on-track chip, chart and the week list with the current week highlighted", async () => {
    await renderUI(<RoadmapScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("roadmap-ring")).toBeTruthy());
    const { goal, progress } = await api.goals.current();
    expect(screen.getByTestId("roadmap-ring").props.accessibilityValue).toMatchObject({ now: Math.round(progress!.percentComplete) });
    expect(screen.getByTestId("roadmap-pct").props.accessibilityLabel).toBe(String(Math.round(progress!.percentComplete)));
    expect(screen.getByText("Rotada")).toBeTruthy();
    expect(screen.getByTestId("plan-chart")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId(/^week-row-/).length).toBe(goal!.plan.roadmap.length));
    expect(screen.getByText("Bu hafta")).toBeTruthy();
    expect(screen.getByTestId(`week-row-${progress!.weekIndexInPlan}`)).toBeTruthy();
  });

  test("recalibration applies the measured TDEE and explains the result in a sheet", async () => {
    await renderUI(<RoadmapScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("roadmap-recalibrate")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("roadmap-recalibrate"));
    await waitFor(() => expect(screen.getByTestId("recalibrate-result")).toBeTruthy());
    expect(screen.getByText("Plan güncellendi")).toBeTruthy();
    expect(screen.getByText("Ölçülen TDEE")).toBeTruthy();
    expect(api.fake.goal?.tdeeOverride).not.toBeNull();
  });

  test("overflow menu: abandoning asks for an inline confirmation, then leaves", async () => {
    await renderUI(<RoadmapScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("roadmap-menu")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("roadmap-menu"));
    await fireEvent.press(screen.getByTestId("menu-edit"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/(modals)/goal/setup", params: { mode: "edit" } });
    expect(screen.queryByTestId("menu-abandon-confirm")).toBeNull();
    await fireEvent.press(screen.getByTestId("menu-abandon"));
    await fireEvent.press(screen.getByTestId("menu-abandon-confirm"));
    await waitFor(() => expect(api.fake.goal?.status).toBe("abandoned"));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  test("without an active goal it offers the setup", async () => {
    await api.goals.abandon();
    await renderUI(<RoadmapScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByText("Aktif hedef yok")).toBeTruthy());
    await fireEvent.press(screen.getByText("Hedef belirle"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/(modals)/goal/setup");
  });
});

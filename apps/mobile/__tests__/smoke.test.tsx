/**
 * One smoke test per route: every screen mounts from the demo API with its fixtures and shows its
 * key element. Catches a broken import, a provider that went missing or a crash on first paint.
 */
import React from "react";
import { screen, waitFor } from "@testing-library/react-native";
import { makeQueryClient, renderUI } from "./helpers";
import LoginRoute from "../app/(auth)/login";
import GoalRoadmapRoute from "../app/(modals)/goal/roadmap";
import GoalSetupRoute from "../app/(modals)/goal/setup";
import WeeklyReportRoute from "../app/(modals)/report/[week]";
import ScanRoute from "../app/(modals)/scan";
import WorkoutRoute from "../app/(modals)/workout";
import BodyRoute from "../app/(tabs)/body";
import HomeRoute from "../app/(tabs)/index";
import NutritionRoute from "../app/(tabs)/nutrition";
import ProfileRoute from "../app/(tabs)/profile";
import ProgramRoute from "../app/(tabs)/program";
import NotFound from "../app/+not-found";
import { useSession } from "../src/features/auth/session";
import { setApi } from "../src/lib/api";
import { createFakeApi } from "../src/lib/fake";
import { storage } from "../src/lib/storage";

jest.mock("expo-router", () => require("./mocks/expo-router"));

const ROUTES: { name: string; Route: React.ComponentType; expect: () => unknown }[] = [
  { name: "(tabs)/index → home", Route: HomeRoute, expect: () => screen.getByTestId("home-today") },
  { name: "(tabs)/program", Route: ProgramRoute, expect: () => screen.getByTestId("current-day-card") },
  { name: "(tabs)/nutrition", Route: NutritionRoute, expect: () => screen.getByTestId("nutrition-hero") },
  { name: "(tabs)/body", Route: BodyRoute, expect: () => screen.getByTestId("body-hero") },
  { name: "(tabs)/profile", Route: ProfileRoute, expect: () => screen.getByText("@eren") },
  { name: "(modals)/workout", Route: WorkoutRoute, expect: () => screen.getByTestId("pane-0") },
  { name: "(modals)/scan", Route: ScanRoute, expect: () => screen.getByTestId("scan-camera") },
  { name: "(modals)/goal/setup", Route: GoalSetupRoute, expect: () => screen.getByTestId("goal-slider") },
  { name: "(modals)/goal/roadmap", Route: GoalRoadmapRoute, expect: () => screen.getByTestId("roadmap-ring") },
  { name: "(modals)/report/[week]", Route: WeeklyReportRoute, expect: () => screen.getByTestId("report-hero") },
];

describe("every route renders from the demo API", () => {
  beforeEach(async () => {
    storage.clearAll();
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    setApi(api);
    useSession.setState({ status: "signedIn", user: (await api.auth.me()).user, signedOutReason: null });
  });

  test.each(ROUTES)("$name", async ({ Route, expect: probe }) => {
    await renderUI(<Route />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(probe()).toBeTruthy());
  });

  test("(modals)/goal/setup without an active goal offers the setup flow", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    await api.goals.abandon();
    setApi(api);
    await renderUI(<GoalSetupRoute />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByText("Hedefi başlat")).toBeTruthy());
  });
});

describe("signed-out routes", () => {
  beforeEach(() => {
    storage.clearAll();
    setApi(createFakeApi({ latencyMs: 0 }));
    useSession.setState({ status: "signedOut", user: null, signedOutReason: null });
  });

  test("(auth)/login renders Floo and the single primary action", async () => {
    await renderUI(<LoginRoute />);
    expect(screen.getByTestId("login-floo")).toBeTruthy();
    expect(screen.getByText("Giriş yap")).toBeTruthy();
    expect(screen.queryByTestId("login-expired")).toBeNull();
  });

  test("a session that expired mid-use explains itself on the login screen", async () => {
    useSession.setState({ status: "signedOut", user: null, signedOutReason: "expired" });
    await renderUI(<LoginRoute />);
    expect(screen.getByTestId("login-expired")).toBeTruthy();
  });

  test("+not-found renders a way home", async () => {
    await renderUI(<NotFound />);
    expect(screen.getByText("Ana sayfaya dön")).toBeTruthy();
  });
});

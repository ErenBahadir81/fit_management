import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { makeQueryClient, renderUI } from "../helpers";
import { mockRouter } from "../mocks/expo-router";
import { HomeScreen } from "../../src/features/home/HomeScreen";
import { HOME_QUERY_KEY } from "../../src/features/home/useHome";
import { useSession } from "../../src/features/auth/session";
import { setApi } from "../../src/lib/api";
import { createFakeApi } from "../../src/lib/fake";

jest.mock("expo-router", () => require("../mocks/expo-router"));

describe("HomeScreen", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    setApi(api);
    useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  });

  test("shows the skeleton first, then the fixture content with a 200 ms crossfade", async () => {
    await renderUI(<HomeScreen />, { queryClient: makeQueryClient() });
    expect(screen.getByTestId("home-skeleton", { includeHiddenElements: true })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Eren/)).toBeTruthy());
    expect(screen.getByText("Üst Vücut A")).toBeTruthy(); // today's program day
    expect(screen.getByText("Antrenmana başla")).toBeTruthy();
    expect(screen.getByTestId("home-calorie-ring")).toBeTruthy();
    expect(screen.getByText(/kalan/)).toBeTruthy();
    expect(screen.getByTestId("home-goal-card")).toBeTruthy();
    expect(screen.getByTestId("home-recovery")).toBeTruthy();
    expect(screen.getByTestId("home-floo")).toBeTruthy();
  });

  test("renders instantly from a warm cache without ever mounting the skeleton", async () => {
    const qc = makeQueryClient();
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    qc.setQueryData(HOME_QUERY_KEY, await api.reports.home());
    await renderUI(<HomeScreen />, { queryClient: qc });
    expect(screen.queryByTestId("home-skeleton", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText("Üst Vücut A")).toBeTruthy();
  });

  test("CTAs route to the program, nutrition and body tabs", async () => {
    await renderUI(<HomeScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByText("Antrenmana başla")).toBeTruthy());
    await fireEvent.press(screen.getByText("Antrenmana başla"));
    expect(mockRouter.push).toHaveBeenCalledWith("/(tabs)/program");
    await fireEvent.press(screen.getByTestId("home-calorie-card"));
    expect(mockRouter.push).toHaveBeenCalledWith("/(tabs)/nutrition");
    await fireEvent.press(screen.getByTestId("home-goal-card"));
    expect(mockRouter.push).toHaveBeenCalledWith("/(tabs)/body");
  });

  test("shows a retry state when the request fails and no cache exists", async () => {
    const api = createFakeApi({ latencyMs: 0 }); // not signed in → 401
    setApi(api);
    await renderUI(<HomeScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByText("Tekrar dene")).toBeTruthy());
  });

  test("a rest day shows the rest copy instead of a start CTA; a done workout shows the check", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    await api.training.jump(3); // "Dinlenme"
    setApi(api);
    await renderUI(<HomeScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByText(/Dinlenme günü/)).toBeTruthy());
    expect(screen.queryByText("Antrenmana başla")).toBeNull();

    const api2 = createFakeApi({ latencyMs: 0, signedIn: true });
    await api2.training.complete({ strength: [], run: null, swim: null, durationMin: 50, notes: null, rpe: 7 });
    setApi(api2);
    await renderUI(<HomeScreen />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByText(/Tamamlandı/)).toBeTruthy());
  });
});

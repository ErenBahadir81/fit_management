import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { makeQueryClient, renderUI } from "../../../../__tests__/helpers";
import { useSession } from "../../auth/session";
import { setApi } from "../../../lib/api";
import { createFakeApi } from "../../../lib/fake";
import { trainingKeys } from "../queries";
import { RecoveryPanel } from "./RecoveryPanel";

jest.mock("expo-router", () => require("../../../../__tests__/mocks/expo-router"));

async function mount(latencyMs = 0) {
  const api = createFakeApi({ latencyMs, signedIn: true });
  setApi(api);
  useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  const qc = makeQueryClient();
  await renderUI(<RecoveryPanel />, { queryClient: qc });
  return { api, qc };
}

describe("RecoveryPanel", () => {
  beforeEach(() => jest.clearAllMocks());

  test("skeleton first, then the overall ring and a card per muscle", async () => {
    const { api } = await mount(20);
    expect(screen.getByTestId("recovery-skeleton", { includeHiddenElements: true })).toBeTruthy();

    await waitFor(() => expect(screen.getByTestId("recovery-overall")).toBeTruthy());
    const view = await api.training.recovery();
    expect(screen.getByTestId("muscle-grid")).toBeTruthy();
    for (const m of view.muscles) expect(screen.getByTestId(`muscle-${m.key}`)).toBeTruthy();
    expect(screen.getByText("Genel toparlanma")).toBeTruthy();
  });

  test("cards are ordered least-recovered first and carry a spoken status", async () => {
    const { api } = await mount();
    await waitFor(() => expect(screen.getByTestId("muscle-grid")).toBeTruthy());
    const view = await api.training.recovery();
    const worst = [...view.muscles].sort((a, b) => a.readiness - b.readiness)[0];
    const grid = screen.getByTestId("muscle-grid");
    expect(within(grid).getAllByRole("button")[0].props.accessibilityLabel).toContain(worst.name);
    expect(screen.getByTestId(`muscle-${worst.key}`).props.accessibilityLabel).toMatch(/%\d+ hazır/);
  });

  test("tapping a muscle opens the detail sheet with the curve and weekly sets", async () => {
    const { api } = await mount();
    await waitFor(() => expect(screen.getByTestId("muscle-chest")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("muscle-chest"));

    await waitFor(() => expect(screen.getByTestId("muscle-sheet")).toBeTruthy());
    const sheet = within(screen.getByTestId("muscle-sheet"));
    expect(sheet.getByText("Bu haftaki set")).toBeTruthy();
    expect(sheet.getByText("Son çalışma")).toBeTruthy();
    expect(screen.getByTestId("recovery-curve", { includeHiddenElements: true })).toBeTruthy();
    const chest = (await api.training.recovery()).muscles.find((m) => m.key === "chest")!;
    expect(sheet.getByText(`Tam toparlanma ${chest.fullRecoveryHours} sa`)).toBeTruthy();
  });

  test("an error with no cache offers a retry", async () => {
    setApi(createFakeApi({ latencyMs: 0 })); // signed out → 401
    await renderUI(<RecoveryPanel />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByText("Tekrar dene")).toBeTruthy());
  });

  test("a warm cache paints without the skeleton", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    setApi(api);
    const qc = makeQueryClient();
    qc.setQueryData(trainingKeys.recovery, await api.training.recovery());
    await renderUI(<RecoveryPanel />, { queryClient: qc });
    expect(screen.queryByTestId("recovery-skeleton", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId("recovery-overall")).toBeTruthy();
  });
});

import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { shiftKey, type NutritionDayView } from "@fitfloow/core";
import { QueryClient } from "@tanstack/react-query";
import { renderUI } from "../../../__tests__/helpers";
import { mockRouter } from "../../../__tests__/mocks/expo-router";
import { useSession } from "../auth/session";
import { getApi, setApi } from "../../lib/api";
import { todayKey } from "../../lib/dates";
import { createNutritionFakeApi } from "../../lib/fake/nutritionFake";
import { NutritionScreen } from "./NutritionScreen";
import { nutritionDayKey } from "./useNutrition";

jest.mock("expo-router", () => require("../../../__tests__/mocks/expo-router"));

const today = todayKey();

/**
 * Like the shared `makeQueryClient` but mutations are garbage-collected at once: react-query's
 * default 5-minute mutation GC timer keeps the jest event loop alive after the suite finishes.
 */
function testClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
}

async function signedInApi(latencyMs = 0) {
  const api = createNutritionFakeApi({ latencyMs, signedIn: true });
  setApi(api);
  useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  return api;
}

describe("NutritionScreen — day", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await signedInApi();
  });

  test("shows the skeleton first, then today's ring and meal sections", async () => {
    await signedInApi(30); // a beat of latency so the cold first paint is the skeleton
    await renderUI(<NutritionScreen />, { queryClient: testClient() });
    expect(screen.getByTestId("nutrition-skeleton", { includeHiddenElements: true })).toBeTruthy();

    await waitFor(() => expect(screen.getByTestId("nutrition-hero")).toBeTruthy());
    expect(screen.getByTestId("nutrition-ring")).toBeTruthy();
    expect(screen.getByText("Kahvaltı")).toBeTruthy();
    expect(screen.getByText("Öğle")).toBeTruthy();
    expect(screen.getByText("Akşam")).toBeTruthy();
    expect(screen.getByText("Ara öğün")).toBeTruthy();
    expect(screen.getByText("Tavuk göğsü (ızgara)")).toBeTruthy(); // seeded lunch entry
    expect(screen.getByTestId("macro-protein")).toBeTruthy();
  });

  test("renders straight from a warm cache without mounting the skeleton", async () => {
    const api = await signedInApi();
    const qc = testClient();
    qc.setQueryData(nutritionDayKey(today), await api.nutrition.day(today));
    await renderUI(<NutritionScreen />, { queryClient: qc });
    expect(screen.queryByTestId("nutrition-skeleton", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId("nutrition-hero")).toBeTruthy();
  });

  test("the FAB opens the action sheet; 'Tara' routes to the scan modal with the date and meal", async () => {
    await renderUI(<NutritionScreen />, { queryClient: testClient() });
    await waitFor(() => expect(screen.getByTestId("nutrition-hero")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("nutrition-fab"));
    expect(screen.getByTestId("add-scan")).toBeTruthy();
    expect(screen.getByTestId("add-barcode")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("add-scan"));
    expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/(modals)/scan", params: expect.objectContaining({ date: today }) }));
  });

  test("search → pick a food → add: the entry and the totals update optimistically", async () => {
    await renderUI(<NutritionScreen />, { queryClient: testClient() });
    await waitFor(() => expect(screen.getByTestId("nutrition-hero")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("meal-add-snack"));
    await fireEvent.press(screen.getByTestId("add-search"));

    await fireEvent.changeText(screen.getByTestId("food-search-input"), "muz");
    await waitFor(() => expect(screen.getByTestId("food-f_muz")).toBeTruthy(), { timeout: 3000 }); // 300 ms debounce

    await fireEvent.press(screen.getByTestId("food-f_muz"));
    expect(screen.getByTestId("search-detail-kcal")).toHaveTextContent("107"); // 120 g × 89 kcal/100 g
    await fireEvent.press(screen.getByTestId("search-detail-grams-inc")); // 130 g
    await fireEvent.press(screen.getByTestId("search-detail-submit"));

    await waitFor(() => expect(screen.getByText("Muz")).toBeTruthy());
    expect(screen.getByText("130 g · P 1 · K 30 · Y 0")).toBeTruthy();
  });

  test("tapping an entry edits its grams; deleting offers an undo that restores it", async () => {
    await renderUI(<NutritionScreen />, { queryClient: testClient() });
    await waitFor(() => expect(screen.getByText("Tavuk göğsü (ızgara)")).toBeTruthy());

    const day = await getApi().nutrition.day(today);
    const entry = day.meals.lunch[0];

    await fireEvent.press(screen.getByTestId(`entry-${entry.id}`));
    expect(screen.getByTestId("grams-sheet")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("grams-sheet-grams-inc")); // 150 → 160 g
    await fireEvent.press(screen.getByTestId("grams-sheet-submit"));
    await waitFor(() => expect(screen.getAllByText(/160 g/).length).toBeGreaterThan(0));

    await fireEvent.press(screen.getByTestId(`entry-${entry.id}`));
    await fireEvent.press(screen.getByTestId("grams-sheet-delete"));
    await waitFor(() => expect(screen.getByTestId("undo-delete")).toBeTruthy());
    expect(screen.queryByText("Tavuk göğsü (ızgara)")).toBeNull();

    await fireEvent.press(screen.getByTestId("undo-delete"));
    await waitFor(() => expect(screen.getByText("Tavuk göğsü (ızgara)")).toBeTruthy());
  });

  test("the target sheet switches to manual macros and the ring follows", async () => {
    await renderUI(<NutritionScreen />, { queryClient: testClient() });
    await waitFor(() => expect(screen.getByTestId("nutrition-hero")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("open-target"));
    expect(screen.getByTestId("target-sheet")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("target-mode-manual"));
    await fireEvent.changeText(screen.getByTestId("target-calories"), "2400");
    await fireEvent.press(screen.getByTestId("target-save"));

    await waitFor(() => expect(screen.getByText(/2\.400 kcal/)).toBeTruthy());
  });

  test("the day pager moves to another day and the 'Bugün' pill comes back", async () => {
    await renderUI(<NutritionScreen />, { queryClient: testClient() });
    await waitFor(() => expect(screen.getByTestId("nutrition-hero")).toBeTruthy());
    expect(screen.queryByTestId("jump-today")).toBeNull();

    const yesterday = shiftKey(today, -1);
    await fireEvent.press(screen.getByTestId(`day-${yesterday}`));
    await waitFor(() => expect(screen.getByTestId("jump-today")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("jump-today"));
    await waitFor(() => expect(screen.queryByTestId("jump-today")).toBeNull());
  });

  test("the week tab shows the bars, the average and an adherence chip", async () => {
    await renderUI(<NutritionScreen />, { queryClient: testClient() });
    await waitFor(() => expect(screen.getByTestId("nutrition-hero")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("nutrition-tabs-week"));
    await waitFor(() => expect(screen.getByTestId("nutrition-week")).toBeTruthy());
    expect(screen.getByTestId("week-bars")).toBeTruthy();
    expect(screen.getByTestId("week-adherence")).toBeTruthy();
    expect(screen.getByTestId("week-avg")).toBeTruthy();
  });

  test("an unreachable API shows a retry state instead of a crash", async () => {
    setApi(createNutritionFakeApi({ latencyMs: 0 })); // no session → 401
    await renderUI(<NutritionScreen />, { queryClient: testClient() });
    await waitFor(() => expect(screen.getByText("Tekrar dene")).toBeTruthy());
  });
});

describe("NutritionScreen — optimistic rollback", () => {
  test("a failed add is rolled back and the user is told", async () => {
    const api = await signedInApi();
    jest.spyOn(api.nutrition, "addEntry").mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    const qc = testClient();
    const before = (await api.nutrition.day(today)) as NutritionDayView;
    qc.setQueryData(nutritionDayKey(today), before);

    await renderUI(<NutritionScreen />, { queryClient: qc });
    await waitFor(() => expect(screen.getByTestId("nutrition-hero")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("meal-add-snack"));
    await fireEvent.press(screen.getByTestId("add-recent"));
    await waitFor(() => expect(screen.getByTestId("food-f_tavuk")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("quick-f_tavuk-150"));

    await waitFor(() => expect(screen.getByText("Ekleyemedim, tekrar dener misin?")).toBeTruthy());
    const after = qc.getQueryData<NutritionDayView>(nutritionDayKey(today));
    expect(after?.totals.kcal).toBe(before.totals.kcal);
  });
});

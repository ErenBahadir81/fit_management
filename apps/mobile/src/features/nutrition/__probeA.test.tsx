import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { makeQueryClient, renderUI } from "../../../__tests__/helpers";
import { useSession } from "../auth/session";
import { setApi } from "../../lib/api";
import { createNutritionFakeApi } from "../../lib/fake/nutritionFake";
import { NutritionScreen } from "./NutritionScreen";

jest.mock("expo-router", () => require("../../../__tests__/mocks/expo-router"));

async function boot() {
  const api = createNutritionFakeApi({ latencyMs: 0, signedIn: true });
  setApi(api);
  useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
}

test("A: open the search sheet and get results", async () => {
  await boot();
  await renderUI(<NutritionScreen />, { queryClient: makeQueryClient() });
  await waitFor(() => expect(screen.getByTestId("nutrition-hero")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("meal-add-snack"));
  await fireEvent.press(screen.getByTestId("add-search"));
  await fireEvent.changeText(screen.getByTestId("food-search-input"), "muz");
  await waitFor(() => expect(screen.getByTestId("food-f_muz")).toBeTruthy(), { timeout: 3000 });
  await fireEvent.press(screen.getByTestId("food-f_muz"));
  await fireEvent.press(screen.getByTestId("search-detail-submit"));
  await waitFor(() => expect(screen.getByText("Muz")).toBeTruthy());
});

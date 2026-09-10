import React from "react";
import { useMutation } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { Providers, makeQueryClient } from "../../../__tests__/helpers";
import { setApi, getApi } from "../../lib/api";
import { todayKey } from "../../lib/dates";
import { createNutritionFakeApi } from "../../lib/fake/nutritionFake";

const qc = makeQueryClient();
const wrapper = ({ children }: { children: React.ReactNode }) => <Providers queryClient={qc}>{children}</Providers>;

test("D: raw addEntry mutation", async () => {
  const api = createNutritionFakeApi({ latencyMs: 0, signedIn: true });
  setApi(api);
  const { result } = await renderHook(
    () => useMutation({ mutationFn: () => getApi().nutrition.addEntry({ dateKey: todayKey(), meal: "snack", grams: 130, foodId: "f_muz", source: "search" }) }),
    { wrapper }
  );
  result.current.mutate();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

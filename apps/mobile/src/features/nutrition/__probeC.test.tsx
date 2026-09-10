import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { Providers, makeQueryClient } from "../../../__tests__/helpers";
import { useSession } from "../auth/session";
import { setApi } from "../../lib/api";
import { todayKey } from "../../lib/dates";
import { createNutritionFakeApi } from "../../lib/fake/nutritionFake";
import { useAddEntry } from "./useNutrition";

const qc = makeQueryClient();
const wrapper = ({ children }: { children: React.ReactNode }) => <Providers queryClient={qc}>{children}</Providers>;

test("C: add mutation alone", async () => {
  const api = createNutritionFakeApi({ latencyMs: 0, signedIn: true });
  setApi(api);
  useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  const { result } = await renderHook(() => useAddEntry(todayKey()), { wrapper });
  const food = (await api.nutrition.search("muz")).foods[0];
  result.current.mutate({ meal: "snack", grams: 130, food });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

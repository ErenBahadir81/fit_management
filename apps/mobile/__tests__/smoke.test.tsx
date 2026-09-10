import React from "react";
import { screen, waitFor } from "@testing-library/react-native";
import { makeQueryClient, renderUI } from "./helpers";
import BodyRoute from "../app/(tabs)/body";
import NotFound from "../app/+not-found";
import { useSession } from "../src/features/auth/session";
import { setApi } from "../src/lib/api";
import { createFakeApi } from "../src/lib/fake";

jest.mock("expo-router", () => require("./mocks/expo-router"));

test("the body tab route renders its header from the demo API", async () => {
  const api = createFakeApi({ latencyMs: 0, signedIn: true });
  setApi(api);
  useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  await renderUI(<BodyRoute />, { queryClient: makeQueryClient() });
  await waitFor(() => expect(screen.getByText("Vücut")).toBeTruthy());
  expect(screen.getByTestId("body-hero")).toBeTruthy();
});

test("+not-found renders a way home", async () => {
  await renderUI(<NotFound />);
  expect(screen.getByText("Ana sayfaya dön")).toBeTruthy();
});

import React from "react";
import { screen } from "@testing-library/react-native";
import { renderUI } from "./helpers";
import ProgramRoute from "../app/(tabs)/program";
import NotFound from "../app/+not-found";

jest.mock("expo-router", () => require("./mocks/expo-router"));

test("placeholder tab routes render a header and Floo", async () => {
  await renderUI(<ProgramRoute />);
  expect(screen.getByText("Program")).toBeTruthy();
  expect(screen.getByText("Yakında")).toBeTruthy();
});

test("+not-found renders a way home", async () => {
  await renderUI(<NotFound />);
  expect(screen.getByText("Ana sayfaya dön")).toBeTruthy();
});

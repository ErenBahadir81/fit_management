import React from "react";
import { render, screen } from "@testing-library/react-native";
import Index from "../app/index";

test("renders the placeholder screen", async () => {
  await render(<Index />);
  expect(screen.getByText("FitFloow")).toBeTruthy();
});

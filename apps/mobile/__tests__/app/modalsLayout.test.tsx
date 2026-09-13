import React from "react";
import { render, screen } from "@testing-library/react-native";
import ModalsLayout from "../../app/(modals)/_layout";
import { ThemeProvider } from "../../src/theme";

jest.mock("expo-router", () => jest.requireActual("../mocks/expo-router"));

jest.mock("@gorhom/bottom-sheet", () => {
  const react = jest.requireActual("react");
  const rn = jest.requireActual("react-native");
  return {
    ...(jest.requireActual("@gorhom/bottom-sheet/mock") as object),
    BottomSheetModalProvider: ({ children }: { children?: unknown }) =>
      react.createElement(rn.View, { testID: "modal-portal-host" }, children),
  };
});

/**
 * `BottomSheetModal` renders into the *nearest* `BottomSheetModalProvider`. These screens are
 * presented as a native `fullScreenModal`, so without a provider inside this stack every sheet
 * opened from a modal screen portals into the root host and lands *underneath* the native modal:
 * it presents, throws nothing, and is simply never seen — the scan flow stalls on the photo with
 * no error. This guards the provider that keeps the portal host inside the modal.
 *
 * It asserts the wiring, not the native layering — only a device or simulator can show that.
 */
it("hosts the bottom-sheet portal inside the modal stack", async () => {
  await render(
    <ThemeProvider>
      <ModalsLayout />
    </ThemeProvider>
  );
  expect(screen.getByTestId("modal-portal-host")).toBeTruthy();
});

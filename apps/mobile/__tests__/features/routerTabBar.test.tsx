import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderUI } from "../helpers";
import { RouterTabBar } from "../../src/ui/RouterTabBar";

type Props = React.ComponentProps<typeof RouterTabBar>;

describe("RouterTabBar (react-navigation adapter)", () => {
  test("maps the navigation state to the active tab and navigates on press", async () => {
    const navigate = jest.fn();
    const emit = jest.fn(() => ({ defaultPrevented: false }));
    const routes = ["index", "program", "nutrition", "body", "profile"].map((name) => ({ key: `${name}-k`, name }));
    const props = { state: { index: 2, routes }, navigation: { navigate, emit }, descriptors: {}, insets: { top: 0, bottom: 0, left: 0, right: 0 } };
    await renderUI(<RouterTabBar {...(props as unknown as Props)} />);
    expect(screen.getByLabelText("Beslenme").props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByLabelText("Vücut"));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "tabPress", target: "body-k" }));
    expect(navigate).toHaveBeenCalledWith("body");
  });

  test("a prevented tabPress does not navigate", async () => {
    const navigate = jest.fn();
    const emit = jest.fn(() => ({ defaultPrevented: true }));
    const routes = ["index", "program"].map((name) => ({ key: `${name}-k`, name }));
    await renderUI(<RouterTabBar {...({ state: { index: 0, routes }, navigation: { navigate, emit }, descriptors: {}, insets: { top: 0, bottom: 0, left: 0, right: 0 } } as unknown as Props)} />);
    await fireEvent.press(screen.getByLabelText("Program"));
    expect(navigate).not.toHaveBeenCalled();
  });
});

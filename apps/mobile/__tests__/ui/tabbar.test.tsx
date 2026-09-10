import React from "react";
import { act, fireEvent, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { renderUI } from "../helpers";
import { TabBar, TAB_ITEMS, tabIndexForRoute } from "../../src/ui/TabBar";

describe("TabBar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  test("defines the five product tabs in order with Turkish labels", () => {
    expect(TAB_ITEMS.map((t) => t.name)).toEqual(["index", "program", "nutrition", "body", "profile"]);
    expect(TAB_ITEMS.map((t) => t.label)).toEqual(["Ana Sayfa", "Program", "Beslenme", "Vücut", "Profil"]);
    expect(tabIndexForRoute("body")).toBe(3);
    expect(tabIndexForRoute("unknown")).toBe(0);
  });

  test("renders all tabs, marks the active one, switches with a selection haptic and slides the pill", async () => {
    const onChange = jest.fn();
    await renderUI(<TabBar activeIndex={0} onChange={onChange} width={400} />);
    for (const t of TAB_ITEMS) expect(screen.getByLabelText(t.label)).toBeTruthy();
    expect(screen.getByLabelText("Ana Sayfa").props.accessibilityState).toMatchObject({ selected: true });
    const pill = screen.getByTestId("tabbar-pill");
    expect(pill).toHaveAnimatedStyle({ transform: [{ translateX: 0 }] });

    await act(async () => {
      await fireEvent.press(screen.getByLabelText("Vücut"));
    });
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(3);
  });

  test("pill follows activeIndex changes with a spring", async () => {
    const { rerender } = await renderUI(<TabBar activeIndex={0} onChange={() => {}} width={400} />);
    await rerender(<TabBar activeIndex={2} onChange={() => {}} width={400} />);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    // 5 tabs in (400 − 2×gutter) → each 72 wide → index 2 at 144
    expect(screen.getByTestId("tabbar-pill")).toHaveAnimatedStyle({ transform: [{ translateX: 144 }] });
  });

  test("pressing the active tab again does not fire onChange", async () => {
    const onChange = jest.fn();
    await renderUI(<TabBar activeIndex={1} onChange={onChange} width={400} />);
    await fireEvent.press(screen.getByLabelText("Program"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

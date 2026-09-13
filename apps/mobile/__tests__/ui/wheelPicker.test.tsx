import React from "react";
import { act, fireEvent, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { renderUI } from "../helpers";
import { WheelPicker, WHEEL_ROW_HEIGHT } from "../../src/ui/WheelPicker";

const OPTIONS = [
  { value: 1, label: "Ocak" },
  { value: 2, label: "Şubat" },
  { value: 3, label: "Mart" },
  { value: 4, label: "Nisan" },
];

const scrollTo = (testID: string, y: number) =>
  fireEvent(screen.getByTestId(testID), "momentumScrollEnd", { nativeEvent: { contentOffset: { x: 0, y }, contentSize: { height: 1000, width: 100 }, layoutMeasurement: { height: WHEEL_ROW_HEIGHT * 5, width: 100 } } });

const a11y = (testID: string, actionName: string) => fireEvent(screen.getByTestId(testID), "accessibilityAction", { nativeEvent: { actionName } });

describe("WheelPicker", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows every option and marks the selected one", async () => {
    await renderUI(<WheelPicker options={OPTIONS} value={2} onChange={jest.fn()} label="Ay" testID="w" />);
    for (const o of OPTIONS) expect(screen.getByText(o.label)).toBeTruthy();
    expect(screen.getByTestId("w").props.accessibilityValue).toMatchObject({ text: "Şubat" });
  });

  test("settling on a row selects it, once, with a tick", async () => {
    const onChange = jest.fn();
    await renderUI(<WheelPicker options={OPTIONS} value={1} onChange={onChange} label="Ay" testID="w" />);
    await act(async () => scrollTo("w", WHEEL_ROW_HEIGHT * 2));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(3);
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  test("settling back on the row that is already selected changes nothing", async () => {
    const onChange = jest.fn();
    await renderUI(<WheelPicker options={OPTIONS} value={3} onChange={onChange} label="Ay" testID="w" />);
    await act(async () => scrollTo("w", WHEEL_ROW_HEIGHT * 2));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("a scroll past the last row clamps instead of selecting nothing", async () => {
    const onChange = jest.fn();
    await renderUI(<WheelPicker options={OPTIONS} value={1} onChange={onChange} label="Ay" testID="w" />);
    await act(async () => scrollTo("w", WHEEL_ROW_HEIGHT * 99));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  test("is an adjustable for screen readers, and the ends do not wrap", async () => {
    const onChange = jest.fn();
    await renderUI(<WheelPicker options={OPTIONS} value={4} onChange={onChange} label="Ay" testID="w" />);
    expect(screen.getByTestId("w").props.accessibilityRole).toBe("adjustable");
    expect(screen.getByTestId("w").props.accessibilityLabel).toBe("Ay");
    await act(async () => a11y("w", "increment"));
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => a11y("w", "decrement"));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  test("tapping a row picks it without a scroll", async () => {
    const onChange = jest.fn();
    await renderUI(<WheelPicker options={OPTIONS} value={1} onChange={onChange} label="Ay" testID="w" />);
    await fireEvent.press(screen.getByTestId("w-option-4"));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});

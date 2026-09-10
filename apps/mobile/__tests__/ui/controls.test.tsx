import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { renderUI } from "../helpers";
import { Stepper } from "../../src/ui/Stepper";
import { Segmented } from "../../src/ui/Segmented";
import { Toggle } from "../../src/ui/Toggle";
import { TextField } from "../../src/ui/TextField";

describe("Stepper", () => {
  beforeEach(() => jest.clearAllMocks());
  test("increments/decrements by step and clamps to min/max", async () => {
    const onChange = jest.fn();
    await renderUI(<Stepper value={72.5} step={0.1} min={72.5} max={72.7} onChange={onChange} testID="st" format={(v) => `${v.toFixed(1)} kg`} />);
    expect(screen.getByText("72.5 kg")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("st-inc"));
    expect(onChange).toHaveBeenLastCalledWith(72.6);
    await fireEvent.press(screen.getByTestId("st-dec"));
    expect(onChange).toHaveBeenCalledTimes(1); // at min → no call
    expect(screen.getByTestId("st-dec").props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe("Segmented", () => {
  beforeEach(() => jest.clearAllMocks());
  test("renders options, marks the selected one and switches with a selection haptic", async () => {
    const onChange = jest.fn();
    await renderUI(
      <Segmented
        options={[
          { value: "system", label: "Sistem" },
          { value: "light", label: "Açık" },
          { value: "dark", label: "Koyu" },
        ]}
        value="system"
        onChange={onChange}
        testID="seg"
      />
    );
    expect(screen.getByTestId("seg-system").props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent(screen.getByTestId("seg-dark"), "pressIn");
    await fireEvent.press(screen.getByTestId("seg-dark"));
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith("dark");
  });
});

describe("Toggle", () => {
  test("has switch role and toggles value", async () => {
    const onChange = jest.fn();
    await renderUI(<Toggle value={false} onChange={onChange} testID="tg" accessibilityLabel="Maskot" />);
    const el = screen.getByTestId("tg");
    expect(el.props.accessibilityRole).toBe("switch");
    expect(el.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(el);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("TextField", () => {
  test("renders label, forwards text, shows error", async () => {
    const onChangeText = jest.fn();
    await renderUI(<TextField label="Kullanıcı adı" value="" onChangeText={onChangeText} error="Zorunlu" testID="tf" />);
    expect(screen.getByText("Kullanıcı adı")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("tf"), "eren");
    expect(onChangeText).toHaveBeenCalledWith("eren");
    expect(screen.getByText("Zorunlu")).toBeTruthy();
    expect(screen.getByTestId("tf").props.accessibilityLabel).toBe("Kullanıcı adı");
  });
});

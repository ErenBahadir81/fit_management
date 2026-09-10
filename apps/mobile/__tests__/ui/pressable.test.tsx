import React from "react";
import { Text as RNText } from "react-native";
import { fireEvent, screen, act } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { renderUI } from "../helpers";
import { Pressable } from "../../src/ui/Pressable";
import { Button } from "../../src/ui/Button";

describe("Pressable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  test("press-in scales to 0.97 with a light haptic, press-out returns to 1", async () => {
    const onPress = jest.fn();
    await renderUI(
      <Pressable testID="p" onPress={onPress} accessibilityLabel="Tıkla">
        <RNText>hi</RNText>
      </Pressable>
    );
    const el = screen.getByTestId("p");
    expect(el).toHaveAnimatedStyle({ transform: [{ scale: 1 }] });
    await act(async () => {
      await fireEvent(el, "pressIn");
      jest.advanceTimersByTime(1500);
    });
    expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
    expect(el).toHaveAnimatedStyle({ transform: [{ scale: 0.97 }] });
    await act(async () => {
      await fireEvent(el, "pressOut");
      jest.advanceTimersByTime(1500);
    });
    expect(el).toHaveAnimatedStyle({ transform: [{ scale: 1 }] });
    await fireEvent.press(el);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("has a button role and a 44 pt minimum target by default", async () => {
    await renderUI(
      <Pressable testID="p" onPress={() => {}}>
        <RNText>hi</RNText>
      </Pressable>
    );
    const el = screen.getByTestId("p");
    expect(el.props.accessibilityRole).toBe("button");
    expect(el).toHaveStyle({ minHeight: 44 });
  });

  test("disabled: no haptic, no onPress, accessibilityState disabled", async () => {
    const onPress = jest.fn();
    await renderUI(
      <Pressable testID="p" onPress={onPress} disabled>
        <RNText>hi</RNText>
      </Pressable>
    );
    const el = screen.getByTestId("p");
    await fireEvent(el, "pressIn");
    await fireEvent.press(el);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
    expect(el.props.accessibilityState).toMatchObject({ disabled: true });
  });

  test("haptic='none' suppresses feedback, haptic='select' uses selection", async () => {
    await renderUI(
      <>
        <Pressable testID="a" onPress={() => {}} haptic="none">
          <RNText>a</RNText>
        </Pressable>
        <Pressable testID="b" onPress={() => {}} haptic="select">
          <RNText>b</RNText>
        </Pressable>
      </>
    );
    await fireEvent(screen.getByTestId("a"), "pressIn");
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId("b"), "pressIn");
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });
});

describe("Button", () => {
  beforeEach(() => jest.clearAllMocks());

  test("renders its label and forwards presses", async () => {
    const onPress = jest.fn();
    await renderUI(<Button label="Giriş yap" onPress={onPress} />);
    await fireEvent.press(screen.getByText("Giriş yap"));
    expect(onPress).toHaveBeenCalled();
  });

  test("loading state shows a spinner, hides the label from a11y and blocks presses", async () => {
    const onPress = jest.fn();
    await renderUI(<Button label="Kaydet" onPress={onPress} loading testID="btn" />);
    expect(screen.getByTestId("btn-spinner")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("btn"));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId("btn").props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  test("variants render without crashing", async () => {
    await renderUI(
      <>
        <Button label="a" onPress={() => {}} variant="primary" />
        <Button label="b" onPress={() => {}} variant="secondary" />
        <Button label="c" onPress={() => {}} variant="ghost" />
        <Button label="d" onPress={() => {}} variant="danger" size="sm" />
        <Button label="e" onPress={() => {}} variant="primary" icon="add" full />
      </>
    );
    for (const l of ["a", "b", "c", "d", "e"]) expect(screen.getByText(l)).toBeTruthy();
  });
});

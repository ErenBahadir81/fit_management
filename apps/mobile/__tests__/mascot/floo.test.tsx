import React from "react";
import { act, screen } from "@testing-library/react-native";
import { renderUI } from "../helpers";
import { Floo, FLOO_SIZES } from "../../src/mascot/Floo";
import { MOOD_POSE, type Mood } from "../../src/mascot/moods";
import { SpeechBubble } from "../../src/mascot/SpeechBubble";

describe("Floo", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("sizes S/M/L map to pixel sizes", () => {
    expect(FLOO_SIZES.s).toBeLessThan(FLOO_SIZES.m);
    expect(FLOO_SIZES.m).toBeLessThan(FLOO_SIZES.l);
  });

  test("every mood has a pose and moods differ from happy", () => {
    const moods: Mood[] = ["happy", "cheer", "think", "sleepy", "flex", "worried"];
    for (const m of moods) expect(MOOD_POSE[m]).toBeDefined();
    expect(MOOD_POSE.sleepy.tilt).not.toBe(MOOD_POSE.happy.tilt);
    expect(MOOD_POSE.cheer.hop).toBeGreaterThan(MOOD_POSE.happy.hop);
    expect(MOOD_POSE.sleepy.eyeOpen).toBeLessThan(MOOD_POSE.happy.eyeOpen);
  });

  test("renders with an accessibility label naming the mood", async () => {
    await renderUI(<Floo mood="happy" size="m" testID="floo" />);
    const el = screen.getByTestId("floo");
    expect(el.props.accessibilityLabel).toMatch(/Floo/);
    expect(el.props.accessibilityLabel).toMatch(/mutlu/i);
  });

  test("mood change springs the body pose (tilt) to the new target", async () => {
    const { rerender } = await renderUI(<Floo mood="happy" size="m" testID="floo" />);
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    const body = screen.getByTestId("floo-body");
    expect(body).toHaveAnimatedStyle({ transform: [{ translateY: -MOOD_POSE.happy.hop }, { rotate: `${MOOD_POSE.happy.tilt}deg` }] }, { shouldMatchAllProps: false });
    await rerender(<Floo mood="sleepy" size="m" testID="floo" />);
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(body).toHaveAnimatedStyle({ transform: [{ translateY: -MOOD_POSE.sleepy.hop }, { rotate: `${MOOD_POSE.sleepy.tilt}deg` }] }, { shouldMatchAllProps: false });
  });

  test("cheer hops up (negative translateY)", async () => {
    await renderUI(<Floo mood="cheer" size="m" testID="floo" />);
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.getByTestId("floo-body")).toHaveAnimatedStyle({ transform: [{ translateY: -MOOD_POSE.cheer.hop }, { rotate: `${MOOD_POSE.cheer.tilt}deg` }] }, { shouldMatchAllProps: false });
  });

  test("static prop disables the idle loops", async () => {
    await renderUI(<Floo mood="happy" size="s" testID="floo" animate={false} />);
    expect(screen.getByTestId("floo")).toBeTruthy();
  });
});

describe("SpeechBubble", () => {
  test("renders the text and swaps with a fade on change", async () => {
    const { rerender } = await renderUI(<SpeechBubble text="Merhaba!" />);
    expect(screen.getByText("Merhaba!")).toBeTruthy();
    await rerender(<SpeechBubble text="Hazır mısın?" />);
    expect(screen.getByText("Hazır mısın?")).toBeTruthy();
  });
  test("has a Floo-attributed accessibility label", async () => {
    await renderUI(<SpeechBubble text="Selam" testID="sb" />);
    expect(screen.getByTestId("sb").props.accessibilityLabel).toBe("Floo: Selam");
  });
});

import React, { useState } from "react";
import { Text as RNText } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { ThemeProvider } from "../../src/theme";
import { ToastProvider } from "../../src/ui/Toast";
import { Pressable } from "../../src/ui/Pressable";
import * as events from "../../src/mascot/events";
import { flooBus, overTargetKey } from "../../src/mascot/events";
import { FlooCornerHost, FlooEventBridge, FlooVoiceProvider, claimOnce, useFloo, useFlooOnce } from "../../src/mascot/voice";
import { storage } from "../../src/lib/storage";

function Harness({ enabled = true, bridges = 1, children }: { enabled?: boolean; bridges?: number; children?: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <FlooVoiceProvider enabled={enabled}>
          {Array.from({ length: bridges }, (_, i) => (
            <FlooEventBridge key={i} />
          ))}
          {children}
          <FlooCornerHost presence="idle" />
        </FlooVoiceProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

/** Shows how many lines wait behind the bubble, read from inside the provider. */
function Peek() {
  return <RNText testID="pending">{String(useFloo().pendingCount)}</RNText>;
}
const pending = () => Number(screen.getByTestId("pending").props.children);

const bubble = () => screen.queryByTestId("floo-bubble")?.props.accessibilityLabel as string | undefined;
/** What the corner asked the model to draw (the model is a prop-recording stand-in here). */
const model = () => screen.getByTestId("floo-corner-model").props.flooProps;
const emit = async (...args: Parameters<typeof flooBus.emit>) => {
  await act(async () => flooBus.emit(...args));
};

jest.mock("../../src/mascot/model/FlooModel", () => jest.requireActual("../mocks/flooModel"));

describe("FlooEventBridge", () => {
  let random: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    storage.clearAll();
    flooBus.reset();
    // First copy variant every time: the lines under test are the payload-aware ones.
    random = jest.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    random.mockRestore();
    jest.useRealTimers();
  });

  test("a logged meal reaches the corner: its line in the bubble, its mood on the face, its gesture fired", async () => {
    await render(<Harness />);
    expect(bubble()).toBeUndefined();
    await emit("mealLogged", { kcal: 420, name: "Mercimek çorbası" });
    expect(bubble()).toBe("Floo: Mercimek çorbası kaydedildi, afiyet olsun!");
    expect(model().mood).toBe("happy");
    expect(model().trigger).toEqual({ name: "mealLogged", key: expect.any(Number) });
    // A plain acknowledgement: no warning buzz, no second success buzz on top of the mutation's own.
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(bubble()).toBeUndefined();
  });

  test("a hit goal celebrates, and a finished workout is proud", async () => {
    await render(<Harness />);
    await emit("goalHit");
    expect(model().mood).toBe("celebrate");
    expect(model().trigger).toEqual({ name: "goalHit", key: expect.any(Number) });
    const firstKey = model().trigger.key;
    await fireEvent.press(screen.getByTestId("floo-bubble"));
    await emit("workoutDone", { title: "Üst vücut" });
    expect(model().mood).toBe("proud");
    expect(model().trigger.name).toBe("workoutDone");
    expect(model().trigger.key).toBeGreaterThan(firstKey);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  test("going over target waits behind the meal that caused it, then warns", async () => {
    await render(
      <Harness>
        <Peek />
      </Harness>
    );
    await emit("mealLogged", { kcal: 650, name: "Lahmacun" });
    await emit("overTarget", { overKcal: 150, dateKey: "2026-09-24" });
    expect(bubble()).toBe("Floo: Lahmacun kaydedildi, afiyet olsun!");
    expect(pending()).toBe(1);
    await fireEvent.press(screen.getByTestId("floo-bubble"));
    expect(bubble()).toBe("Floo: Hedefi 150 kcal aştık, dert değil.");
    expect(model().mood).toBe("worried");
    expect(model().trigger.name).toBe("overTarget");
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("warning");
  });

  test("the day that went over is told once: the home screen's own warning stays quiet afterwards", async () => {
    function HomeWarning() {
      useFlooOnce(overTargetKey("2026-09-24"), { text: "Bugün hedefini 150 kcal aştın.", priority: "high" });
      return null;
    }
    function Later() {
      const [shown, setShown] = useState(false);
      return (
        <>
          <Pressable testID="open-home" onPress={() => setShown(true)}>
            <RNText>home</RNText>
          </Pressable>
          {shown ? <HomeWarning /> : null}
        </>
      );
    }
    await render(
      <Harness>
        <Peek />
        <Later />
      </Harness>
    );
    await emit("overTarget", { overKcal: 150, dateKey: "2026-09-24" });
    expect(bubble()).toBe("Floo: Hedefi 150 kcal aştık, dert değil.");
    await fireEvent.press(screen.getByTestId("floo-bubble"));
    // Later the user opens the home screen, which notices the same state.
    await fireEvent.press(screen.getByTestId("open-home"));
    expect(bubble()).toBeUndefined();
    expect(pending()).toBe(0);
  });

  test("and the other way round: once the home screen said it, a later crossing that day is silent", async () => {
    expect(claimOnce(overTargetKey("2026-09-24"))).toBe(true);
    await render(<Harness />);
    await emit("overTarget", { overKcal: 90, dateKey: "2026-09-24" });
    expect(bubble()).toBeUndefined();
    // A different day is news again.
    await emit("overTarget", { overKcal: 90, dateKey: "2026-09-25" });
    expect(bubble()).toBe("Floo: Hedefi 90 kcal aştık, dert değil.");
  });

  test("each event is delivered once, even if a second bridge gets mounted", async () => {
    // Two deliveries of one line would collapse on its dedupe key, so count them at the source.
    const describeSpy = jest.spyOn(events, "describeFlooEvent");
    await render(
      <Harness bridges={2}>
        <Peek />
      </Harness>
    );
    await emit("measurementLogged", { weightKg: 78.4 });
    expect(describeSpy).toHaveBeenCalledTimes(1);
    expect(bubble()).toBe("Floo: Ölçüm kaydedildi, gidişatı birlikte izleyelim.");
    expect(pending()).toBe(0);
    const reactions = model().trigger.key;
    await fireEvent.press(screen.getByTestId("floo-bubble"));
    expect(bubble()).toBeUndefined();
    expect(model().trigger.key).toBe(reactions);
    describeSpy.mockRestore();
  });

  test("a bridge that mounts later does not replay what already happened", async () => {
    function Toggle() {
      const [on, setOn] = useState(false);
      return (
        <>
          <Pressable testID="mount-bridge" onPress={() => setOn(true)}>
            <RNText>mount</RNText>
          </Pressable>
          {on ? <FlooEventBridge /> : null}
        </>
      );
    }
    await render(
      <ThemeProvider>
        <ToastProvider>
          <FlooVoiceProvider>
            <Toggle />
            <FlooCornerHost presence="idle" />
          </FlooVoiceProvider>
        </ToastProvider>
      </ThemeProvider>
    );
    await emit("goalHit");
    await fireEvent.press(screen.getByTestId("mount-bridge"));
    expect(bubble()).toBeUndefined();
    await emit("streakUp", { days: 7 });
    expect(bubble()).toBe("Floo: 7 gün üst üste! Harikasın!");
  });

  test("with the mascot switched off, Floo's asides are not turned into toasts", async () => {
    await render(<Harness enabled={false} />);
    await emit("mealLogged", { kcal: 420, name: "Mercimek çorbası" });
    expect(screen.queryByText(/Mercimek/)).toBeNull();
    expect(screen.queryByTestId("floo-corner")).toBeNull();
  });
});

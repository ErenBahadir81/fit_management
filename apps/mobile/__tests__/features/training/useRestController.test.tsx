import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { haptic } from "../../../src/lib/haptics";
import * as notifications from "../../../src/lib/notifications";
import * as sound from "../../../src/lib/sound";
import { useRestController } from "../../../src/features/training/workout/restEngine";
import { clearRestPrefs, isRestSoundMuted, readRestPreset, setRestSoundMuted } from "../../../src/features/training/workout/restPrefs";

jest.mock("../../../src/lib/notifications", () => ({
  isAvailable: jest.fn(() => true),
  requestPermission: jest.fn(async () => true),
  scheduleRestFinished: jest.fn(async () => "notif-1"),
  cancelRestFinished: jest.fn(async () => undefined),
}));

jest.mock("../../../src/lib/sound", () => ({
  isAvailable: jest.fn(() => true),
  isMuted: jest.fn(() => false),
  setMuted: jest.fn(),
  playRestTick: jest.fn(),
  playRestFinished: jest.fn(),
  releaseRestSounds: jest.fn(),
}));

const T0 = 1_700_000_000_000;

/** Drives `AppState.addEventListener` so a test can background and foreground the app. */
let appState: AppStateStatus;
let listeners: ((next: AppStateStatus) => void)[];

async function setAppState(next: AppStateStatus) {
  appState = next;
  await act(async () => listeners.forEach((fn) => fn(next)));
}

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  clearRestPrefs();
  jest.spyOn(haptic, "success").mockResolvedValue(undefined);
  jest.spyOn(haptic, "tap").mockResolvedValue(undefined);
  jest.useFakeTimers();
  jest.setSystemTime(T0);
  appState = "active";
  listeners = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
    const fn = handler as (next: AppStateStatus) => void;
    listeners.push(fn);
    return { remove: () => (listeners = listeners.filter((l) => l !== fn)) } as never;
  });
  Object.defineProperty(AppState, "currentState", { get: () => appState, configurable: true });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function setup(opts: { exerciseKey?: string; fallbackSeconds?: number; onFinish?: () => void } = {}) {
  const onFinish = opts.onFinish ?? jest.fn();
  const view = await renderHook(
    ({ exerciseKey, fallbackSeconds }: { exerciseKey: string; fallbackSeconds: number }) => useRestController({ exerciseKey, fallbackSeconds, onFinish }),
    { initialProps: { exerciseKey: opts.exerciseKey ?? "Bench Press", fallbackSeconds: opts.fallbackSeconds ?? 90 } }
  );
  return { result: view.result, rerender: view.rerender, unmount: view.unmount, onFinish };
}

describe("idle", () => {
  test("starts with no rest running and the fallback as the preset", async () => {
    const { result } = await setup({ fallbackSeconds: 75 });
    expect(result.current).toMatchObject({ running: false, remaining: 0, total: 0, presetSeconds: 75 });
  });

  test("prefers what this exercise is remembered for over the day's default", async () => {
    const previousSession = await setup({ exerciseKey: "Bench Press" });
    await act(() => previousSession.result.current.setPreset(150));
    await previousSession.unmount();

    const { result } = await setup({ exerciseKey: "Bench Press", fallbackSeconds: 90 });
    expect(result.current.presetSeconds).toBe(150);
  });

  test("another exercise still gets the day's default", async () => {
    const first = await setup({ exerciseKey: "Bench Press" });
    await act(() => first.result.current.setPreset(150));
    const { result } = await setup({ exerciseKey: "Lateral Raise", fallbackSeconds: 60 });
    expect(result.current.presetSeconds).toBe(60);
  });

  test("an exercise with no name just uses the fallback", async () => {
    const { result } = await setup({ exerciseKey: "", fallbackSeconds: 45 });
    expect(result.current.presetSeconds).toBe(45);
  });
});

describe("start", () => {
  test("runs for the preset when called with nothing", async () => {
    const { result } = await setup({ fallbackSeconds: 90 });
    await act(() => result.current.start());
    expect(result.current).toMatchObject({ running: true, remaining: 90, total: 90 });
  });

  test("runs for an explicit duration when given one", async () => {
    const { result } = await setup({ fallbackSeconds: 90 });
    await act(() => result.current.start(45));
    expect(result.current).toMatchObject({ running: true, remaining: 45, total: 45 });
  });

  test("counts down on the wall clock", async () => {
    const { result } = await setup({ fallbackSeconds: 60 });
    await act(() => result.current.start());
    await tick(1000);
    expect(result.current.remaining).toBe(59);
    await tick(9000);
    expect(result.current.remaining).toBe(50);
  });

  test("restarting drops the previous rest's adjustments", async () => {
    const { result } = await setup({ fallbackSeconds: 60 });
    await act(() => result.current.start());
    await act(() => result.current.adjust(30));
    expect(result.current.total).toBe(90);
    await act(() => result.current.start());
    expect(result.current.total).toBe(60);
  });
});

describe("finishing", () => {
  test("stops, tells the caller once, and makes itself felt and heard", async () => {
    const { result, onFinish } = await setup({ fallbackSeconds: 5 });
    await act(() => result.current.start());
    await tick(5000);

    expect(result.current).toMatchObject({ running: false, remaining: 0 });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(haptic.success).toHaveBeenCalledTimes(1);
    expect(sound.playRestFinished).toHaveBeenCalledTimes(1);

    await tick(5000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test("counts the last three seconds down out loud and in the hand, once each", async () => {
    const { result } = await setup({ fallbackSeconds: 6 });
    await act(() => result.current.start());

    await tick(2750);
    expect(sound.playRestTick).not.toHaveBeenCalled();
    await tick(250); // 3 left
    expect(sound.playRestTick).toHaveBeenCalledTimes(1);
    await tick(1000); // 2 left
    await tick(1000); // 1 left
    expect(sound.playRestTick).toHaveBeenCalledTimes(3);
    expect(haptic.tap).toHaveBeenCalledTimes(3);

    await tick(1000);
    expect(sound.playRestTick).toHaveBeenCalledTimes(3);
  });

  test("does not lose time while the interval is starved", async () => {
    const { result, onFinish } = await setup({ fallbackSeconds: 60 });
    await act(() => result.current.start());
    // One interval fires, but the clock has moved on by two minutes.
    await act(() => {
      jest.setSystemTime(T0 + 120_000);
      jest.advanceTimersByTime(250);
    });
    expect(result.current.running).toBe(false);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test("a rest that ended while the phone was locked finishes the moment the app comes back", async () => {
    const { result, onFinish } = await setup({ fallbackSeconds: 120 });
    await act(() => result.current.start());
    await setAppState("background");
    jest.setSystemTime(T0 + 200_000);
    await setAppState("active");

    expect(result.current.running).toBe(false);
    expect(onFinish).toHaveBeenCalledTimes(1);
    // The notification already told them; do not chime a second time on top of it.
    expect(sound.playRestFinished).not.toHaveBeenCalled();
  });
});

describe("live adjustment", () => {
  test("adds time instantly", async () => {
    const { result } = await setup({ fallbackSeconds: 60 });
    await act(() => result.current.start());
    await tick(10_000);
    await act(() => result.current.adjust(15));
    expect(result.current).toMatchObject({ remaining: 65, total: 75 });
  });

  test("takes time off instantly", async () => {
    const { result } = await setup({ fallbackSeconds: 60 });
    await act(() => result.current.start());
    await act(() => result.current.adjust(-15));
    expect(result.current).toMatchObject({ remaining: 45, total: 45 });
  });

  test("cutting past zero ends the rest", async () => {
    const { result, onFinish } = await setup({ fallbackSeconds: 60 });
    await act(() => result.current.start());
    await act(() => result.current.adjust(-999));
    expect(result.current.running).toBe(false);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test("is a no-op when no rest is running", async () => {
    const { result } = await setup({ fallbackSeconds: 60 });
    await act(() => result.current.adjust(15));
    expect(result.current).toMatchObject({ running: false, remaining: 0, total: 0 });
  });

  test("does not change the remembered preset", async () => {
    const { result } = await setup({ fallbackSeconds: 60 });
    await act(() => result.current.start());
    await act(() => result.current.adjust(30));
    expect(result.current.presetSeconds).toBe(60);
    await act(() => result.current.start());
    expect(result.current.total).toBe(60);
  });
});

describe("skip", () => {
  test("ends the rest without claiming it finished", async () => {
    const { result, onFinish } = await setup({ fallbackSeconds: 60 });
    await act(() => result.current.start());
    await act(() => result.current.skip());
    expect(result.current).toMatchObject({ running: false, remaining: 0 });
    expect(onFinish).not.toHaveBeenCalled();
    expect(sound.playRestFinished).not.toHaveBeenCalled();
  });
});

describe("presets", () => {
  test("setPreset remembers the duration for this exercise", async () => {
    const { result } = await setup({ exerciseKey: "Bench Press", fallbackSeconds: 60 });
    await act(() => result.current.setPreset(120));
    expect(result.current.presetSeconds).toBe(120);
    expect(readRestPreset("Bench Press")).toBe(120);
  });

  test("setPreset leaves the rest that is already running alone", async () => {
    const { result } = await setup({ fallbackSeconds: 60 });
    await act(() => result.current.start());
    await act(() => result.current.setPreset(180));
    expect(result.current).toMatchObject({ running: true, total: 60, presetSeconds: 180 });
    await act(() => result.current.start());
    expect(result.current.total).toBe(180);
  });

  test("clamps a nonsense preset", async () => {
    const { result } = await setup();
    await act(() => result.current.setPreset(99_999));
    expect(result.current.presetSeconds).toBe(600);
  });

  test("moving to another exercise picks up that exercise's memory", async () => {
    const { result, rerender } = await setup({ exerciseKey: "Bench Press", fallbackSeconds: 60 });
    await act(() => result.current.setPreset(180));
    await rerender({ exerciseKey: "Lateral Raise", fallbackSeconds: 60 });
    expect(result.current.presetSeconds).toBe(60);
    await rerender({ exerciseKey: "Bench Press", fallbackSeconds: 60 });
    expect(result.current.presetSeconds).toBe(180);
  });
});

describe("the notification", () => {
  test("is scheduled when the rest starts", async () => {
    const { result } = await setup({ fallbackSeconds: 90 });
    await act(async () => result.current.start());
    expect(notifications.scheduleRestFinished).toHaveBeenCalledWith(90);
  });

  test("is rescheduled for the new end when the rest is adjusted", async () => {
    const { result } = await setup({ fallbackSeconds: 90 });
    await act(async () => result.current.start());
    await tick(10_000);
    await act(async () => result.current.adjust(15));
    expect(notifications.scheduleRestFinished).toHaveBeenLastCalledWith(95);
  });

  test("is cancelled when the user skips", async () => {
    const { result } = await setup({ fallbackSeconds: 90 });
    await act(async () => result.current.start());
    await act(async () => result.current.skip());
    expect(notifications.cancelRestFinished).toHaveBeenCalled();
  });

  test("is cancelled when the rest finishes in the app, so it cannot fire on top", async () => {
    const { result } = await setup({ fallbackSeconds: 10 });
    await act(() => result.current.start());
    (notifications.cancelRestFinished as jest.Mock).mockClear();
    await tick(10_000);
    expect(notifications.cancelRestFinished).toHaveBeenCalled();
  });

  test("is cancelled when the screen goes away mid-rest", async () => {
    const { result, unmount } = await setup({ fallbackSeconds: 90 });
    await act(async () => result.current.start());
    (notifications.cancelRestFinished as jest.Mock).mockClear();
    await unmount();
    expect(notifications.cancelRestFinished).toHaveBeenCalled();
  });
});

describe("the muted choice", () => {
  test("is applied to the sound module when a session starts", async () => {
    setRestSoundMuted(true);
    await setup();
    expect(sound.setMuted).toHaveBeenCalledWith(true);
    expect(isRestSoundMuted()).toBe(true);
  });
});

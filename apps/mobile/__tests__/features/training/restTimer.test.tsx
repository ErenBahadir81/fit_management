import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderUI } from "../../helpers";
import * as sound from "../../../src/lib/sound";
import { RestTimer } from "../../../src/features/training/workout/RestTimer";
import type { RestController } from "../../../src/features/training/workout/restEngine";
import { clearRestPrefs, isRestSoundMuted } from "../../../src/features/training/workout/restPrefs";

jest.mock("../../../src/lib/sound", () => ({
  isAvailable: jest.fn(() => true),
  isMuted: jest.fn(() => false),
  setMuted: jest.fn(),
  playRestTick: jest.fn(),
  playRestFinished: jest.fn(),
  releaseRestSounds: jest.fn(),
}));

function controller(overrides: Partial<RestController> = {}): RestController {
  return {
    running: true,
    remaining: 89,
    total: 120,
    presetSeconds: 120,
    start: jest.fn(),
    skip: jest.fn(),
    adjust: jest.fn(),
    setPreset: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearRestPrefs();
});

describe("what it shows", () => {
  test("renders nothing at all when no rest is running", async () => {
    const { toJSON } = await renderUI(<RestTimer controller={controller({ running: false })} />);
    expect(toJSON()).toBeNull();
  });

  test("puts the remaining time on screen as the headline", async () => {
    await renderUI(<RestTimer controller={controller({ remaining: 89 })} />);
    expect(screen.getByTestId("rest-remaining")).toHaveTextContent("1:29");
  });

  test("uses tabular figures so the digits do not jitter every second", async () => {
    await renderUI(<RestTimer controller={controller()} />);
    expect(screen.getByTestId("rest-remaining")).toHaveStyle({ fontVariant: ["tabular-nums"] });
  });
});

describe("changing this rest", () => {
  test("takes fifteen seconds off", async () => {
    const c = controller();
    await renderUI(<RestTimer controller={c} />);
    await fireEvent.press(screen.getByTestId("rest-minus"));
    expect(c.adjust).toHaveBeenCalledWith(-15);
  });

  test("adds fifteen seconds", async () => {
    const c = controller();
    await renderUI(<RestTimer controller={c} />);
    await fireEvent.press(screen.getByTestId("rest-plus"));
    expect(c.adjust).toHaveBeenCalledWith(15);
  });

  test("both controls are comfortably bigger than a thumb", async () => {
    await renderUI(<RestTimer controller={controller()} />);
    for (const id of ["rest-minus", "rest-plus", "rest-skip"]) {
      const style = screen.getByTestId(id).props.style as { width?: number; height?: number; minHeight?: number };
      const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
      expect(Math.min(flat.height ?? flat.minHeight ?? 0, flat.width ?? 999)).toBeGreaterThanOrEqual(44);
    }
  });

  test("says in Turkish what each control does", async () => {
    await renderUI(<RestTimer controller={controller()} />);
    expect(screen.getByLabelText("15 saniye azalt")).toBeTruthy();
    expect(screen.getByLabelText("15 saniye ekle")).toBeTruthy();
  });
});

describe("changing the default", () => {
  test("offers the usual durations", async () => {
    await renderUI(<RestTimer controller={controller()} />);
    for (const seconds of [30, 45, 60, 90, 120, 180]) {
      expect(screen.getByTestId(`rest-preset-${seconds}`)).toBeTruthy();
    }
  });

  test("one tap remembers a new default", async () => {
    const c = controller();
    await renderUI(<RestTimer controller={c} />);
    await fireEvent.press(screen.getByTestId("rest-preset-90"));
    expect(c.setPreset).toHaveBeenCalledWith(90);
  });

  test("marks the exercise's current default as selected", async () => {
    await renderUI(<RestTimer controller={controller({ presetSeconds: 120 })} />);
    expect(screen.getByTestId("rest-preset-120").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId("rest-preset-90").props.accessibilityState).toMatchObject({ selected: false });
  });
});

describe("skipping", () => {
  test("skips from its own control", async () => {
    const c = controller();
    await renderUI(<RestTimer controller={c} />);
    await fireEvent.press(screen.getByTestId("rest-skip"));
    expect(c.skip).toHaveBeenCalledTimes(1);
  });

  test("touching the timer itself does not skip the rest", async () => {
    const c = controller();
    await renderUI(<RestTimer controller={c} testID="rest-timer" />);
    await fireEvent.press(screen.getByTestId("rest-timer"));
    await fireEvent.press(screen.getByTestId("rest-remaining"));
    expect(c.skip).not.toHaveBeenCalled();
  });
});

describe("the sound", () => {
  test("can be silenced from the timer, and the choice is remembered", async () => {
    await renderUI(<RestTimer controller={controller()} />);
    await fireEvent.press(screen.getByTestId("rest-mute"));
    expect(sound.setMuted).toHaveBeenCalledWith(true);
    expect(isRestSoundMuted()).toBe(true);
    expect(screen.getByLabelText("Sesi aç")).toBeTruthy();
  });

  test("comes back on the second tap", async () => {
    await renderUI(<RestTimer controller={controller()} />);
    await fireEvent.press(screen.getByTestId("rest-mute"));
    await fireEvent.press(screen.getByTestId("rest-mute"));
    expect(sound.setMuted).toHaveBeenLastCalledWith(false);
    expect(isRestSoundMuted()).toBe(false);
  });
});

describe("screen readers", () => {
  test("announces the rest politely, and never turns the ticking number into a live region", async () => {
    await renderUI(<RestTimer controller={controller({ remaining: 89, total: 120 })} />);
    expect(screen.getByTestId("rest-announcement")).toHaveTextContent("2:00 dinlenme");

    const number = screen.getByTestId("rest-remaining");
    expect(number.props.accessibilityLiveRegion).toBeUndefined();
    expect(number.props.accessibilityLabel).toBe("1:29 kaldı");
  });

  test("says something different once the rest is nearly over", async () => {
    await renderUI(<RestTimer controller={controller({ remaining: 8, total: 120 })} />);
    expect(screen.getByTestId("rest-announcement")).toHaveTextContent("Son 10 saniye");
  });
});

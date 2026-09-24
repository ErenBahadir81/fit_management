import React from "react";
import { act, render } from "@testing-library/react-native";
import { GestureEndTracker } from "../../src/mascot/model/gestureEnd";
import { FlooModel } from "../../src/mascot/model/FlooModel";
import { REDUCED, REDUCED_RETURN_MS, gestureDuration, reducedGestureDuration, GESTURES, COMPILED, type Gesture } from "../../src/mascot/model/poses";

let mockReduce = false;
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: () => mockReduce,
}));

describe("GestureEndTracker", () => {
  test("a gesture that completes is reported once, as completed", () => {
    const t = new GestureEndTracker();
    expect(t.start(1, "wave", 7)).toBeNull();
    expect(t.complete(1)).toEqual({ name: "wave", key: 7, completed: true });
    expect(t.complete(1)).toBeNull();
    expect(t.interrupt()).toBeNull();
  });

  test("a gesture replaced by another is reported as not completed, and its late report is dropped", () => {
    const t = new GestureEndTracker();
    t.start(1, "wave", 1);
    expect(t.start(2, "clap", 2)).toEqual({ name: "wave", key: 1, completed: false });
    // The UI thread finished request 1 after the JS thread had already replaced it.
    expect(t.complete(1)).toBeNull();
    expect(t.complete(2)).toEqual({ name: "clap", key: 2, completed: true });
  });

  test("a trigger taking the limbs interrupts the pending gesture once", () => {
    const t = new GestureEndTracker();
    t.start(4, "point", 9);
    expect(t.interrupt()).toEqual({ name: "point", key: 9, completed: false });
    expect(t.interrupt()).toBeNull();
    expect(t.complete(4)).toBeNull();
  });

  test("reports for rig requests nobody is waiting on (trigger gestures) are ignored", () => {
    const t = new GestureEndTracker();
    expect(t.complete(3)).toBeNull();
  });
});

describe("reduced-motion gesture plans", () => {
  test("every gesture collapses to one of its own key poses, held, then a return", () => {
    GESTURES.forEach((g, i) => {
      const r = REDUCED[i];
      expect(COMPILED[i].times).toContain(r.at);
      expect(r.at).toBeGreaterThan(0);
      expect(r.at).toBeLessThan(COMPILED[i].duration);
      expect(r.hold).toBeGreaterThanOrEqual(450);
      expect(r.hold).toBeLessThanOrEqual(1000);
      expect(r.total).toBe(r.hold + REDUCED_RETURN_MS);
      expect(reducedGestureDuration(g)).toBe(r.total);
    });
  });

  test("the pose shown is the one the gesture holds longest (the wave's raised hand, the point)", () => {
    const at = (g: Gesture) => REDUCED[GESTURES.indexOf(g)].at;
    const idx = GESTURES.indexOf("point");
    // point holds its reach from its second key to the release.
    expect(at("point")).toBe(COMPILED[idx].times[2]);
  });
});

describe("FlooModel onGestureEnd", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReduce = false;
  });
  afterEach(() => jest.useRealTimers());

  const advance = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };

  test("fires once when the gesture's timeline completes, with its name and key", async () => {
    const onEnd = jest.fn();
    await render(<FlooModel animate={false} gesture={{ name: "wave", key: 1 }} onGestureEnd={onEnd} />);
    await advance(gestureDuration("wave") - 20);
    expect(onEnd).not.toHaveBeenCalled();
    await advance(40);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith("wave", { key: 1, completed: true });
    await advance(5000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("a re-render with the same key neither replays nor re-reports", async () => {
    const onEnd = jest.fn();
    const { rerender } = await render(<FlooModel animate={false} gesture={{ name: "clap", key: 3 }} onGestureEnd={onEnd} />);
    await advance(gestureDuration("clap") + 50);
    await rerender(<FlooModel animate={false} gesture={{ name: "clap", key: 3 }} onGestureEnd={onEnd} />);
    await advance(gestureDuration("clap") + 50);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("each key is reported exactly once; a replaced gesture reports completed: false", async () => {
    const onEnd = jest.fn();
    const { rerender } = await render(<FlooModel animate={false} gesture={{ name: "wave", key: 1 }} onGestureEnd={onEnd} />);
    await advance(200);
    await rerender(<FlooModel animate={false} gesture={{ name: "shrug", key: 2 }} onGestureEnd={onEnd} />);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenLastCalledWith("wave", { key: 1, completed: false });
    await advance(gestureDuration("wave") + gestureDuration("shrug"));
    expect(onEnd).toHaveBeenCalledTimes(2);
    expect(onEnd).toHaveBeenLastCalledWith("shrug", { key: 2, completed: true });
  });

  test("a trigger's gesture replaces a pending one, which is reported as not completed", async () => {
    const onEnd = jest.fn();
    const { rerender } = await render(<FlooModel animate={false} gesture={{ name: "think", key: 5 }} onGestureEnd={onEnd} />);
    await advance(100);
    await rerender(<FlooModel animate={false} gesture={{ name: "think", key: 5 }} trigger={{ name: "mealLogged", key: 1 }} onGestureEnd={onEnd} />);
    expect(onEnd).toHaveBeenCalledWith("think", { key: 5, completed: false });
    await advance(5000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("an unknown gesture name is reported at once as not completed", async () => {
    const onEnd = jest.fn();
    await render(<FlooModel animate={false} gesture={{ name: "moonwalk" as Gesture, key: 1 }} onGestureEnd={onEnd} />);
    expect(onEnd).toHaveBeenCalledWith("moonwalk", { key: 1, completed: false });
  });

  test("under reduced motion the gesture still plays (as a cross-fade) and reports when that is done", async () => {
    mockReduce = true;
    const onEnd = jest.fn();
    await render(<FlooModel gesture={{ name: "cheer", key: 1 }} onGestureEnd={onEnd} />);
    await advance(reducedGestureDuration("cheer") - 20);
    expect(onEnd).not.toHaveBeenCalled();
    await advance(40);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith("cheer", { key: 1, completed: true });
  });

  test("the latest callback is the one called", async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await render(<FlooModel animate={false} gesture={{ name: "boop", key: 1 }} onGestureEnd={first} />);
    await rerender(<FlooModel animate={false} gesture={{ name: "boop", key: 1 }} onGestureEnd={second} />);
    await advance(gestureDuration("boop") + 20);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("nothing is reported after unmount", async () => {
    const onEnd = jest.fn();
    const { unmount } = await render(<FlooModel animate={false} gesture={{ name: "wave", key: 1 }} onGestureEnd={onEnd} />);
    await advance(100);
    await unmount();
    await advance(5000);
    expect(onEnd).not.toHaveBeenCalled();
  });
});

import React from "react";
import { act, renderHook, screen } from "@testing-library/react-native";
import { renderUI } from "../helpers";
import { CountUp, useCountUp, type CountUpOptions } from "../../src/ui/CountUp";
import { fmtInt } from "../../src/lib/format";

type Props = { value: number } & CountUpOptions;

/** The hook with animation on (the component itself shows final values under Jest). */
function mount(initial: Props) {
  return renderHook(({ value, ...opts }: Props) => useCountUp(value, opts), { initialProps: initial });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe("useCountUp", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("without animation the value is returned at once and follows every change", async () => {
    const hook = await mount({ value: 42, animate: false });
    expect(hook.result.current).toBe(42);
    await hook.rerender({ value: 7, animate: false });
    expect(hook.result.current).toBe(7);
  });

  test("the first mount counts from `from` (default 0) and lands exactly on the value", async () => {
    const hook = await mount({ value: 80 });
    expect(hook.result.current).toBe(0);
    await advance(700);
    expect(hook.result.current).toBe(80);
  });

  test("`from` equal to the value shows it at once: nothing counts on mount", async () => {
    const hook = await mount({ value: 1250, from: 1250 });
    expect(hook.result.current).toBe(1250);
    await advance(700);
    expect(hook.result.current).toBe(1250);
  });

  test("a new value counts from the number on screen, easing out, not from zero", async () => {
    const hook = await mount({ value: 100, from: 100 });
    await hook.rerender({ value: 200, from: 100 });
    expect(hook.result.current).toBe(100);
    await advance(150);
    const early = hook.result.current;
    // Ease-out: a quarter of the time in, the count is well past half way.
    expect(early).toBeGreaterThan(150);
    expect(early).toBeLessThan(200);
    await advance(600);
    expect(hook.result.current).toBe(200);
  });

  test("a value that changes mid-count carries on from where the count is (no jump back)", async () => {
    const hook = await mount({ value: 100 });
    await advance(200);
    const mid = hook.result.current;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    await hook.rerender({ value: 50 });
    expect(hook.result.current).toBe(mid);
    await advance(32);
    expect(hook.result.current).toBeLessThanOrEqual(mid);
    expect(hook.result.current).toBeGreaterThan(50);
    await advance(700);
    expect(hook.result.current).toBe(50);
  });

  test("a value that is not a finite number is shown as it is; the next number appears without counting from it", async () => {
    const hook = await mount({ value: 5, from: 5 });
    await hook.rerender({ value: Number.NaN, from: 5 });
    expect(hook.result.current).toBeNaN();
    await hook.rerender({ value: 10, from: 5 });
    expect(hook.result.current).toBe(10);
    await advance(700);
    expect(hook.result.current).toBe(10);
  });

  test("turning animation off mid-count shows the value at once, and turning it back on replays nothing", async () => {
    const hook = await mount({ value: 100 });
    await advance(200);
    await hook.rerender({ value: 100, animate: false });
    expect(hook.result.current).toBe(100);
    await hook.rerender({ value: 100, animate: true });
    expect(hook.result.current).toBe(100);
    await advance(700);
    expect(hook.result.current).toBe(100);
    // …and the next change counts from 100.
    await hook.rerender({ value: 120, animate: true });
    await advance(100);
    expect(hook.result.current).toBeGreaterThan(100);
    expect(hook.result.current).toBeLessThan(120);
  });
});

describe("CountUp", () => {
  test("shows the formatted final value under test; screen readers only ever get the final value", async () => {
    const { rerender } = await renderUI(<CountUp value={1250} format={fmtInt} testID="cu" />);
    expect(screen.getByTestId("cu").props.children).toBe("1.250");
    expect(screen.getByTestId("cu").props.accessibilityLabel).toBe("1.250");
    await rerender(<CountUp value={640} format={fmtInt} testID="cu" />);
    expect(screen.getByTestId("cu").props.children).toBe("640");
    expect(screen.getByTestId("cu").props.accessibilityLabel).toBe("640");
  });

  test("tabular digits by default, and an explicit label wins", async () => {
    await renderUI(<CountUp value={3} format={fmtInt} accessibilityLabel="3 gün" testID="cu" />);
    const el = screen.getByTestId("cu");
    expect(el.props.accessibilityLabel).toBe("3 gün");
    expect(JSON.stringify(el.props.style)).toContain("tabular-nums");
  });
});

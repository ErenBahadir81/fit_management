import React from "react";
import { act, renderHook } from "@testing-library/react-native";
import type { ApiClient } from "@fitfloow/api-client";
import type { GoalPlan, GoalProfile } from "@fitfloow/core";
import { Providers, makeQueryClient } from "../../helpers";
import { useGoalPreview } from "../../../src/features/goals/useGoal";
import { setApi } from "../../../src/lib/api";

const fakePlan = (target: number) => ({ plan: { targetWeightKg: 70, estimatedWeeks: 8, fatToLoseKg: target } as unknown as GoalPlan, warnings: [] });

describe("useGoalPreview (debounced authoritative preview)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("calls the API once for the initial input, then once more after the slider settles", async () => {
    const preview = jest.fn(async (input: { targetBodyFatPct: number; profile?: GoalProfile }) => fakePlan(input.targetBodyFatPct));
    setApi({ goals: { preview } } as unknown as ApiClient);
    const qc = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <Providers queryClient={qc}>{children}</Providers>;

    const { result, rerender } = await renderHook(({ t }: { t: number }) => useGoalPreview({ targetBodyFatPct: t, profile: "optimal" }), { wrapper, initialProps: { t: 15 } });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20);
    });
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenLastCalledWith({ targetBodyFatPct: 15, profile: "optimal" });
    expect(result.current.server?.plan.fatToLoseKg).toBe(15);
    expect(result.current.isCurrent).toBe(true);
    expect(result.current.pending).toBe(false);

    // three quick moves inside the debounce window → still one call, previous numbers kept visible
    await rerender({ t: 14 });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    await rerender({ t: 13.5 });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    await rerender({ t: 13 });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    expect(preview).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);
    expect(result.current.isCurrent).toBe(false);
    expect(result.current.server?.plan.fatToLoseKg).toBe(15); // keepPreviousData

    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(preview).toHaveBeenCalledTimes(2);
    expect(preview).toHaveBeenLastCalledWith({ targetBodyFatPct: 13, profile: "optimal" });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20); // react-query's batched notify
    });
    expect(result.current.server?.plan.fatToLoseKg).toBe(13);
    expect(result.current.isCurrent).toBe(true);
    expect(result.current.pending).toBe(false);
  });

  test("does nothing while disabled (no body entry yet)", async () => {
    const preview = jest.fn(async () => fakePlan(1));
    setApi({ goals: { preview } } as unknown as ApiClient);
    const wrapper = ({ children }: { children: React.ReactNode }) => <Providers queryClient={makeQueryClient()}>{children}</Providers>;
    const { result } = await renderHook(() => useGoalPreview({ targetBodyFatPct: 12, profile: "optimal", enabled: false }), { wrapper });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    expect(preview).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });
});

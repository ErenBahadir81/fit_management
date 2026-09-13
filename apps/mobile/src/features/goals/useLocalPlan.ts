import { useMemo } from "react";
import type { GoalPlan, GoalProfile } from "@fitfloow/core";
import { instantPlan, type InstantPlanInput } from "./goalMath";
import { PACE_OPTIONS } from "./goalIntent";

export type PlansByPace = Record<GoalProfile, GoalPlan | null>;

/**
 * The plan for every pace at once, computed on device.
 *
 * The pace picker shows each option's real arrival date and daily calories, which means three
 * plans, not one. The engine is pure and cheap, so all three are recomputed as the target moves and
 * the comparison stays live under the user's thumb.
 */
export function usePlansByPace(input: Omit<InstantPlanInput, "profile"> | null): PlansByPace {
  return useMemo(() => {
    const out = { conservative: null, optimal: null, aggressive: null } as PlansByPace;
    if (!input) return out;
    for (const { value } of PACE_OPTIONS) {
      try {
        out[value] = instantPlan({ ...input, profile: value });
      } catch {
        // An unreachable target (already lean enough, nonsense measurements) is a legitimate
        // answer, not a crash: the outcome card explains it.
        out[value] = null;
      }
    }
    return out;
  }, [input]);
}

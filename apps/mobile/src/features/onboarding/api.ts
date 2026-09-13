/**
 * C3 as the screens use it: sign-up, the one-shot onboarding commit, and the energy read.
 *
 * The routes live in `packages/api-client` (Worker B). This module is the app-side seam: it names
 * them, and it owns the one product rule that goes with them — whether an account still owes us
 * the first-run flow.
 */
import type { EnergyDTO, LoginResponse, OnboardingInput, OnboardingResponse, RegisterInput, UserDTO } from "@fitfloow/core";
import { getApi } from "../../lib/api";

export type { EnergyDTO, OnboardingInput, RegisterInput };

export function register(input: RegisterInput): Promise<LoginResponse> {
  return getApi().auth.register(input);
}

export function completeOnboarding(payload: OnboardingInput): Promise<OnboardingResponse> {
  return getApi().onboarding.complete(payload);
}

export function fetchEnergy(): Promise<EnergyDTO> {
  return getApi().me.energy();
}

/**
 * Whether this account still owes us the first-run flow.
 *
 * Deliberately strict: only an explicit `false` counts. A cached user written before the field
 * existed reads as `undefined`, and an existing account must never be dropped back through
 * onboarding because of a stale cache entry.
 */
export function needsOnboarding(user: UserDTO | null | undefined): boolean {
  return user?.onboardingCompleted === false;
}

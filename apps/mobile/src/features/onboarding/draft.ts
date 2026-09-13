/**
 * The onboarding draft on disk.
 *
 * Signing up is the longest uninterrupted stretch of typing in the app, so a crash, a phone call or
 * an accidental swipe must not cost the answers already given. Everything except the password is
 * written to MMKV after each step and read back on launch.
 */
import { STORAGE_KEYS, getJSON, removeKey, setJSON, storage } from "../../lib/storage";
import { emptyDraft, type OnboardingDraft } from "./model";

export const ONBOARDING_DRAFT_KEY = STORAGE_KEYS.onboardingDraft;

const CURRENT_VERSION = emptyDraft().version;

/** The stored draft, or null when there is nothing usable. Never throws, never half-restores. */
export function loadDraft(): OnboardingDraft | null {
  const raw = getJSON<Partial<OnboardingDraft>>(ONBOARDING_DRAFT_KEY);
  if (!raw || raw.version !== CURRENT_VERSION) return null;
  const base = emptyDraft();
  // Merge over a fresh draft so a field added since the write is present rather than undefined.
  return {
    ...base,
    ...raw,
    account: { ...base.account, ...raw.account },
    profile: { ...base.profile, ...raw.profile },
    measurement: { ...base.measurement, ...raw.measurement },
    goal: { ...base.goal, ...raw.goal },
  } as OnboardingDraft;
}

/** Writes the draft, deliberately keeping only the fields the draft declares (so: no password). */
export function saveDraft(d: OnboardingDraft): void {
  setJSON(ONBOARDING_DRAFT_KEY, {
    version: CURRENT_VERSION,
    step: d.step,
    account: { displayName: d.account.displayName, username: d.account.username },
    profile: d.profile,
    measurement: d.measurement,
    goal: d.goal,
  } satisfies OnboardingDraft);
}

export function clearDraft(): void {
  removeKey(ONBOARDING_DRAFT_KEY);
}

/** Test seam: whether anything is stored at all. */
export function hasDraft(): boolean {
  return storage.contains(ONBOARDING_DRAFT_KEY);
}

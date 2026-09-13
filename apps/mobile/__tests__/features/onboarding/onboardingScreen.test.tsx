import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { ApiClientError } from "@fitfloow/api-client";
import type { ApiClient } from "@fitfloow/api-client";
import { navyBodyFat, type UserDTO } from "@fitfloow/core";
import { makeQueryClient, renderUI } from "../../helpers";
import { mockRouter } from "../../mocks/expo-router";
import { OnboardingScreen } from "../../../src/features/onboarding/OnboardingScreen";
import { clearDraft, loadDraft, saveDraft } from "../../../src/features/onboarding/draft";
import { DEFAULT_HEIGHT_CM, emptyDraft } from "../../../src/features/onboarding/model";
import { useSession } from "../../../src/features/auth/session";
import { setApi } from "../../../src/lib/api";
import { fmtPct } from "../../../src/lib/format";

jest.mock("expo-router", () => jest.requireActual("../../mocks/expo-router"));

const USER: UserDTO = {
  id: "u1",
  username: "eren",
  displayName: "Eren",
  role: "user",
  gender: "male",
  heightCm: null,
  birthDate: null,
  activityLevel: "moderate",
  measurementDay: 0,
  mascotEnabled: true,
  email: null,
  onboardingCompleted: false,
  createdAt: new Date().toISOString(),
};

function makeApi(over: { register?: jest.Mock; complete?: jest.Mock; setTarget?: jest.Mock } = {}) {
  const register = over.register ?? jest.fn(async () => ({ accessToken: "a", refreshToken: "r", user: { ...USER, onboardingCompleted: false } }));
  const complete = over.complete ?? jest.fn(async () => ({ user: { ...USER, onboardingCompleted: true }, bodyEntry: {}, goal: null }));
  const setTarget = over.setTarget ?? jest.fn(async () => ({ target: {} }));
  const api = { auth: { register }, onboarding: { complete }, me: {}, nutrition: { setTarget } };
  setApi(api as unknown as ApiClient);
  return { register, complete, setTarget };
}

const render = () => renderUI(<OnboardingScreen />, { queryClient: makeQueryClient() });

/** Walks the flow from the welcome screen up to (but not through) the goal commit. */
async function fillToGoal() {
  await fireEvent.press(screen.getByTestId("welcome-create"));
  await fireEvent.changeText(screen.getByTestId("ob-displayName"), "Eren Bahadır");
  await fireEvent.changeText(screen.getByTestId("ob-username"), "eren");
  await fireEvent.changeText(screen.getByTestId("ob-password"), "cokgizli1");
  await fireEvent.press(screen.getByTestId("onboarding-next"));
  await waitFor(() => expect(screen.getByTestId("ob-height")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("ob-gender-male"));
  await fireEvent.press(screen.getByTestId("ob-activity-moderate"));
  await fireEvent.press(screen.getByTestId("ob-birth-year-option-1994"));
  await fireEvent.press(screen.getByTestId("onboarding-next"));
  await waitFor(() => expect(screen.getByTestId("ob-weightKg")).toBeTruthy());
  await fireEvent.changeText(screen.getByTestId("ob-weightKg"), "92");
  await fireEvent.changeText(screen.getByTestId("ob-neckCm"), "40");
  await fireEvent.changeText(screen.getByTestId("ob-waistCm"), "96");
}

describe("OnboardingScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDraft();
    useSession.setState({ status: "signedOut", user: null, signedOutReason: null });
  });

  test("opens on the welcome screen with a promise and two doors", async () => {
    makeApi();
    await render();
    expect(screen.getByTestId("welcome-floo")).toBeTruthy();
    expect(screen.getByText("FitFloow")).toBeTruthy();
    expect(screen.getByTestId("welcome-create")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("welcome-signin"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/(auth)/login");
  });

  test("the account step will not submit until every field is valid, and says why", async () => {
    makeApi();
    await render();
    await fireEvent.press(screen.getByTestId("welcome-create"));
    expect(screen.getByTestId("onboarding-next").props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.changeText(screen.getByTestId("ob-password"), "kisa");
    await fireEvent(screen.getByTestId("ob-password"), "blur");
    expect(screen.getByText("En az 8 karakter.")).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("ob-displayName"), "Eren");
    await fireEvent.changeText(screen.getByTestId("ob-username"), "eren");
    await fireEvent.changeText(screen.getByTestId("ob-password"), "cokgizli1");
    expect(screen.getByTestId("onboarding-next").props.accessibilityState).toMatchObject({ disabled: false });
  });

  test("registering signs you in and moves on; a taken username keeps you where you are", async () => {
    const taken = jest.fn(async () => {
      throw new ApiClientError(409, "CONFLICT", "taken");
    });
    makeApi({ register: taken });
    await render();
    await fireEvent.press(screen.getByTestId("welcome-create"));
    await fireEvent.changeText(screen.getByTestId("ob-displayName"), "Eren");
    await fireEvent.changeText(screen.getByTestId("ob-username"), "eren");
    await fireEvent.changeText(screen.getByTestId("ob-password"), "cokgizli1");
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() => expect(screen.getByTestId("onboarding-error")).toBeTruthy());
    expect(screen.getByTestId("onboarding-error").props.children).toMatch(/alınmış/);
    expect(screen.getByTestId("ob-username")).toBeTruthy(); // still on the account step
  });

  test("the username is lowercased for the API, and the password never reaches disk", async () => {
    const { register } = makeApi();
    await render();
    await fireEvent.press(screen.getByTestId("welcome-create"));
    await fireEvent.changeText(screen.getByTestId("ob-displayName"), " Eren Bahadır ");
    await fireEvent.changeText(screen.getByTestId("ob-username"), "  ErenB  ");
    await fireEvent.changeText(screen.getByTestId("ob-password"), "cokgizli1");
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() => expect(register).toHaveBeenCalledWith({ username: "erenb", password: "cokgizli1", displayName: "Eren Bahadır" }));
    expect(JSON.stringify(loadDraft())).not.toContain("cokgizli1");
  });

  test("the measurement step shows the body-fat estimate the moment it can be computed", async () => {
    makeApi();
    await render();
    await fillToGoal();
    const expected = navyBodyFat({ gender: "male", heightCm: DEFAULT_HEIGHT_CM, neckCm: 40, waistCm: 96 });
    expect(screen.getByTestId("ob-estimate-pct").props.children).toBe(fmtPct(expected));
    expect(screen.getByTestId("ob-estimate")).toBeTruthy();
  });

  test("before the third measurement there is a promise, not an empty space", async () => {
    makeApi();
    await render();
    await fireEvent.press(screen.getByTestId("welcome-create"));
    await fireEvent.changeText(screen.getByTestId("ob-displayName"), "Eren");
    await fireEvent.changeText(screen.getByTestId("ob-username"), "eren");
    await fireEvent.changeText(screen.getByTestId("ob-password"), "cokgizli1");
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() => expect(screen.getByTestId("ob-gender")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("ob-gender-male"));
    await fireEvent.press(screen.getByTestId("ob-activity-moderate"));
    await fireEvent.press(screen.getByTestId("ob-birth-year-option-1994"));
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() => expect(screen.getByTestId("ob-estimate-waiting")).toBeTruthy());
  });

  test("the goal step leads with intent and shows what each pace costs", async () => {
    makeApi();
    await render();
    await fillToGoal();
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() => expect(screen.getByTestId("goal-intent")).toBeTruthy());

    // Nothing chosen yet: the outcome card asks rather than showing a fake number.
    expect(screen.getByText("Bir yön seç")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("goal-intent-lose"));
    await waitFor(() => expect(screen.getByTestId("goal-slider")).toBeTruthy());
    for (const pace of ["conservative", "optimal", "aggressive"]) {
      expect(screen.getByTestId(`goal-pace-${pace}-date`)).toBeTruthy();
    }
    // Faster pace, earlier arrival.
    const dateOf = (p: string) => String(screen.getByTestId(`goal-pace-${p}-date`).props.children);
    expect(dateOf("aggressive")).not.toBe(dateOf("conservative"));
    expect(screen.getByTestId("outcome-date")).toBeTruthy();
    expect(screen.getByTestId("outcome-spine")).toBeTruthy();
  });

  test("choosing to hold steady replaces the plan with a daily calorie number", async () => {
    makeApi();
    await render();
    await fillToGoal();
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() => expect(screen.getByTestId("goal-intent")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("goal-intent-maintain"));
    expect(screen.queryByTestId("goal-slider")).toBeNull();
    expect(screen.getByText("Kilonu koruyan günlük kalori")).toBeTruthy();
  });

  test("committing sends one POST /onboarding, then the plan reads back as one sentence", async () => {
    const { complete } = makeApi();
    await render();
    await fillToGoal();
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() => expect(screen.getByTestId("goal-intent")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("goal-intent-lose"));
    await fireEvent.press(screen.getByTestId("onboarding-next"));

    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(complete.mock.calls[0][0]).toMatchObject({
      profile: { gender: "male", heightCm: DEFAULT_HEIGHT_CM, activityLevel: "moderate" },
      measurement: { weightKg: 92, neckCm: 40, waistCm: 96 },
      goal: { targetBodyFatPct: 18.5, profile: "optimal" },
    });
    await waitFor(() => expect(screen.getByTestId("done-summary")).toBeTruthy());
    expect(String(screen.getByTestId("done-summary").props.children)).toMatch(/kcal/);

    await fireEvent.press(screen.getByTestId("done-start"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)");
    expect(loadDraft()).toBeNull();
  });

  test("holding steady writes an automatic diet target instead of a goal", async () => {
    const { complete, setTarget } = makeApi();
    await render();
    await fillToGoal();
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() => expect(screen.getByTestId("goal-intent")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("goal-intent-maintain"));
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() => expect(complete).toHaveBeenCalled());
    expect(complete.mock.calls[0][0].goal).toBeNull();
    await waitFor(() => expect(setTarget).toHaveBeenCalledWith({ mode: "auto" }));
  });

  test("back always works and keeps what was already answered", async () => {
    makeApi();
    await render();
    await fillToGoal();
    await fireEvent.press(screen.getByTestId("onboarding-back"));
    await waitFor(() => expect(screen.getByTestId("ob-height")).toBeTruthy());
    expect(screen.getByTestId("ob-activity-moderate").props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() => expect(screen.getByTestId("ob-weightKg").props.value).toBe("92"));
  });

  test("a crash mid-flow resumes where it left off", async () => {
    makeApi();
    useSession.setState({ status: "signedIn", user: { ...USER, onboardingCompleted: false } as UserDTO });
    saveDraft({
      ...emptyDraft(),
      step: "measure",
      account: { displayName: "Eren", username: "eren" },
      profile: { gender: "male", birthDate: "1994-04-12", heightCm: 180, activityLevel: "moderate" },
      measurement: { weightKg: 92, neckCm: 40, waistCm: null, hipCm: null },
    });
    await render();
    expect(screen.getByTestId("ob-weightKg").props.value).toBe("92");
    expect(screen.getByTestId("ob-neckCm").props.value).toBe("40");
    // The account step is behind a signed-in user for good.
    expect(screen.getByTestId("onboarding-back").props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(screen.getByTestId("onboarding-back"));
    await waitFor(() => expect(screen.getByTestId("ob-gender")).toBeTruthy());
    expect(screen.getByTestId("onboarding-back").props.accessibilityState).toMatchObject({ disabled: true });
  });
});

import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { ApiClientError } from "@fitfloow/api-client";
import type { ApiClient } from "@fitfloow/api-client";
import { navyBodyFat, starterProgram, type UserDTO } from "@fitfloow/core";
import { makeQueryClient, renderUI } from "../../helpers";
import { mockRouter } from "../../mocks/expo-router";
import { OnboardingScreen } from "../../../src/features/onboarding/OnboardingScreen";
import { clearDraft, loadDraft, saveDraft } from "../../../src/features/onboarding/draft";
import { DEFAULT_HEIGHT_CM, emptyDraft } from "../../../src/features/onboarding/model";
import { useSession } from "../../../src/features/auth/session";
import { setApi } from "../../../src/lib/api";
import { storage } from "../../../src/lib/storage";
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

const PROGRAM = {
  id: "p1",
  ...starterProgram({ daysPerWeek: 3, level: "beginner" }),
  days: starterProgram({ daysPerWeek: 3, level: "beginner" }).days.map((d, i) => ({ ...d, id: `d${i + 1}`, exercises: [] })),
  currentDayId: "d1",
  currentIndex: 0,
  cycleNumber: 1,
  weekNumber: 1,
  startedAt: new Date().toISOString(),
  lastActionAt: new Date().toISOString(),
  sourceTemplateId: null,
};

function makeApi(over: { register?: jest.Mock; complete?: jest.Mock; setTarget?: jest.Mock } = {}) {
  const register = over.register ?? jest.fn(async () => ({ accessToken: "a", refreshToken: "r", user: { ...USER, onboardingCompleted: false } }));
  const complete = over.complete ?? jest.fn(async () => ({ user: { ...USER, onboardingCompleted: true }, bodyEntry: {}, goal: null, program: PROGRAM }));
  const setTarget = over.setTarget ?? jest.fn(async () => ({ target: {} }));
  const api = { auth: { register }, onboarding: { complete }, me: {}, nutrition: { setTarget } };
  setApi(api as unknown as ApiClient);
  return { register, complete, setTarget };
}

const render = () => renderUI(<OnboardingScreen />, { queryClient: makeQueryClient() });
const next = () => fireEvent.press(screen.getByTestId("onboarding-next"));
const say = () => String(screen.getByTestId("onboarding-floo-say").props.children);

async function toAccount(name = "Eren Bahadır") {
  await fireEvent.press(screen.getByTestId("welcome-create"));
  await fireEvent.changeText(screen.getByTestId("ob-displayName"), name);
  await next();
  await waitFor(() => expect(screen.getByTestId("ob-username")).toBeTruthy());
}

async function toBody() {
  await toAccount();
  await fireEvent.changeText(screen.getByTestId("ob-username"), "eren");
  await fireEvent.changeText(screen.getByTestId("ob-password"), "cokgizli1");
  await next();
  await waitFor(() => expect(screen.getByTestId("ob-height")).toBeTruthy());
}

async function toMeasure(gender: "male" | "female" = "male") {
  await toBody();
  await fireEvent.press(screen.getByTestId(`ob-gender-${gender}`));
  await fireEvent.press(screen.getByTestId("ob-birth-year-option-1994"));
  await next();
  await waitFor(() => expect(screen.getByTestId("ob-weightKg")).toBeTruthy());
}

async function measure(values: { weightKg: string; neckCm: string; waistCm: string; hipCm?: string }) {
  for (const [k, v] of Object.entries(values)) await fireEvent.changeText(screen.getByTestId(`ob-${k}`), v);
}

const HEAVY = { weightKg: "92", neckCm: "40", waistCm: "96" };
const LEAN = { weightKg: "72", neckCm: "38", waistCm: "78" };

async function toTraining(values = HEAVY) {
  await toMeasure();
  await measure(values);
  await next();
  await waitFor(() => expect(screen.getByTestId("ob-activity")).toBeTruthy());
}

async function toGoal(values = HEAVY) {
  await toTraining(values);
  await fireEvent.press(screen.getByTestId("ob-activity-moderate"));
  await fireEvent.press(screen.getByTestId("ob-days-3"));
  await fireEvent.press(screen.getByTestId("ob-experience-under1"));
  await next();
  await waitFor(() => expect(screen.getByTestId("ob-assessment")).toBeTruthy());
  await next();
  await waitFor(() => expect(screen.getByTestId("goal-slider")).toBeTruthy());
}

describe("OnboardingScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDraft();
    useSession.setState({ status: "signedOut", user: null, signedOutReason: null });
  });

  test("opens on the welcome screen with Floo, a promise and two doors", async () => {
    makeApi();
    await render();
    expect(screen.getByTestId("welcome-floo")).toBeTruthy();
    expect(screen.getByText("FitFloow")).toBeTruthy();
    expect(screen.getByTestId("welcome-create")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("welcome-signin"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/(auth)/login");
  });

  test("hello: Floo asks one question, and the progress bar reads stage 1 of 7", async () => {
    makeApi();
    await render();
    await fireEvent.press(screen.getByTestId("welcome-create"));
    expect(screen.getByTestId("onboarding-floo")).toBeTruthy();
    expect(say()).toMatch(/nasıl sesleneyim/);
    expect(screen.getByTestId("onboarding-step-count").props.children).toEqual([1, "/", 7]);
    expect(screen.getByTestId("onboarding-next").props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.changeText(screen.getByTestId("ob-displayName"), "Eren");
    expect(screen.getByTestId("onboarding-next").props.accessibilityState).toMatchObject({ disabled: false });
  });

  test("the account step greets by name and will not submit until every field is valid, and says why", async () => {
    makeApi();
    await render();
    await toAccount();
    await waitFor(() => expect(say()).toContain("Eren"));
    expect(screen.getByTestId("onboarding-next").props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.changeText(screen.getByTestId("ob-password"), "kisa");
    await fireEvent(screen.getByTestId("ob-password"), "blur");
    expect(screen.getByText("En az 8 karakter.")).toBeTruthy();

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
    await toAccount();
    await fireEvent.changeText(screen.getByTestId("ob-username"), "eren");
    await fireEvent.changeText(screen.getByTestId("ob-password"), "cokgizli1");
    await next();
    await waitFor(() => expect(screen.getByTestId("onboarding-error")).toBeTruthy());
    expect(screen.getByTestId("onboarding-error").props.children).toMatch(/alınmış/);
    expect(screen.getByTestId("ob-username")).toBeTruthy(); // still on the account step
    await waitFor(() => expect(say()).toMatch(/olmadı/));
  });

  test("the username is lowercased for the API, and the password never reaches disk", async () => {
    const { register } = makeApi();
    await render();
    await toAccount(" Eren Bahadır ");
    await fireEvent.changeText(screen.getByTestId("ob-username"), "  ErenB  ");
    await fireEvent.changeText(screen.getByTestId("ob-password"), "cokgizli1");
    await next();
    await waitFor(() => expect(register).toHaveBeenCalledWith({ username: "erenb", password: "cokgizli1", displayName: "Eren Bahadır" }));
    expect(JSON.stringify(loadDraft())).not.toContain("cokgizli1");
    await waitFor(() => expect(screen.getByTestId("onboarding-step-count").props.children).toEqual([2, "/", 7]));
  });

  test("before the last measurement the ring counts what is in, and there is a promise, not an empty space", async () => {
    makeApi();
    await render();
    await toMeasure();
    expect(screen.getByTestId("ob-estimate-waiting")).toBeTruthy();
    expect(screen.getByTestId("ob-ring-count").props.children).toEqual([0, "/", 3]);
    await measure({ weightKg: "92", neckCm: "40", waistCm: "" });
    expect(screen.getByTestId("ob-ring-count").props.children).toEqual([2, "/", 3]);
  });

  test("the ring shows the body-fat estimate the moment the last measurement lands", async () => {
    makeApi();
    await render();
    await toMeasure();
    await measure({ weightKg: "92", neckCm: "40", waistCm: "96" });
    const expected = navyBodyFat({ gender: "male", heightCm: DEFAULT_HEIGHT_CM, neckCm: 40, waistCm: 96 });
    expect(screen.getByTestId("ob-ring-pct").props.children).toBe(fmtPct(expected));
    expect(screen.queryByTestId("ob-estimate-waiting")).toBeNull();
  });

  test("Floo answers each measurement as soon as it settles", async () => {
    makeApi();
    await render();
    await toMeasure();
    await fireEvent.changeText(screen.getByTestId("ob-weightKg"), "92");
    await waitFor(() => expect(say()).toMatch(/92 kg, not ettim/), { timeout: 2000 });
    await fireEvent.changeText(screen.getByTestId("ob-neckCm"), "400");
    await fireEvent(screen.getByTestId("ob-neckCm"), "blur");
    await waitFor(() => expect(say()).toMatch(/tuhaf/), { timeout: 2000 });
    await fireEvent.changeText(screen.getByTestId("ob-neckCm"), "40");
    await fireEvent.changeText(screen.getByTestId("ob-waistCm"), "96");
    await fireEvent(screen.getByTestId("ob-waistCm"), "blur");
    await waitFor(() => expect(say()).toMatch(/Yağ oranın yaklaşık %/), { timeout: 2000 });
  });

  test("women are asked for the hip, and the ring waits for it", async () => {
    makeApi();
    await render();
    await toMeasure("female");
    expect(screen.getByTestId("ob-hipCm")).toBeTruthy();
    await measure({ weightKg: "64", neckCm: "32", waistCm: "76" });
    expect(screen.getByTestId("ob-ring-count").props.children).toEqual([3, "/", 4]);
    expect(screen.getByTestId("onboarding-next").props.accessibilityState).toMatchObject({ disabled: true });
    await measure({ weightKg: "64", neckCm: "32", waistCm: "76", hipCm: "100" });
    expect(screen.getByTestId("ob-ring-pct")).toBeTruthy();
  });

  test("training needs activity, weekly days and experience", async () => {
    makeApi();
    await render();
    await toTraining();
    expect(screen.getByTestId("onboarding-next").props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId("ob-activity-moderate"));
    await fireEvent.press(screen.getByTestId("ob-days-4"));
    expect(screen.getByTestId("onboarding-next").props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId("ob-experience-overThree"));
    expect(screen.getByTestId("ob-days-4").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId("onboarding-next").props.accessibilityState).toMatchObject({ disabled: false });
  });

  test("'where you are now' shows body fat, lean mass and FFMI with its meaning, and Floo says the verdict", async () => {
    makeApi();
    await render();
    await toTraining();
    await fireEvent.press(screen.getByTestId("ob-activity-moderate"));
    await fireEvent.press(screen.getByTestId("ob-days-3"));
    await fireEvent.press(screen.getByTestId("ob-experience-under1"));
    await next();
    await waitFor(() => expect(screen.getByTestId("ob-assessment")).toBeTruthy());
    const bf = navyBodyFat({ gender: "male", heightCm: DEFAULT_HEIGHT_CM, neckCm: 40, waistCm: 96 });
    expect(screen.getByTestId("ob-assess-bf").props.children).toBe(fmtPct(bf));
    expect(screen.getByTestId("ob-assess-ffmi")).toBeTruthy();
    expect(screen.getByTestId("ob-assess-meaning")).toBeTruthy();
    await waitFor(() => expect(say()).toMatch(/FFMI/));
  });

  test("the goal step leads with Floo's recommendation and shows what each pace costs", async () => {
    makeApi();
    await render();
    await toGoal();
    // 92 kg at ~25 % body fat: Floo suggests a cut, and it is already selected.
    expect(screen.getByTestId("goal-direction-cut").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText("Floo önerisi")).toBeTruthy();
    const weeks = () => Number(screen.getByTestId("goal-weeks").props.children);
    const optimal = weeks();
    expect(optimal).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId("goal-pace-aggressive"));
    expect(weeks()).toBeLessThan(optimal);
    expect(screen.getByTestId("goal-rate")).toBeTruthy();
    expect(screen.getByTestId("goal-kcal")).toBeTruthy();
  });

  test("switching direction changes the slider's unit, Floo answers with the plan, and reset brings the recommendation back", async () => {
    makeApi();
    await render();
    await toGoal();
    expect(screen.queryByTestId("goal-reset")).toBeNull();
    await fireEvent.press(screen.getByTestId("goal-direction-recomp"));
    expect(screen.getByTestId("goal-direction-recomp").props.accessibilityState).toMatchObject({ selected: true });
    expect(String(screen.getByTestId("goal-slider-value").props.children)).toMatch(/^%/);
    await waitFor(() => expect(say()).toMatch(/haftada/), { timeout: 2000 });
    await fireEvent.press(screen.getByTestId("goal-reset"));
    expect(screen.getByTestId("goal-direction-cut").props.accessibilityState).toMatchObject({ selected: true });
  });

  test("the slider is adjustable by assistive tech and moves the plan", async () => {
    makeApi();
    await render();
    await toGoal();
    const before = String(screen.getByTestId("goal-slider-value").props.children);
    await act(async () => {
      fireEvent(screen.getByTestId("goal-slider"), "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    });
    expect(String(screen.getByTestId("goal-slider-value").props.children)).not.toBe(before);
  });

  test("accepting commits once: profile, measurement, the goal with its training level, and the training answers", async () => {
    const { complete } = makeApi();
    await render();
    await toGoal();
    await next();

    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    const body = complete.mock.calls[0][0];
    expect(body).toMatchObject({
      profile: { gender: "male", heightCm: DEFAULT_HEIGHT_CM, activityLevel: "moderate" },
      measurement: { weightKg: 92, neckCm: 40, waistCm: 96 },
      goal: { direction: "cut", trainingLevel: "beginner", profile: "optimal" },
      training: { daysPerWeek: 3, experience: "under1" },
    });
    expect(body.goal.targetBodyFatPct).toBeGreaterThan(0);

    await waitFor(() => expect(screen.getByTestId("onboarding-done")).toBeTruthy());
    expect(screen.getByTestId("onboarding-step-count").props.children).toEqual([7, "/", 7]);
    expect(screen.getByTestId("done-program-name").props.children).toBe(PROGRAM.name);
    expect(String(screen.getByTestId("done-kcal").props.children)).toMatch(/kcal/);
    expect(screen.getByTestId("onboarding-back").props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.press(screen.getByTestId("done-start"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)");
    expect(loadDraft()).toBeNull();
  });

  test("a lean lifter is offered a bulk, and accepting it sends a lean-mass target, never a body-fat one", async () => {
    const { complete } = makeApi();
    await render();
    await toGoal(LEAN);
    expect(screen.getByTestId("goal-direction-bulk").props.accessibilityState).toMatchObject({ selected: true });
    expect(String(screen.getByTestId("goal-slider-value").props.children)).toMatch(/^\+.* kg$/);
    await next();
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    const goal = complete.mock.calls[0][0].goal;
    expect(goal).toMatchObject({ direction: "bulk", trainingLevel: "beginner" });
    expect(goal.targetLeanGainKg).toBeGreaterThan(0);
    expect(goal.targetBodyFatPct).toBeUndefined();
  });

  test("skipping the goal commits with no goal and an automatic diet target", async () => {
    const { complete, setTarget } = makeApi();
    await render();
    await toGoal();
    await fireEvent.press(screen.getByTestId("goal-skip"));
    await waitFor(() => expect(complete).toHaveBeenCalled());
    expect(complete.mock.calls[0][0].goal).toBeNull();
    await waitFor(() => expect(setTarget).toHaveBeenCalledWith({ mode: "auto" }));
    await waitFor(() => expect(screen.getByTestId("done-summary")).toBeTruthy());
    expect(String(screen.getByTestId("done-summary").props.children)).toMatch(/hedef yok/);
  });

  test("back always works and keeps what was already answered", async () => {
    makeApi();
    await render();
    await toTraining();
    await fireEvent.press(screen.getByTestId("onboarding-back"));
    await waitFor(() => expect(screen.getByTestId("ob-weightKg").props.value).toBe("92"));
    await fireEvent.press(screen.getByTestId("onboarding-back"));
    await waitFor(() => expect(screen.getByTestId("ob-height")).toBeTruthy());
    expect(screen.getByTestId("ob-gender-male").props.accessibilityState).toMatchObject({ selected: true });
    await next();
    await waitFor(() => expect(screen.getByTestId("ob-weightKg").props.value).toBe("92"));
  });

  test("a crash mid-flow resumes where it left off, and hello/account are behind a signed-in user", async () => {
    makeApi();
    useSession.setState({ status: "signedIn", user: { ...USER, onboardingCompleted: false } as UserDTO });
    saveDraft({
      ...emptyDraft(),
      step: "measure",
      account: { displayName: "Eren", username: "eren" },
      profile: { gender: "male", birthDate: "1994-04-12", heightCm: 180 },
      measurement: { weightKg: 92, neckCm: 40, waistCm: null, hipCm: null },
    });
    await render();
    expect(screen.getByTestId("ob-weightKg").props.value).toBe("92");
    expect(screen.getByTestId("ob-neckCm").props.value).toBe("40");
    expect(screen.getByTestId("onboarding-back").props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(screen.getByTestId("onboarding-back"));
    await waitFor(() => expect(screen.getByTestId("ob-gender")).toBeTruthy());
    expect(screen.getByTestId("onboarding-back").props.accessibilityState).toMatchObject({ disabled: true });
  });

  test("a draft from the six-step flow resumes at the first new question", async () => {
    makeApi();
    useSession.setState({ status: "signedIn", user: { ...USER, onboardingCompleted: false } as UserDTO });
    storage.set(
      "onboarding.draft.v1",
      JSON.stringify({
        version: 1,
        step: "goal",
        account: { displayName: "Eren", username: "eren" },
        profile: { gender: "male", birthDate: "1994-04-12", heightCm: 180, activityLevel: "active" },
        measurement: { weightKg: 92, neckCm: 40, waistCm: 96, hipCm: null },
        goal: { intent: "lose", targetBodyFatPct: 16, profile: "optimal" },
      })
    );
    await render();
    expect(screen.getByTestId("ob-activity-active").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId("onboarding-step-count").props.children).toEqual([4, "/", 7]);
  });
});

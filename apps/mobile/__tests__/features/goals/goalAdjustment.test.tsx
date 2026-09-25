import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { makeQueryClient, renderUI } from "../../helpers";
import { GoalAdjustment } from "../../../src/features/goals/components/GoalAdjustment";
import { GoalFeedback } from "../../../src/features/goals/components/GoalFeedback";
import { useSession } from "../../../src/features/auth/session";
import { setApi } from "../../../src/lib/api";
import { createFakeApi } from "../../../src/lib/fake";

jest.mock("expo-router", () => jest.requireActual("../../mocks/expo-router"));

const TODAY = "2026-09-10";

describe("Goal adjustment (T7 proposal, one tap, never silent)", () => {
  let api: ReturnType<typeof createFakeApi>;
  beforeEach(async () => {
    api = createFakeApi({ latencyMs: 0, signedIn: true, today: () => TODAY });
    setApi(api);
    useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  });

  test("shows Floo's proposal with the recommended option preselected and the before/after plan", async () => {
    const proposal = (await api.goals.current()).adjustment!;
    await renderUI(<GoalAdjustment />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("goal-adjustment")).toBeTruthy());
    expect(screen.getByText(proposal.titleTr)).toBeTruthy();
    const rec = proposal.options.find((o) => o.recommended)!;
    if (proposal.options.length > 1) expect(screen.getByTestId(`goal-adjustment-option-${rec.action}`).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId("goal-adjustment-compare")).toBeTruthy();
  });

  test("accepting applies the chosen option on the server and the card goes away", async () => {
    const proposal = (await api.goals.current()).adjustment!;
    const spy = jest.spyOn(api.goals, "acceptAdjustment");
    await renderUI(<GoalAdjustment />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("goal-adjustment")).toBeTruthy());
    const other = proposal.options.find((o) => !o.recommended);
    if (other) await fireEvent.press(screen.getByTestId(`goal-adjustment-option-${other.action}`));
    await fireEvent.press(screen.getByTestId("goal-adjustment-accept"));
    const expected = other ?? proposal.options.find((o) => o.recommended)!;
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ id: proposal.id, action: expected.action }));
    await waitFor(() => expect(screen.queryByText(proposal.titleTr)).toBeNull());
    const goal = (await api.goals.current()).goal!;
    expect(goal.adjustments.map((a) => a.id)).toContain(proposal.id);
  });

  test("dismissing records the answer without changing the plan", async () => {
    const { goal, adjustment } = await api.goals.current();
    await renderUI(<GoalAdjustment />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("goal-adjustment")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("goal-adjustment-dismiss"));
    await waitFor(() => expect(screen.queryByText(adjustment!.titleTr)).toBeNull());
    const after = (await api.goals.current()).goal!;
    expect(after.plan).toEqual(goal!.plan);
    expect(after.adjustments.find((a) => a.id === adjustment!.id)?.status).toBe("dismissed");
  });

  test("the feedback card shows the engine's line and its progress bars", async () => {
    const { feedback } = await api.goals.current();
    await renderUI(<GoalFeedback />, { queryClient: makeQueryClient() });
    await waitFor(() => expect(screen.getByTestId("goal-feedback")).toBeTruthy());
    expect(screen.getByText(feedback!.textTr)).toBeTruthy();
    expect(screen.getByTestId("goal-feedback-bar-goal")).toBeTruthy();
    expect(screen.getByTestId("goal-feedback-bar-time")).toBeTruthy();
  });
});

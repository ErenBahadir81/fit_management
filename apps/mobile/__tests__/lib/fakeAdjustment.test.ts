import { zGoalAdjustmentResponse, zGoalView, zScanResult } from "@fitfloow/core";
import { ApiClientError } from "@fitfloow/api-client";
import { createFakeApi } from "../../src/lib/fake";
import { createNutritionFakeApi, fakeScanResult } from "../../src/lib/fake/nutritionFake";

const TODAY = "2026-09-10";

describe("FakeApi — goal adjustment proposals (T7 contract, T6 UI)", () => {
  test("accepting the recommended option re-plans the goal and records a marker; the proposal is gone", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true, today: () => TODAY });
    const view = await api.goals.current();
    const proposal = view.adjustment!;
    const recommended = proposal.options.find((o) => o.recommended)!;
    const res = await api.goals.acceptAdjustment({ id: proposal.id });
    expect(() => zGoalAdjustmentResponse.parse(res)).not.toThrow();
    expect(res.adjustment).toMatchObject({ id: proposal.id, status: "accepted", action: recommended.action, dateKey: TODAY });
    expect(res.goal.adjustments.map((a) => a.id)).toEqual([proposal.id]);
    expect(res.goal.plan.initialDailyCalorieTarget).toBe(recommended.after!.dailyCalorieTarget);

    const after = await api.goals.current();
    expect(() => zGoalView.parse(after)).not.toThrow();
    expect(after.adjustment?.id ?? null).not.toBe(proposal.id);
  });

  test("a chosen non-recommended option is applied as previewed", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true, today: () => TODAY });
    const proposal = (await api.goals.current()).adjustment!;
    const other = proposal.options.find((o) => !o.recommended)!;
    const res = await api.goals.acceptAdjustment({ id: proposal.id, action: other.action });
    expect(res.adjustment.action).toBe(other.action);
    expect(res.adjustment.after?.estimatedWeeks).toBe(other.after!.estimatedWeeks);
  });

  test("dismissing records it without touching the plan; answering twice is ADJUSTMENT_STALE", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true, today: () => TODAY });
    const { goal, adjustment } = await api.goals.current();
    const res = await api.goals.dismissAdjustment({ id: adjustment!.id });
    expect(res.adjustment).toMatchObject({ status: "dismissed", action: null, after: null });
    expect(res.goal.plan).toEqual(goal!.plan);
    const again = await api.goals.acceptAdjustment({ id: adjustment!.id }).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(ApiClientError);
    expect(again).toMatchObject({ status: 409, code: "ADJUSTMENT_STALE" });
    const unknown = await api.goals.dismissAdjustment({ id: "nope" }).catch((e: unknown) => e);
    expect(unknown).toMatchObject({ status: 409, code: "ADJUSTMENT_STALE" });
  });
});

describe("FakeApi — scan alternatives", () => {
  test("the demo scan offers a low-confidence item with catalogue alternatives", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true, today: () => TODAY });
    const scan = await api.nutrition.scan(new Blob(["x"], { type: "image/jpeg" }) as never);
    expect(() => zScanResult.parse(scan)).not.toThrow();
    const unsure = scan.detections.find((d) => d.confidence < 0.5)!;
    expect(unsure.alternatives?.length).toBeGreaterThan(0);
    for (const a of unsure.alternatives!) expect(a.food.id).not.toBe(unsure.food?.id);
  });

  test("the scenario scan (nutrition fixtures) carries up to three alternatives per item", () => {
    const { fake } = createNutritionFakeApi({ latencyMs: 0 });
    const scan = fakeScanResult(fake, "plate");
    expect(() => zScanResult.parse(scan)).not.toThrow();
    expect(scan.detections.map((d) => d.alternatives?.length)).toEqual([1, 1, 3]);
  });
});

# T6 Beslenme UI — prep notes (paused 2026-09-24 07:31Z, Eren asked to stop not-started threads)

State: prep phase only, no code written. Branch `claude/t6-nutrition-ui-henqds` created locally from origin/main (not pushed, nothing on it).

Read so far:
- Nutrition tab: apps/mobile/src/features/nutrition/NutritionScreen.tsx (Gün/Hafta tabs, CalorieHero ring, EnergyCard, meal list, FAB -> AddSheet menu of 5 rows).
- Photo flow: features/nutrition/model/scanMachine.ts — MIN_ANALYZE_MS=1800 floor + STATUS_STEP_MS theatre to remove; ScanScreen/ScanResults/AiThinking in features/nutrition/scan.
- Goal: features/goals (useGoal.ts hooks on /goals/current, preview, recalibrate; RoadmapScreen, PlanTrendChart, GoalSetupScreen as modal).
- Types: packages/core/src/schemas/goal.ts (GoalView, GoalProgress, RoadmapWeek), nutrition.ts (zDetection has no alternatives -> top-3 per item needs API + schema change, T6 area).
- Body data for progress charts: api.body.trends(days), body.entries, weighIns.

Browser baseline: helper script booting API (:4102, MONGO_MEMORY, VISION_MOCK) + mobile web export (:8102) mirrors scripts/e2e.sh; e2e/mobile-nutrition.e2e.mjs already drives nutrition + scan. Baseline screenshots NOT taken yet.

T7 contact: sent T7 (cse_01LgHcht8prSpvFjZPJFvFqx) a request for: plan direction field (cut/bulk/recomp), signed surplus/deficit in roadmap, adjustment markers + pending adjustment accept endpoint, FFMI/LBM progress fields. No answer yet.

Next on resume: take baseline screenshots, read T7's answer, design flows (frontend-design, emil-design-eng, dataviz), write data hooks, wait for T1 foundation.

## T7 answer (2026-09-24 07:36Z) — draft PR #4, branch claude/t7-goal-engine-20i5l6; contract docs/plan/11-muscle-gain-engine.md
- goal.direction / goal.plan.direction: "cut"|"bulk"|"recomp" (legacy = cut).
- RoadmapWeek unchanged; weeklyDeficitKcal/cumulativeDeficitKcal signed (negative = surplus on bulk). tdee = dailyCalorieTarget + weeklyDeficitKcal/7. rateKgPerWeek, plan.totalLossKg are magnitudes. Optional per week startLeanMassKg/endLeanMassKg.
- Actual trend: use /body/trends. Markers: goal.adjustments[] {id, kind, status accepted|dismissed, action, dateKey, at, before, after}; before/after = {dailyCalorieTarget, estimatedWeeks, targetDate, targetWeightKg, targetBodyFatPct, targetLeanGainKg}.
- GoalView = {goal, progress, feedback, adjustment}. adjustment proposal {id, kind ahead|behind|stalled|reached, direction, deviationKg, mood, trigger, titleTr, messageTr, before, options[{action,labelTr,recommended,after}]} | null. POST /goals/current/adjustment/accept {id, action?}, /dismiss {id}; return {goal, adjustment}; 409 ADJUSTMENT_STALE. api-client: goals.acceptAdjustment / dismissAdjustment / assessment.
- Plan adds ffmiStart, ffmiEnd, leanGainKg, fatGainKg, targetLeanMassKg. feedback.bars {goal,time,lean|null,fat|null} 0–100; feedback.textTr/mood/trigger for Floo. GET /goals/assessment → {assessment} (FFMI now).

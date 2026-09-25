import React, { useCallback } from "react";
import type { GoalAdjustmentAction } from "@fitfloow/core";
import { toFlooMood, useFloo, useFlooOnce } from "../../../mascot";
import { fmtDate, fmtInt } from "../../../lib/format";
import { Entry } from "../../../ui/Entry";
import { useAnswerAdjustment, useGoalView } from "../useGoal";
import { AdjustmentCard } from "./AdjustmentCard";

/**
 * The pending adjustment from `/goals/current`, if there is one: Floo raises it once (the why, in
 * his bubble, with his thinking face), the card below the goal strip carries the one-tap answer.
 * Renders nothing while there is nothing to propose.
 */
export function GoalAdjustment() {
  const view = useGoalView();
  const answer = useAnswerAdjustment();
  const { say } = useFloo();
  const proposal = view.data?.goal?.status === "active" ? view.data.adjustment : null;

  useFlooOnce(proposal ? `goal:adjust:${proposal.id}` : null, proposal ? { text: proposal.messageTr, mood: toFlooMood(proposal.mood), trigger: "goalAdjustProposal", priority: "high" } : null);

  const onAccept = useCallback(
    (action: GoalAdjustmentAction) => {
      if (!proposal) return;
      const option = proposal.options.find((o) => o.action === action);
      answer.mutate(
        { id: proposal.id, action },
        {
          onSuccess: () => {
            const after = option?.after;
            say({
              text: action === "complete" ? "Hedefini kapattım. Tebrikler, başardın!" : after ? `Planı güncelledim: günde ${fmtInt(after.dailyCalorieTarget)} kcal, varış ${fmtDate(after.targetDate, "medium")}.` : "Planı güncelledim.",
              mood: action === "complete" ? "celebrate" : "happy",
              trigger: action === "complete" ? "goalHit" : "measurementLogged",
              tone: "success",
              dedupeKey: `goal:adjust:done:${proposal.id}`,
            });
          },
        }
      );
    },
    [answer, proposal, say]
  );
  const onDismiss = useCallback(() => {
    if (!proposal) return;
    answer.mutate(
      { id: proposal.id, dismiss: true },
      { onSuccess: () => say({ text: "Tamam, plan aynen devam. Gerekirse yine söylerim.", mood: "happy", dedupeKey: `goal:adjust:done:${proposal.id}` }) }
    );
  }, [answer, proposal, say]);

  if (!proposal) return null;
  return (
    <Entry index={1}>
      <AdjustmentCard proposal={proposal} onAccept={onAccept} onDismiss={onDismiss} busy={answer.isPending} />
    </Entry>
  );
}

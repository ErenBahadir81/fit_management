import React, { useCallback, useLayoutEffect, useRef } from "react";
import type { GoalAdjustmentAction } from "@fitfloow/core";
import { toFlooMood, useFloo, useFlooOnce, type FlooMessage } from "../../../mascot";
import { fmtDate, fmtInt } from "../../../lib/format";
import { Entry } from "../../../ui/Entry";
import { useAnswerAdjustment, useGoalView } from "../useGoal";
import { AdjustmentCard } from "./AdjustmentCard";

/** Key of the proposal's line in Floo's queue. */
const adjustKey = (id: string) => `goal:adjust:${id}`;

/**
 * The pending adjustment from `/goals/current`, if there is one: Floo raises it once (the why, in
 * his bubble, with his thinking face), the card below the goal strip carries the one-tap answer.
 * Renders nothing while there is nothing to propose.
 */
export function GoalAdjustment() {
  const view = useGoalView();
  const answer = useAnswerAdjustment();
  const { say, dismiss, current } = useFloo();
  const currentRef = useRef(current);
  useLayoutEffect(() => {
    currentRef.current = current;
  });
  const proposal = view.data?.goal?.status === "active" ? view.data.adjustment : null;

  // Floo never raises an answered question: a proposal line still waiting gives its place to the
  // answer's line (same key), and one on screen is closed so the answer gets its full time.
  const sayAnswer = useCallback(
    (id: string, msg: FlooMessage) => {
      const shown = currentRef.current;
      if (shown?.dedupeKey === adjustKey(id)) {
        dismiss(shown.id);
        say({ ...msg, dedupeKey: `${adjustKey(id)}:answer` });
      } else say({ ...msg, dedupeKey: adjustKey(id) });
    },
    [dismiss, say]
  );

  useFlooOnce(proposal ? adjustKey(proposal.id) : null, proposal ? { text: proposal.messageTr, mood: toFlooMood(proposal.mood), trigger: "goalAdjustProposal", priority: "high" } : null);

  const onAccept = useCallback(
    (action: GoalAdjustmentAction) => {
      if (!proposal) return;
      const option = proposal.options.find((o) => o.action === action);
      answer.mutate(
        { id: proposal.id, action },
        {
          onSuccess: () => {
            const after = option?.after;
            sayAnswer(proposal.id, {
              text: action === "complete" ? "Hedefini kapattım. Tebrikler, başardın!" : after ? `Planı güncelledim: günde ${fmtInt(after.dailyCalorieTarget)} kcal, varış ${fmtDate(after.targetDate, "medium")}.` : "Planı güncelledim.",
              mood: action === "complete" ? "celebrate" : "happy",
              trigger: action === "complete" ? "goalHit" : "measurementLogged",
              tone: "success",
            });
          },
        }
      );
    },
    [answer, proposal, sayAnswer]
  );
  const onDismiss = useCallback(() => {
    if (!proposal) return;
    answer.mutate(
      { id: proposal.id, dismiss: true },
      { onSuccess: () => sayAnswer(proposal.id, { text: "Tamam, plan aynen devam. Gerekirse yine söylerim.", mood: "happy" }) }
    );
  }, [answer, proposal, sayAnswer]);

  if (!proposal) return null;
  return (
    <Entry index={1}>
      <AdjustmentCard proposal={proposal} onAccept={onAccept} onDismiss={onDismiss} busy={answer.isPending} />
    </Entry>
  );
}

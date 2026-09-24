import React from "react";
import type { HomeDTO } from "@fitfloow/core";
import { greetingFor, trHour } from "../../../lib/dates";
import { fmtDate } from "../../../lib/format";
import { toFlooMood } from "../../../mascot/moodMap";
import { useFlooOnce } from "../../../mascot/voice";
import { Header } from "../../../ui/Header";

/**
 * Date and greeting. Floo is not drawn here any more: it lives in the top-right corner of every
 * tab, and the day's line from the API arrives through its queue, once per day, instead of a
 * bubble that sat on the home screen permanently.
 */
export function HomeHeader({ data }: { data: HomeDTO }) {
  const greeting = `${greetingFor(trHour())}, ${data.user.displayName}`;
  const { mascot, today } = data;
  useFlooOnce(data.user.mascotEnabled && mascot.text ? `home:${today.dateKey}:${mascot.key ?? mascot.text}` : null, {
    text: mascot.text,
    mood: toFlooMood(mascot.mood),
    priority: "low",
  });
  return <Header eyebrow={fmtDate(today.dateKey, "weekday")} title={greeting} testID="home-header" />;
}

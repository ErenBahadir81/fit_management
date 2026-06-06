"use client";

import { cn } from "@/lib/utils";
import type { DayKind } from "@/lib/types";
import { kindIcon } from "./workout-ui";

export interface ScheduleEntry {
  dateISO: string;
  weekdayShort: string;
  weekdayLong: string;
  offset: number;
  dayOrder: number;
  title: string;
  focus: string;
  kind: DayKind;
}

export function WeekStrip({ schedule }: { schedule: ScheduleEntry[] }) {
  return (
    <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
      {schedule.map((s) => {
        const today = s.offset === 0;
        const Icon = kindIcon(s.kind);
        return (
          <div
            key={s.offset}
            className={cn(
              "shrink-0 w-[88px] rounded-2xl border p-2.5 flex flex-col items-center text-center",
              today
                ? "bg-primary text-white border-primary shadow-card"
                : "bg-surface border-border"
            )}
          >
            <span
              className={cn(
                "text-[11px] font-bold uppercase tracking-wide",
                today ? "text-white/80" : "text-muted"
              )}
            >
              {s.weekdayShort}
            </span>
            <span
              className={cn(
                "mt-2 h-9 w-9 grid place-items-center rounded-xl",
                today ? "bg-white/15 text-white" : "bg-surface-2 text-primary"
              )}
            >
              <Icon size={17} />
            </span>
            <span
              className={cn(
                "mt-2 text-[12px] font-bold leading-tight line-clamp-2",
                today ? "text-white" : "text-ink"
              )}
            >
              {s.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}

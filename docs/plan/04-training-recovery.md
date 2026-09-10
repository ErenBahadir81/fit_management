# 04 — Training & Recovery (module B2, `packages/core/src/training`, `apps/api/src/modules/training`)

Port v1 semantics faithfully, then extend. v1 reference implementations live in git history
(`src/lib/services/fatigue.ts`, `src/app/api/_lib/program-util.ts`, `src/app/api/program/*`).

## Core (pure)
- `recoveredFraction(elapsedH, fullH)`: 0 → 0.7 at half → 1.0 at full (piecewise linear). Keep v1 tests semantics.
- `computeReadiness(hits, muscles: MuscleConfig[], now)`: per muscle `readiness = 100 × (1 − Σ sets·load·(1−rec)/reference)`;
  reference = heaviest still-fatiguing session load; status: `<40 fatigued`, `<85 recovering`, else `ready`.
  **Change**: hits now carry `load` (0..1) from exercise→muscle mapping; `sets × load` is the effective load.
- `buildHits(logs)`: skips off-days, skipped exercises, `metric === "stretch"`, uses real `sets.length`.
- `weeklyVolume(logs | template, muscles)`: sets per muscle in the last 7 days (or per cycle for templates) with `{done, target: {min, max}, status: "under"|"in"|"over"}`.
- `schedule(program, todayLog, now)`: 7-entry strip (today + 6) mapping cycle days to weekdays from the pointer, honoring off-days.
- `advancePointer(program)`, `jumpTo(program, index)`, `cardioProgression(target, log)`: next target minutes = best pace × km (never worse).
- `validateProgram(days)`: orders 1..N contiguous, kinds valid, exercises reference active catalog (by name) or are ad-hoc with explicit muscles.

## API behaviours
- `GET /program` composite is one aggregation: program + today's log (TR day) + schedule + weekly volume (uses last 7 days of logs).
- `POST /program/complete` writes the log with `strength[].muscles` resolved from the exercise catalog (loads), advances pointer,
  updates cardio targets for the *next* occurrence of that day in the template, bumps `weekNumber` on wrap.
- `POST /program/skip`: creates an `isOffDay` log for today (idempotent per day), pointer unchanged.
- `POST /program/undo-last`: only if the last log is today's; deletes it and restores pointer (store `pointerBefore` on the log).
- `GET /recovery`: logs from last 72 h only (max full recovery is 48 h; admin muscles may set more — query `max(fullRecoveryHours)`).
- Recovery honours **admin muscles** (`muscles` collection) — no hardcoded list. Unknown muscle keys in old logs are ignored.
- `GET /training/stats`: weekly buckets aligned to the user's measurement day.

## Tests
Port v1 numeric expectations (weekly totals of the seed program: chest 17, frontDelt 9, sideDelt 6, traps 9, lats 10, abs 6, legs 14 —
with load 1.0 mapping). Add load-weighted cases, pointer wrap, undo, cardio progression, schedule alignment, off-day idempotency.

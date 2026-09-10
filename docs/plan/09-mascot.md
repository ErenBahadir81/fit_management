# 09 — Mascot "Floo"

**Identity**: Floo is a small, round, violet-blue flame-drop (the FitFloow "flow" made alive). Big expressive eyes, tiny arms,
no mouth details needed beyond a simple curve. Drawn as vector (react-native-svg on mobile, inline SVG on admin), animated with
Reanimated: idle breathing (scale 1 ↔ 1.03, 2.4 s), blink every 3–5 s, mood transitions with springs, a "cheer" hop, a "flex"
arm raise, "think" eye drift, "sleepy" droop, "worried" brow tilt.

Moods: `happy | cheer | think | sleepy | flex | worried`. Palette: body gradient `#6D5DF6 → #8B7CFF`, cheeks `#FFB4C6`, eyes `#0F141C`,
highlight white. Shape = teardrop with a soft flame tip that sways.

**Voice** (Turkish): warm, short, second person singular, playful but never shaming; uses concrete numbers; max 2 sentences; emoji
sparingly (max 1). Placeholders: `{name}`, `{kcal}`, `{weeks}`, `{kg}`, `{pct}`, `{sessions}`, `{streak}`.

**Message catalog** (seeded into `mascotMessages`, admin-editable). Keys and 2–3 default variants each:
- `home.morning`, `home.afternoon`, `home.evening`, `home.noData`
- `home.workoutDue` ("Bugün {day} günü — hazır mısın?"), `home.workoutDone`, `home.restDay`
- `home.caloriesLeft` ("{kcal} kcal hakkın kaldı, akıllı harca."), `home.caloriesOver`
- `report.empty`, `report.onTrack`, `report.ahead`, `report.behind`, `report.stalled`, `report.perfectWeek`
- `goal.created` ("Yola çıktık! {weeks} haftada %{pct} — adım adım."), `goal.halfway`, `goal.completed`, `goal.recalibrated`
- `scan.start` ("Bakalım tabakta ne var…"), `scan.done`, `scan.lowConfidence`, `scan.failed`
- `body.newMeasurement`, `body.weighInStreak`, `body.noMeasurement7d`
- `workout.start`, `workout.finished`, `workout.pr`, `workout.skipped`
- `recovery.allReady`, `recovery.fatigued`
Selection: server (`GET /mascot/message`, home composite, weekly report) picks a key from state, chooses a variant by
`hash(userId + dateKey + key) % variants.length` (stable per day), fills placeholders. Client shows Floo + speech bubble.

Where Floo appears: home header (with bubble), weekly report hero, goal roadmap creation, scan overlay (small, "thinking"),
empty states (sleepy), admin dashboard corner (static).

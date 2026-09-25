# 09 — Mascot "Floo"

**Identity**: Floo is a blue water droplet (the FitFloow "flow" made alive) with rubber-hose arms and legs, four-fingered
mitten hands and boots — drawn after the reference illustration `Gemini_Generated_Image_pgiob1pgiob1pgio.jpg` (repo root).
Big glossy eyes that look slightly to the viewer's left, heavy short brows, an open smile with a row of teeth, two flicks of
water that spin off the tip now and then. Colours: `FLOO_MODEL_COLORS` in `apps/mobile/src/mascot/model/params.ts`.

## The model (`apps/mobile/src/mascot/model/`)

- **Drawing** (`FlooModel.tsx`, `FlooLimbs.tsx`, `geometry.ts`): one Skia canvas. Body and face are a closed path plus a few
  shapes; every animated number lives on the UI thread (Reanimated shared values), nothing re-renders React per frame.
- **Skeleton** (`rig.ts`): each arm is shoulder → elbow → wrist, each leg hip → knee → ankle, posed by forward kinematics or
  two-bone IK and drawn as a tube through the joints with a mitten hand or a boot. All pose channels live in one flat vector
  (`CH`); a mood, a gesture key, the idle layer, the walk and a pointing target all write the same numbers, and one per-joint
  spring layer (`SPRING`) chases them in a frame callback — the shoulder leads, elbow and hand trail and overshoot.
  - IK blends in joint space: a reach's goal is in place before its weight rises and stays put while it falls
    (`trackIkTargets`); a far re-target lets go first; IK goals have a speed limit. A hand never flings through a T-pose.
  - `front` (arm drawn over the body) flips only when a reaching hand is at the body's edge (`resolveFront`).
  - The feet are planted: the body's sway and hop bend the legs, they never drag the feet.
  - Breath and the slow weight shift run by phase in the frame loop, so a mood's tempo changes their speed without a restart.
- **Poses** (`poses.ts`): a resting limb pose per mood (`MOOD_RIG`) and a library of gestures (`GESTURES`: wave, clap,
  fistPump, cheer, flex, point, shrug, yawn, thumbsUp, think, drink, splash, fallRecover, bellyPat, whoa, boop, wipeBrow,
  walk, plus idle fidgets). Gestures are key timelines over the mood; they start and end on the mood's pose. Authoring rules:
  anticipation before big moves, uneven beats, arms that come down on an arc (elbow folding) rather than as a straight pole.
- **Walk** (`applyWalk`): a front-on contact/passing cycle — planted foot never slides or lifts, soft toe-off and landing,
  two body bobs per stride (low just after contact), sway over the planted foot, arms counter-swinging the legs.
- **Idle**: breath, blinks (sometimes double), saccades, a slow weight shift, a small lean every 9–15 s, tip flicks every
  11–19 s, and a rare fidget (first after 12–20 s, then every 25–45 s) at 55 % weight.
- **Behaviour** (`behaviour.ts`): `TRIGGER_PLAN` maps each app trigger (mealLogged, goalHit, streakUp, missedDay, overTarget,
  waterLogged, setCompleted, workoutDone, measurementLogged, volumeWarning, goalAdjustProposal, greet, tap) to a mood, a
  gesture, an effect and a hold time; `flooTriggerPlan` gives the whole beat's duration for the voice queue.
- **Level of detail**: `full` (≥ 96 px: everything), `mid` (56–96 px: arms, no legs), `badge` (< 56 px, the header corner:
  body, face and one hand, cropped square). What a LOD does not draw is not computed.

## API

`<FlooModel mood size hydration look trigger onTriggerEnd gesture onGestureEnd pointAt walking lod animate />`

- `trigger={{ name, key }}` plays a trigger once per key; `onTriggerEnd(name)` fires when its beat is over.
- `gesture={{ name, key, mirror? }}` plays one gesture once per key. `onGestureEnd(name, { key, completed })` fires exactly
  once per key: when the timeline completes, or with `completed: false` when another gesture or a trigger replaces it (or the
  name is unknown). Use it to sequence a scene (onboarding) instead of timers.
- `pointAt={{ x, y }}` (view px) makes the nearer hand point there with IK until it is cleared.

## Reduced motion

With the OS setting on: no idle loops, no hops, squash, particles or travel. Moods cross-fade (face ≈ 240 ms, body shape
≈ 360 ms, eased). A gesture collapses to one pose change: the rig eases to the pose the gesture holds longest, keeps it, and
eases back on critically damped springs (no overshoot) — so a trigger still reads. A tap answers with a glow and a smiling
squint. `onGestureEnd` / `onTriggerEnd` still fire.

## Quality gates

- `apps/mobile/__tests__/mascot/rig.test.ts` simulates every gesture from every mood at 60 fps and fails on any one-frame jump
  of a wrist or the body; walk tests cover planted feet, bob, sway and counter-swing.
- `apps/mobile/scripts/floo-filmstrip` records every clip frame by frame (virtual clock) and flags teleports, clips that do not
  return to rest and reduced-motion steps; review with the rubric in its README.
- `apps/mobile/scripts/floo-parity` scores the idle pose against the reference image (target: overall ≥ 97).

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

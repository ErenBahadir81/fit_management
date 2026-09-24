import {
  A,
  ANKLE,
  ARM_BASE,
  CH,
  CHANNEL_COUNT,
  CHANNELS,
  FOREARM,
  HIP,
  LEG_BASE,
  REST,
  SHIN,
  SHOULDER,
  SPRING,
  THIGH,
  UPPER_ARM,
  applyGesture,
  applyWalk,
  loopCurve,
  armGeometry,
  resolveFront,
  FRONT_AT_IK,
  trackIkTargets,
  wristInBody,
  bodyToWorld,
  compileGesture,
  fk,
  ik,
  legGeometry,
  mirrorSpec,
  poseVector,
  softClamp,
  stepSprings,
} from "../../src/mascot/model/rig";
import { COMPILED, COMPILED_MIRROR, GESTURES, GESTURE_INDEX, IDLE_GESTURES, MOOD_RIG, gestureDuration } from "../../src/mascot/model/poses";
import { LOD_VIEW, TRIGGER_PLAN, ambientMood, flooBox, flooTriggerPlan, resolveLod } from "../../src/mascot/model/behaviour";
import { MOODS, TRIGGERS } from "../../src/mascot/model/params";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const IDENTITY = { ox: 100, oy: 262.6, tx: 0, ty: 0, lean: 0, sx: 1, sy: 1, k: 1 };

/** Every number in an SVG path string. */
const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe("rig — kinematics", () => {
  test("FK keeps bone lengths", () => {
    const c = fk(-1, SHOULDER.L, 40, 95, UPPER_ARM, FOREARM);
    expect(dist(c.root, c.mid)).toBeCloseTo(UPPER_ARM, 5);
    expect(dist(c.mid, c.end)).toBeCloseTo(FOREARM, 5);
  });

  test("IK reaches a reachable target and bends the elbow outward", () => {
    for (const s of [-1, 1] as const) {
      const root = s < 0 ? SHOULDER.L : SHOULDER.R;
      const target = { x: s < 0 ? 70 : 130, y: 200 };
      const sol = ik(s, root, target, UPPER_ARM, FOREARM);
      const c = fk(s, root, sol.a1, sol.a2, UPPER_ARM, FOREARM);
      expect(dist(c.end, target)).toBeLessThan(0.05);
      // Elbow is further from the body's centre line than the straight shoulder→target line.
      const t = (c.mid.y - root.y) / (target.y - root.y);
      const lineX = root.x + (target.x - root.x) * t;
      expect(s * (c.mid.x - lineX)).toBeGreaterThan(0);
    }
  });

  test("IK clamps an unreachable target to a straight limb pointing at it", () => {
    const target = { x: SHOULDER.R.x + 200, y: SHOULDER.R.y };
    const sol = ik(1, SHOULDER.R, target, UPPER_ARM, FOREARM);
    const c = fk(1, SHOULDER.R, sol.a1, sol.a2, UPPER_ARM, FOREARM);
    expect(dist(c.root, c.end)).toBeGreaterThan((UPPER_ARM + FOREARM) * 0.99);
    expect(Math.abs(c.end.y - SHOULDER.R.y)).toBeLessThan(0.5);
  });

  test("IK never returns NaN, even for a target on the shoulder itself", () => {
    const sol = ik(-1, SHOULDER.L, SHOULDER.L, UPPER_ARM, FOREARM);
    expect(Number.isFinite(sol.a1)).toBe(true);
    expect(Number.isFinite(sol.a2)).toBe(true);
  });

  test("soft clamp is identity inside the range and never exceeds the knee", () => {
    expect(softClamp(10, 0, 20, 5)).toBe(10);
    expect(softClamp(1000, 0, 20, 5)).toBeLessThanOrEqual(25);
    expect(softClamp(21, 0, 20, 5)).toBeGreaterThan(20);
    expect(softClamp(-1000, 0, 20, 5)).toBeGreaterThanOrEqual(-5);
    expect(softClamp(NaN, 0, 20, 5)).toBe(0);
  });

  test("body transform is the identity at rest and pivots lean on the soles", () => {
    const p = bodyToWorld({ x: 47.5, y: 176 }, IDENTITY);
    expect(p.x).toBeCloseTo(47.5);
    expect(p.y).toBeCloseTo(176);
    const foot = bodyToWorld({ x: 100, y: 262.6 }, { ...IDENTITY, lean: 12 });
    expect(foot.x).toBeCloseTo(100);
    expect(foot.y).toBeCloseTo(262.6);
  });
});

describe("rig — rest pose matches the reference", () => {
  const arm = armGeometry(REST, ARM_BASE.L, -1, SHOULDER.L, 0, null);

  test("left wrist lands where the reference's wrist is (≈ 34.8, 215)", () => {
    expect(arm.wrist.x).toBeCloseTo(34.8, 0);
    expect(arm.wrist.y).toBeCloseTo(215, 0);
  });

  test("the resting hand spans the reference's hand box (x 23–51, y 214–249)", () => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const d of [arm.hand.palm, arm.hand.fingers, arm.hand.thumb]) {
      const n = nums(d);
      for (let i = 0; i + 1 < n.length; i += 2) {
        xs.push(n[i]);
        ys.push(n[i + 1]);
      }
    }
    expect(Math.min(...xs)).toBeGreaterThan(20);
    expect(Math.max(...xs)).toBeLessThan(52);
    expect(Math.max(...ys)).toBeLessThan(250);
  });

  test("the two arms mirror each other about x = 100", () => {
    const r = armGeometry(REST, ARM_BASE.R, 1, SHOULDER.R, 0, null);
    expect(r.wrist.x).toBeCloseTo(200 - arm.wrist.x, 5);
    expect(r.wrist.y).toBeCloseTo(arm.wrist.y, 5);
  });

  test("planted legs reach their ankles at rest", () => {
    for (const side of ["L", "R"] as const) {
      const s = side === "L" ? -1 : 1;
      const g = legGeometry(REST, LEG_BASE[side], s, HIP[side], ANKLE[side], 0);
      const n = nums(g.tube);
      const end = { x: n[n.length - 2], y: n[n.length - 1] };
      expect(dist(end, ANKLE[side])).toBeLessThan(0.3);
      expect(THIGH + SHIN).toBeGreaterThan(dist(HIP[side], ANKLE[side]));
    }
  });

  test("lifting the body off the ground lifts the feet instead of stretching the legs", () => {
    const hip = { x: HIP.L.x, y: HIP.L.y - 30 };
    const g = legGeometry(REST, LEG_BASE.L, -1, hip, ANKLE.L, 0);
    const n = nums(g.tube);
    const end = { x: n[n.length - 2], y: n[n.length - 1] };
    expect(dist(hip, end)).toBeLessThanOrEqual(THIGH + SHIN + 0.01);
    expect(end.y).toBeLessThan(ANKLE.L.y - 20);
  });
});

describe("rig — springs", () => {
  test("every channel converges on its target and stays finite", () => {
    const x = REST.slice();
    const v = new Array(CHANNEL_COUNT).fill(0);
    const target = poseVector({ L_sh: 150, R_el: 100, hop: 10, L_curl: 1 });
    for (let i = 0; i < 240; i++) stepSprings(x, v, target, 1 / 60, SPRING.k, SPRING.z);
    for (let i = 0; i < CHANNEL_COUNT; i++) {
      expect(Number.isFinite(x[i])).toBe(true);
      expect(Math.abs(x[i] - target[i])).toBeLessThan(0.05);
    }
  });

  test("the elbow trails the shoulder (follow-through)", () => {
    const x = REST.slice();
    const v = new Array(CHANNEL_COUNT).fill(0);
    const target = poseVector({ L_sh: REST[CH.L_sh] + 60, L_el: REST[CH.L_el] + 60 });
    for (let i = 0; i < 4; i++) stepSprings(x, v, target, 1 / 60, SPRING.k, SPRING.z);
    const shDone = (x[CH.L_sh] - REST[CH.L_sh]) / 60;
    const elDone = (x[CH.L_el] - REST[CH.L_el]) / 60;
    expect(shDone).toBeGreaterThan(elDone);
  });

  test("a huge dropped frame cannot blow the simulation up", () => {
    const x = REST.slice();
    const v = new Array(CHANNEL_COUNT).fill(0);
    stepSprings(x, v, poseVector({ L_sh: 170 }), 2, SPRING.k, SPRING.z);
    for (const n of x) expect(Number.isFinite(n)).toBe(true);
  });
});

describe("pose library", () => {
  test("every mood has a rig pose with every channel finite", () => {
    for (const m of MOODS) {
      expect(MOOD_RIG[m]).toHaveLength(CHANNEL_COUNT);
      for (const n of MOOD_RIG[m]) expect(Number.isFinite(n)).toBe(true);
    }
  });

  test("gestures start and end on the base pose (no snap back)", () => {
    for (const g of GESTURES) {
      if (g === "walk") continue;
      const c = COMPILED[GESTURE_INDEX[g]];
      const base = MOOD_RIG.happy.slice();
      const at0 = base.slice();
      applyGesture(c, 0, at0);
      // IK goals hold their authored values by design (see trackIkTargets); the weight returns.
      const posed = c.channels.filter((ch) => !/_ik[XY]$/.test(CHANNELS[ch]));
      posed.forEach((ch) => expect(at0[ch]).toBeCloseTo(base[ch], 5));
      const end = base.slice();
      const alive = applyGesture(c, c.duration - 1, end);
      expect(alive).toBe(true);
      posed.forEach((ch) => expect(Math.abs(end[ch] - base[ch])).toBeLessThan(Math.max(1, Math.abs(base[ch]) * 0.05) + 3));
      expect(applyGesture(c, c.duration + 1, base.slice())).toBe(false);
    }
  });

  test("gesture values are finite at every millisecond", () => {
    for (const g of GESTURES) {
      const c = COMPILED[GESTURE_INDEX[g]];
      for (let t = 0; t < c.duration; t += 17) {
        const out = REST.slice();
        applyGesture(c, t, out);
        for (const n of out) expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  test("a wave raises the right arm; the mirrored wave raises the left", () => {
    const i = GESTURE_INDEX.wave;
    const a = REST.slice();
    applyGesture(COMPILED[i], 600, a);
    expect(a[CH.R_sh]).toBeGreaterThan(120);
    expect(a[CH.L_sh]).toBeCloseTo(REST[CH.L_sh]);
    const b = REST.slice();
    applyGesture(COMPILED_MIRROR[i], 600, b);
    expect(b[CH.L_sh]).toBeGreaterThan(120);
  });

  test("mirrorSpec swaps sides and flips lean", () => {
    expect(mirrorSpec({ L_sh: 10, R_ikX: 150, lean: 3 })).toEqual({ R_sh: 10, L_ikX: 50, lean: -3 });
  });

  test("keys are authored in time order and idle fidgets are real gestures", () => {
    for (const g of GESTURES) {
      const t = COMPILED[GESTURE_INDEX[g]].times;
      for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1]);
    }
    for (const g of IDLE_GESTURES) expect(GESTURES).toContain(g);
  });

  test("compileGesture fills untouched keys from the previous key", () => {
    const c = compileGesture({ keys: [{ t: 100, pose: { L_sh: 50 } }, { t: 200, pose: { R_sh: 50 } }, { t: 300, pose: {} }] });
    const out = REST.slice();
    applyGesture(c, 200, out);
    expect(out[CH.L_sh]).toBeCloseTo(50);
    expect(out[CH.R_sh]).toBeCloseTo(50);
  });

  test("the walk lifts one foot at a time and does nothing at zero amount", () => {
    const still = REST.slice();
    applyWalk(still, 1, 0);
    expect(still).toEqual(REST);
    for (const phase of [Math.PI / 2, (3 * Math.PI) / 2]) {
      const out = REST.slice();
      applyWalk(out, phase, 1);
      const l = out[CH.L_fy] > 0.5;
      const r = out[CH.R_fy] > 0.5;
      expect(l !== r).toBe(true);
    }
  });

  const walkAt = (phase: number) => {
    const out = REST.slice();
    applyWalk(out, phase, 1);
    return out;
  };
  const cycle = Array.from({ length: 64 }, (_, i) => (i / 64) * 2 * Math.PI);

  test("walk: the planted foot never slides or lifts while the other one swings", () => {
    for (const p of cycle) {
      const o = walkAt(p);
      const leftSwinging = p > 0 && p < Math.PI;
      const planted = leftSwinging ? "R" : "L";
      expect(o[CH[`${planted}_fy`]]).toBeCloseTo(0, 6);
      expect(o[CH[`${planted}_fx`]]).toBeCloseTo(0, 6);
      expect(o[CH[`${planted}_fa`]]).toBeCloseTo(0, 6);
    }
  });

  test("walk: the body is low just after each contact and high on the passing position", () => {
    const hop = (p: number) => walkAt(p)[CH.hop] - REST[CH.hop];
    // Contacts at 0 and π, passing at π/2 and 3π/2.
    for (const c of [0, Math.PI]) {
      expect(hop(c + 0.25)).toBeLessThan(hop(c + Math.PI / 2) - 2);
      expect(hop(c + 0.25)).toBeLessThan(0);
    }
    // Two bobs per stride, one per step.
    expect(hop(Math.PI / 2)).toBeCloseTo(hop((3 * Math.PI) / 2), 5);
  });

  test("walk: the body sways over the planted foot and the arms counter-swing the legs", () => {
    const leftSwing = walkAt(Math.PI / 2);
    const rightSwing = walkAt((3 * Math.PI) / 2);
    // Weight on the right foot while the left swings: the body shifts right (+x), and back.
    expect(leftSwing[CH.x]).toBeGreaterThan(0.8);
    expect(rightSwing[CH.x]).toBeLessThan(-0.8);
    // The arm opposite the swinging leg comes forward (its elbow folds in more).
    expect(leftSwing[CH.R_el]).toBeLessThan(rightSwing[CH.R_el] - 4);
    expect(rightSwing[CH.L_el]).toBeLessThan(leftSwing[CH.L_el] - 4);
  });

  test("walk: continuous through the whole cycle — no channel jumps between neighbouring phases", () => {
    const fine = Array.from({ length: 721 }, (_, i) => (i / 720) * 2 * Math.PI);
    let prev = walkAt(0);
    for (const p of fine.slice(1)) {
      const o = walkAt(p);
      for (let i = 0; i < o.length; i++) expect(Math.abs(o[i] - prev[i])).toBeLessThan(0.6);
      prev = o;
    }
  });
});

describe("rig — idle loops by phase", () => {
  test("loopCurve spans −1…1, is continuous across the wrap, and rises over `rise` of the cycle", () => {
    let prev = loopCurve(0, 0.47);
    expect(prev).toBeCloseTo(-1, 6);
    expect(loopCurve(0.47, 0.47)).toBeCloseTo(1, 6);
    for (let i = 1; i <= 1000; i++) {
      const v = loopCurve(i / 1000, 0.47);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.02);
      prev = v;
    }
    expect(loopCurve(1.25, 0.47)).toBeCloseTo(loopCurve(0.25, 0.47), 9);
  });
});

describe("rig — IK targets follow the hand while unused", () => {
  test("wristInBody is the FK wrist of the shoulder and elbow angles", () => {
    const v = REST.slice();
    for (const side of ["L", "R"] as const) {
      const s = side === "L" ? -1 : 1;
      const c = fk(s, SHOULDER[side], v[CH[`${side}_sh`]], v[CH[`${side}_sh`]] + v[CH[`${side}_el`]], UPPER_ARM, FOREARM);
      expect(wristInBody(v, ARM_BASE[side], s, true)).toBeCloseTo(c.end.x, 6);
      expect(wristInBody(v, ARM_BASE[side], s, false)).toBeCloseTo(c.end.y, 6);
    }
  });

  test("an arm not using IK has its target parked on its own hand", () => {
    const x = REST.slice();
    const vel = new Array<number>(CHANNEL_COUNT).fill(0);
    const tgt = REST.slice();
    trackIkTargets(x, vel, tgt);
    for (const side of ["L", "R"] as const) {
      const s = side === "L" ? -1 : 1;
      const b = ARM_BASE[side];
      expect(tgt[b + A.ikX]).toBeCloseTo(wristInBody(x, b, s, true), 6);
      expect(tgt[b + A.ikY]).toBeCloseTo(wristInBody(x, b, s, false), 6);
      expect(x[b + A.ikX]).toBeCloseTo(tgt[b + A.ikX], 6);
    }
  });

  test("a reach starts with the goal already in place, so only the weight moves the arm", () => {
    const x = REST.slice();
    const vel = new Array<number>(CHANNEL_COUNT).fill(0);
    const tgt = REST.slice();
    const b = ARM_BASE.R;
    tgt[b + A.ik] = 1;
    tgt[b + A.ikX] = 150;
    tgt[b + A.ikY] = 110;
    trackIkTargets(x, vel, tgt);
    expect(tgt[b + A.ikX]).toBe(150);
    expect(x[b + A.ikX]).toBe(150);
    expect(x[b + A.ikY]).toBe(110);
    // At a small weight the hand is still (nearly) where FK had it.
    const pose = x.slice();
    pose[b + A.ik] = 0.02;
    const g = armGeometry(pose, b, 1, SHOULDER.R, 0, { x: 150, y: 110 });
    const rest = armGeometry(REST, b, 1, SHOULDER.R, 0, null);
    expect(dist(g.wrist, rest.wrist)).toBeLessThan(3);
  });

  test("letting go holds the goal while the weight falls", () => {
    const x = REST.slice();
    const vel = new Array<number>(CHANNEL_COUNT).fill(0);
    const b = ARM_BASE.L;
    x[b + A.ik] = 0.5;
    x[b + A.ikX] = 80;
    x[b + A.ikY] = 200;
    const tgt = REST.slice();
    trackIkTargets(x, vel, tgt);
    expect(tgt[b + A.ikX]).toBe(80);
    expect(tgt[b + A.ikY]).toBe(200);
  });

  test("a reaching arm moves in front of the body only once the weight has brought the hand in, and back out the same way", () => {
    const b = ARM_BASE.L;
    const tgt = REST.slice();
    tgt[b + A.ik] = 1;
    tgt[b + A.front] = 1;
    const x = REST.slice();
    x[b + A.ik] = FRONT_AT_IK - 0.1;
    resolveFront(x, tgt);
    expect(x[b + A.front]).toBe(0);
    x[b + A.ik] = FRONT_AT_IK + 0.1;
    resolveFront(x, tgt);
    expect(x[b + A.front]).toBe(1);
    // Letting go: the pose no longer asks for front, but the hand is still over the belly.
    tgt[b + A.ik] = 0;
    tgt[b + A.front] = 0;
    x[b + A.ik] = 0.6;
    resolveFront(x, tgt);
    expect(x[b + A.front]).toBe(1);
    x[b + A.ik] = FRONT_AT_IK - 0.05;
    resolveFront(x, tgt);
    expect(x[b + A.front]).toBe(0);
    // An FK pose that asks for front gets it at once.
    const fk = REST.slice();
    const t2 = REST.slice();
    t2[ARM_BASE.R + A.front] = 1;
    resolveFront(fk, t2);
    expect(fk[ARM_BASE.R + A.front]).toBe(1);
  });

  test("compiled IK goals hold their authored values instead of travelling from the base pose", () => {
    const c = COMPILED[GESTURE_INDEX.bellyPat];
    const out = REST.slice();
    applyGesture(c, 10, out);
    expect(out[CH.L_ikX]).toBeCloseTo(72, 5);
    const end = REST.slice();
    applyGesture(c, c.duration - 5, end);
    expect(end[CH.L_ikX]).toBeCloseTo(72, 5);
    expect(end[CH.L_ik]).toBeLessThan(0.1);
  });
});

describe("behaviour", () => {
  test("every trigger has a plan and its gesture exists", () => {
    for (const t of TRIGGERS) {
      const p = TRIGGER_PLAN[t];
      expect(p).toBeDefined();
      if (p.gesture) expect(GESTURES).toContain(p.gesture);
      expect(flooTriggerPlan(t).durationMs).toBeGreaterThanOrEqual(p.hold);
    }
  });

  test("LOD follows the width, and the box follows the LOD's crop", () => {
    expect(resolveLod(200)).toBe("full");
    expect(resolveLod(96)).toBe("full");
    expect(resolveLod(80)).toBe("mid");
    expect(resolveLod(44)).toBe("badge");
    expect(resolveLod(44, "full")).toBe("full");
    expect(flooBox(200).height).toBeCloseTo(290);
    expect(flooBox(44).height).toBeCloseTo(44);
    expect(flooBox(80).height).toBeCloseTo((80 * LOD_VIEW.mid.h) / LOD_VIEW.mid.w);
  });

  test("ambient mood: night is sleepy, a training day is energetic, a rest day is calm", () => {
    const at = (h: number) => new Date(2026, 8, 24, h, 0, 0);
    expect(ambientMood({ now: at(2) })).toBe("sleepy");
    expect(ambientMood({ now: at(23) })).toBe("sleepy");
    expect(ambientMood({ now: at(9), isTrainingDay: true })).toBe("energetic");
    expect(ambientMood({ now: at(15), isRestDay: true })).toBe("idle");
    expect(ambientMood({ now: at(8) })).toBe("happy");
  });

  test("pointing arm reaches through IK toward an off-body target", () => {
    const v = poseVector({ R_ik: 1, R_ikX: 190, R_ikY: 120 });
    const g = armGeometry(v, ARM_BASE.R, 1, SHOULDER.R, 0, { x: 190, y: 120 });
    const before = dist(armGeometry(REST, ARM_BASE.R, 1, SHOULDER.R, 0, null).wrist, { x: 190, y: 120 });
    expect(dist(g.wrist, { x: 190, y: 120 })).toBeLessThan(before);
    expect(v[ARM_BASE.R + A.ik]).toBe(1);
  });
});

/**
 * The frame loop in miniature (mood pose → IK parking → gesture → springs), sampled at 60 fps, and
 * the world positions a viewer would track: both wrists, both ankles and the body's hop and lean.
 */
function simulate(g: (typeof GESTURES)[number], mood: (typeof MOODS)[number], ms: number) {
  const c = COMPILED[GESTURE_INDEX[g]];
  const x = MOOD_RIG[mood].slice();
  const v = new Array<number>(CHANNEL_COUNT).fill(0);
  const frames: { wrist: { L: { x: number; y: number }; R: { x: number; y: number } }; hop: number; lean: number }[] = [];
  for (let t = 0; t <= ms; t += 16) {
    const tgt = MOOD_RIG[mood].slice();
    applyGesture(c, t, tgt, 1);
    trackIkTargets(x, v, tgt);
    stepSprings(x, v, tgt, 0.016, SPRING.k, SPRING.z, SPRING.vmax);
    resolveFront(x, tgt);
    const wrist = (side: "L" | "R") => {
      const b = ARM_BASE[side];
      const target = x[b + A.ik] > 0.001 ? { x: x[b + A.ikX], y: x[b + A.ikY] } : null;
      return armGeometry(x, b, side === "L" ? -1 : 1, SHOULDER[side], x[CH.lean], target).wrist;
    };
    frames.push({ wrist: { L: wrist("L"), R: wrist("R") }, hop: x[CH.hop], lean: x[CH.lean] });
  }
  return frames;
}

describe("gestures in motion — no one-frame jumps", () => {
  // The fastest authored moves (both fists thrown up from a raised pose) cover ≈ 13 body units in
  // one 60 fps frame; the teleports this guards against (an IK flip, a goal dragged through the
  // shoulder, a reaching hand re-targeted across the body) were 30–75.
  const MAX_WRIST_STEP = 15;
  const MAX_HOP_STEP = 2.5;
  for (const g of GESTURES) {
    test(`${g}: wrists and body move continuously from every mood`, () => {
      for (const m of MOODS) {
        const f = simulate(g, m, gestureDuration(g) + 500);
        for (let i = 1; i < f.length; i++) {
          for (const side of ["L", "R"] as const) {
            const step = dist(f[i].wrist[side], f[i - 1].wrist[side]);
            if (step > MAX_WRIST_STEP) throw new Error(`${g} from ${m}: ${side} wrist jumps ${step.toFixed(1)} at ${i * 16}ms`);
          }
          const dh = Math.abs(f[i].hop - f[i - 1].hop);
          if (dh > MAX_HOP_STEP) throw new Error(`${g} from ${m}: hop jumps ${dh.toFixed(1)} at ${i * 16}ms`);
        }
      }
    });
  }
});

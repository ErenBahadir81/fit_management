/**
 * Floo event bus — the data layer says "something happened", whoever renders Floo decides how to
 * react. Intentionally tiny: synchronous, dependency-free, and silent when nobody listens, so a
 * mutation's `onSuccess` can always emit without caring whether a provider is mounted.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Mood, Trigger } from "./model/params";

export const FLOO_EVENTS = [
  "mealLogged",
  "waterLogged",
  "setCompleted",
  "workoutDone",
  "measurementLogged",
  "goalHit",
  "streakUp",
  "missedDay",
  "overTarget",
  "volumeWarning",
  "goalAdjustProposal",
  "greet",
] as const;
export type FlooEventName = (typeof FLOO_EVENTS)[number];

export interface FlooEvent {
  name: FlooEventName;
  payload?: Record<string, unknown>;
  at: number;
}

export type FlooListener = (event: FlooEvent) => void;

const RECENT_MAX = 5;
const listeners = new Set<FlooListener>();
let recentEvents: FlooEvent[] = [];

export const flooBus = {
  emit(name: FlooEventName, payload?: Record<string, unknown>): void {
    const event: FlooEvent = payload === undefined ? { name, at: Date.now() } : { name, payload, at: Date.now() };
    recentEvents = [...recentEvents.slice(-(RECENT_MAX - 1)), event];
    // Snapshot so a listener that (un)subscribes mid-dispatch cannot skip or double-call others.
    for (const fn of [...listeners]) {
      try {
        fn(event);
      } catch (e) {
        if (__DEV__) console.warn("[flooBus] listener threw", e);
      }
    }
  },
  subscribe(fn: FlooListener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** The newest event if it is younger than `maxAgeMs` (default 3 s) — for a provider that mounts late. */
  recent(maxAgeMs = 3000): FlooEvent | null {
    const last = recentEvents[recentEvents.length - 1];
    if (!last) return null;
    return Date.now() - last.at < maxAgeMs ? last : null;
  },
  /** Test helper: drop listeners and history. */
  reset(): void {
    listeners.clear();
    recentEvents = [];
  },
};

/** Subscribe for the component's lifetime; the latest `handler` is always the one called. */
export function useFlooEvents(handler: FlooListener): void {
  const ref = useRef(handler);
  useLayoutEffect(() => {
    ref.current = handler;
  });
  useEffect(() => flooBus.subscribe((event) => ref.current(event)), []);
}

/* ------------------------------ copy + mood ------------------------------ */

export interface FlooLine {
  /** Dedupe key: a second line with the same key replaces the first instead of piling up. */
  key: string;
  text: string;
  mood: Mood;
  trigger: Trigger;
  priority: "low" | "normal" | "high";
  /**
   * `warning` only for what the user should act on (over target, too much or too little volume).
   * Celebrations stay `neutral`: the mutation behind them already gave its own success haptic, and
   * the bubble's tone is what decides whether it buzzes again.
   */
  tone: "neutral" | "warning";
  /**
   * A fact about a day rather than a moment (set with `key` naming the day). Said at most once per
   * key, in the same memory `useFlooOnce` keeps, so a screen that notices the same state later does
   * not repeat it.
   */
  once?: true;
  ttlMs: number;
}

/**
 * The one key for "the day went over its calorie target", shared by the bus line and the home
 * screen. It keeps the home screen's original `home:over:<day>` spelling, so a warning already
 * shown before this key was shared still counts as shown.
 */
export const overTargetKey = (dateKey: string) => `home:over:${dateKey}`;

export const FLOO_LINE_MAX_CHARS = 60;

type Payload = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);
const fmt = (n: number) => String(Math.round(n));

function pick<T>(items: readonly T[], rand: () => number): T {
  const r = rand();
  const i = Math.min(items.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * items.length)));
  return items[i]!;
}

/** Variants that need payload return null when their data is missing; the rest always read fine. */
type Variant = (p: Payload) => string | null;

const COPY: Record<FlooEventName, readonly Variant[]> = {
  mealLogged: [
    (p) => {
      const name = str(p.name);
      return name ? `${name} kaydedildi, afiyet olsun!` : null;
    },
    (p) => {
      const kcal = num(p.kcal);
      return kcal != null ? `Afiyet olsun! +${fmt(kcal)} kcal yazdım.` : null;
    },
    () => "Afiyet olsun! Öğünün kayıtta.",
    () => "Not aldım, güzel gidiyorsun.",
    () => "Kaydettim, afiyet olsun!",
  ],
  waterLogged: [
    (p) => {
      const total = num(p.totalMl);
      const goal = num(p.goalMl);
      if (total == null || goal == null || goal <= 0) return null;
      const left = goal - total;
      return left > 0 ? `Su: ${fmt(total)}/${fmt(goal)} ml. Az kaldı!` : "Günlük su hedefin tamam, harika!";
    },
    (p) => {
      const ml = num(p.ml);
      return ml != null ? `+${fmt(ml)} ml su, ferahladık!` : null;
    },
    () => "Glu glu! Su kaydedildi.",
    () => "Bir yudum daha, çok iyi.",
  ],
  setCompleted: [
    (p) => {
      const exercise = str(p.exercise);
      const reps = num(p.reps);
      const kg = num(p.kg);
      if (!exercise || reps == null) return null;
      const line = kg != null && kg > 0 ? `${exercise}: ${fmt(reps)} × ${kg} kg. Güçlü!` : `${exercise}: ${fmt(reps)} tekrar. Güçlü!`;
      return line.length <= FLOO_LINE_MAX_CHARS ? line : `${fmt(reps)} tekrar, güçlü set!`;
    },
    (p) => {
      const i = num(p.setIndex);
      return i != null ? `${fmt(i + 1)}. set tamam, devam!` : null;
    },
    () => "Set tamam, devam!",
    () => "Güzel set! Nefesini topla.",
    () => "Bir set daha geride kaldı.",
  ],
  workoutDone: [
    () => "Antrenman bitti, seninle gurur duyuyorum!",
    () => "Harika iş çıkardın, şimdi dinlenme vakti.",
    () => "Bugünkü antrenman tamam. Süpersin!",
  ],
  measurementLogged: [
    () => "Ölçüm kaydedildi, gidişatı birlikte izleyelim.",
    () => "Yeni ölçüm tamam, teşekkürler!",
    () => "Not ettim. Veri ne kadar çok, yol o kadar net.",
  ],
  goalHit: [
    (p) => {
      const what = str(p.what);
      if (!what) return null;
      const line = `${what} hedefi tamam! Tebrikler!`;
      return line.length <= FLOO_LINE_MAX_CHARS ? line : null;
    },
    () => "Hedefine ulaştın! Tebrikler!",
    () => "Başardın! Bu bir kutlama sebebi.",
    () => "Hedef tamam! Emeğine sağlık.",
  ],
  streakUp: [
    (p) => {
      const days = num(p.days);
      return days != null && days > 0 ? `${fmt(days)} gün üst üste! Harikasın!` : null;
    },
    () => "Seri büyüyor, harikasın!",
    () => "Bir gün daha eklendi, devam!",
  ],
  missedDay: [
    () => "Dün kaçtı, bugün yeniden başlıyoruz.",
    () => "Olur böyle günler. Bugün kaldığımız yerden!",
    () => "Yeni gün, yeni şans. Hadi birlikte!",
  ],
  overTarget: [
    (p) => {
      const over = num(p.overKcal);
      return over != null && over > 0 ? `Hedefi ${fmt(over)} kcal aştık, dert değil.` : null;
    },
    () => "Bugün hedefi biraz aştık, dert değil.",
    () => "Hedefin üstündeyiz. Yarın dengeleriz.",
  ],
  volumeWarning: [
    (p) => {
      const muscle = str(p.muscle);
      const sets = num(p.sets);
      if (!muscle) return null;
      const s = sets != null ? ` (${fmt(sets)} set)` : "";
      const band = p.band;
      const line =
        band === "low"
          ? `${muscle} bu hafta az çalıştı${s}.`
          : band === "injury"
            ? `${muscle} çok yüklendi${s}, dikkat!`
            : `${muscle} için hacim yüksek${s}.`;
      return line.length <= FLOO_LINE_MAX_CHARS ? line : null;
    },
    (p) => (p.band === "low" ? "Bir kas grubu bu hafta biraz geride kaldı." : null),
    (p) => (p.band === "low" ? null : "Bu hafta hacim biraz yüksek, dinlenmeyi unutma."),
    (p) => (p.band === "low" ? null : "Kaslarına biraz nefes aldıralım."),
  ],
  goalAdjustProposal: [
    (p) => {
      const text = str(p.text);
      return text && text.length <= FLOO_LINE_MAX_CHARS ? text : null;
    },
    () => "Hedefini güncellemeye ne dersin?",
    () => "Planda küçük bir ayar öneriyorum.",
  ],
  greet: [],
};

function greetLine(hour: number, rand: () => number): { text: string; mood: Mood } {
  if (hour >= 5 && hour < 11) return { text: pick(["Günaydın! Bugün ne yapıyoruz?", "Günaydın! Harika bir gün olsun."], rand), mood: "happy" };
  if (hour >= 22 || hour < 5) return { text: pick(["İyi geceler, dinlenmeyi unutma.", "Geç oldu, biraz uyku iyi gelir."], rand), mood: "sleepy" };
  return { text: pick(["Merhaba! Seni görmek güzel.", "Selam! Nasıl gidiyor?", "Tekrar hoş geldin!"], rand), mood: "happy" };
}

const MOOD: Record<FlooEventName, Mood> = {
  mealLogged: "happy",
  waterLogged: "happy",
  setCompleted: "energetic",
  workoutDone: "proud",
  measurementLogged: "happy",
  goalHit: "celebrate",
  streakUp: "celebrate",
  missedDay: "sad",
  overTarget: "worried",
  volumeWarning: "worried",
  goalAdjustProposal: "think",
  greet: "happy",
};

const PRIORITY: Record<FlooEventName, FlooLine["priority"]> = {
  mealLogged: "normal",
  waterLogged: "low",
  setCompleted: "low",
  workoutDone: "normal",
  measurementLogged: "normal",
  goalHit: "high",
  streakUp: "high",
  missedDay: "normal",
  overTarget: "high",
  volumeWarning: "normal",
  goalAdjustProposal: "high",
  greet: "normal",
};

/** ~3 s for a short line, growing with length, capped at 6 s. */
function ttlFor(text: string): number {
  return Math.round(Math.min(6000, Math.max(3000, 2000 + text.length * 60)));
}

/** Turn an event into what Floo says and how he looks while saying it. Pure; `now`/`rand` are injectable for tests. */
export function describeFlooEvent(event: FlooEvent, opts: { now?: Date; rand?: () => number } = {}): FlooLine {
  const rand = opts.rand ?? Math.random;
  const p = event.payload ?? {};
  let text: string;
  let mood = MOOD[event.name];

  if (event.name === "greet") {
    const g = greetLine((opts.now ?? new Date()).getHours(), rand);
    text = g.text;
    mood = g.mood;
  } else {
    const candidates = COPY[event.name].map((v) => v(p)).filter((t): t is string => t != null && t.length > 0 && t.length <= FLOO_LINE_MAX_CHARS);
    text = pick(candidates, rand);
    if (event.name === "volumeWarning" && p.band === "low") mood = "think";
  }

  let key: string = event.name;
  let once = false;
  if (event.name === "volumeWarning") {
    const muscle = str(p.muscle);
    if (muscle) key = `${event.name}:${muscle}`;
  } else if (event.name === "goalHit") {
    const what = str(p.what);
    if (what) key = `${event.name}:${what}`;
  } else if (event.name === "overTarget") {
    const day = str(p.dateKey);
    if (day) {
      key = overTargetKey(day);
      once = true;
    }
  }

  const warning = event.name === "overTarget" || (event.name === "volumeWarning" && p.band !== "low");
  const line: FlooLine = { key, text, mood, trigger: event.name, priority: PRIORITY[event.name], tone: warning ? "warning" : "neutral", ttlMs: ttlFor(text) };
  if (once) line.once = true;
  return line;
}

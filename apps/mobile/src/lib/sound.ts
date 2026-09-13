/**
 * The two sounds the app makes: the 3-2-1 tick before a rest ends, and the chime when it does.
 *
 * Same defensive shape as `notifications.ts` — `expo-audio` is a native module, so it is required
 * lazily inside a try/catch and every entry point degrades to a silent no-op. A gym app that
 * crashes because it could not beep is a worse app than one that stays quiet.
 *
 * Deliberately does **not** set `playsInSilentMode`. If the phone is on silent the user meant it;
 * the success haptic is the signal. It also mixes with other audio, so nobody's music stops for a
 * 300 ms chime.
 */

type CueName = "tick" | "done";

interface AudioPlayerLike {
  play: () => void;
  seekTo: (seconds: number) => Promise<void> | void;
  remove: () => void;
  volume?: number;
}

/** The slice of `expo-audio` we use — declared locally so the app still typechecks without it. */
interface AudioModule {
  createAudioPlayer: (source: unknown) => AudioPlayerLike;
  setAudioModeAsync: (mode: Record<string, unknown>) => Promise<void>;
}

type LoadState = { loaded: false } | { loaded: true; module: AudioModule | null };

let state: LoadState = { loaded: false };
let sessionConfigured = false;
let muted = false;
const players = new Map<CueName, AudioPlayerLike>();

const VOLUME: Record<CueName, number> = { tick: 0.5, done: 0.9 };

function source(cue: CueName): unknown {
  return cue === "tick"
    ? require("../../assets/sounds/rest-tick.wav")
    : require("../../assets/sounds/rest-done.wav");
}

function load(): AudioModule | null {
  if (state.loaded) return state.module;
  let mod: AudioModule | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate: the module may not be linked, and a static import would take the app down with it.
    const required = require("expo-audio") as Record<string, unknown>;
    const candidate = (required.default ?? required) as Record<string, unknown>;
    mod = typeof candidate.createAudioPlayer === "function" ? (candidate as unknown as AudioModule) : null;
  } catch {
    mod = null;
  }
  state = { loaded: true, module: mod };
  return mod;
}

function configureSession(mod: AudioModule): void {
  if (sessionConfigured) return;
  sessionConfigured = true;
  try {
    void mod.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers", shouldPlayInBackground: false })?.catch?.(() => {});
  } catch {
    /* the defaults are close enough to what we want */
  }
}

function play(cue: CueName): void {
  if (muted) return;
  const mod = load();
  if (!mod) return;
  try {
    configureSession(mod);
    let player = players.get(cue);
    if (!player) {
      player = mod.createAudioPlayer(source(cue));
      player.volume = VOLUME[cue];
      players.set(cue, player);
    } else {
      void player.seekTo(0);
    }
    player.play();
  } catch {
    /* a cue we could not play is not worth a crash */
  }
}

/** True when a cue could actually be heard on this build. */
export function isAvailable(): boolean {
  return load() !== null;
}

export function isMuted(): boolean {
  return muted;
}

/** In-memory only — the persisted choice lives with the rest prefs and is applied on session start. */
export function setMuted(next: boolean): void {
  muted = next;
}

/** Short blip, played on each of the last three seconds. */
export function playRestTick(): void {
  play("tick");
}

/** Rising fifth, played the moment the rest is over. */
export function playRestFinished(): void {
  play("done");
}

/** Hand the audio session back when the workout ends. */
export function releaseRestSounds(): void {
  for (const player of players.values()) {
    try {
      player.remove();
    } catch {
      /* already gone */
    }
  }
  players.clear();
}

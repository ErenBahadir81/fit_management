import { MIN_PRESET_SECONDS } from "../../../src/features/training/workout/restEngine";
import {
  REST_PREFS_KEY,
  clearRestPrefs,
  isRestSoundMuted,
  readRestPreset,
  setRestSoundMuted,
  writeRestPreset,
} from "../../../src/features/training/workout/restPrefs";
import { storage } from "../../../src/lib/storage";

beforeEach(() => clearRestPrefs());

describe("per-exercise rest presets", () => {
  test("an exercise nobody has set a preset for has no memory", () => {
    expect(readRestPreset("Bench Press")).toBeNull();
  });

  test("remembers what was set for that exercise", () => {
    writeRestPreset("Bench Press", 180);
    expect(readRestPreset("Bench Press")).toBe(180);
  });

  test("keeps exercises apart", () => {
    writeRestPreset("Bench Press", 180);
    writeRestPreset("Lateral Raise", 45);
    expect(readRestPreset("Bench Press")).toBe(180);
    expect(readRestPreset("Lateral Raise")).toBe(45);
  });

  test("matches the exercise no matter how it was cased or spaced", () => {
    writeRestPreset("  Bench Press  ", 120);
    expect(readRestPreset("bench press")).toBe(120);
    expect(readRestPreset("BENCH PRESS")).toBe(120);
  });

  test("folds Turkish casing the Turkish way", () => {
    writeRestPreset("Şınav Itme", 90);
    expect(readRestPreset("şınav ıtme")).toBe(90);
  });

  test("clamps what it stores into the range the UI can express", () => {
    writeRestPreset("Bench Press", 1);
    expect(readRestPreset("Bench Press")).toBe(MIN_PRESET_SECONDS);
  });

  test("an exercise with no name is never remembered", () => {
    writeRestPreset("", 90);
    writeRestPreset("   ", 90);
    expect(readRestPreset("")).toBeNull();
    expect(readRestPreset("   ")).toBeNull();
  });

  test("survives a corrupt store instead of throwing", () => {
    storage.set(REST_PREFS_KEY, "{ not json");
    expect(readRestPreset("Bench Press")).toBeNull();
    expect(isRestSoundMuted()).toBe(false);
    writeRestPreset("Bench Press", 60);
    expect(readRestPreset("Bench Press")).toBe(60);
  });

  test("ignores a stored value that is not a usable duration", () => {
    storage.set(REST_PREFS_KEY, JSON.stringify({ presets: { "bench press": "uzun" }, muted: false }));
    expect(readRestPreset("Bench Press")).toBeNull();
  });
});

describe("rest sound mute", () => {
  test("sound is on until the user turns it off", () => {
    expect(isRestSoundMuted()).toBe(false);
  });

  test("the choice persists", () => {
    setRestSoundMuted(true);
    expect(isRestSoundMuted()).toBe(true);
    setRestSoundMuted(false);
    expect(isRestSoundMuted()).toBe(false);
  });

  test("muting does not forget the presets", () => {
    writeRestPreset("Bench Press", 150);
    setRestSoundMuted(true);
    expect(readRestPreset("Bench Press")).toBe(150);
    expect(isRestSoundMuted()).toBe(true);
  });
});

describe("clearRestPrefs", () => {
  test("wipes presets and the mute choice", () => {
    writeRestPreset("Bench Press", 150);
    setRestSoundMuted(true);
    clearRestPrefs();
    expect(readRestPreset("Bench Press")).toBeNull();
    expect(isRestSoundMuted()).toBe(false);
  });
});

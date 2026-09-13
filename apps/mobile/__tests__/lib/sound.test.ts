type Lib = typeof import("../../src/lib/sound");

interface PlayerMock {
  play: jest.Mock;
  seekTo: jest.Mock;
  remove: jest.Mock;
  volume: number;
}

interface AudioMock {
  createAudioPlayer: jest.Mock;
  setAudioModeAsync: jest.Mock;
  players: PlayerMock[];
}

function audioMock(overrides: Partial<Omit<AudioMock, "players">> = {}): AudioMock {
  const players: PlayerMock[] = [];
  return {
    players,
    createAudioPlayer: jest.fn(() => {
      const player: PlayerMock = { play: jest.fn(), seekTo: jest.fn(async () => undefined), remove: jest.fn(), volume: 1 };
      players.push(player);
      return player;
    }),
    setAudioModeAsync: jest.fn(async () => undefined),
    ...overrides,
  };
}

/** Fresh copy of the wrapper for every test — it memoises the module, the players and the mute flag. */
function load(audio: AudioMock | null): Lib {
  let lib!: Lib;
  jest.isolateModules(() => {
    jest.doMock(
      "expo-audio",
      () => {
        if (!audio) throw new Error("Cannot find module 'expo-audio'");
        return audio;
      },
      { virtual: true }
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy per test is the point.
    lib = require("../../src/lib/sound") as Lib;
  });
  return lib;
}

afterEach(() => jest.resetModules());

describe("with expo-audio installed", () => {
  test("reports itself available", () => {
    expect(load(audioMock()).isAvailable()).toBe(true);
  });

  test("loads nothing until the first cue actually plays", () => {
    const audio = audioMock();
    load(audio);
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
    expect(audio.setAudioModeAsync).not.toHaveBeenCalled();
  });

  test("plays the completion chime", () => {
    const audio = audioMock();
    load(audio).playRestFinished();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audio.players[0].play).toHaveBeenCalledTimes(1);
  });

  test("plays the countdown tick", () => {
    const audio = audioMock();
    load(audio).playRestTick();
    expect(audio.players[0].play).toHaveBeenCalledTimes(1);
  });

  test("reuses each player and rewinds it instead of leaking a new one per set", () => {
    const audio = audioMock();
    const lib = load(audio);
    lib.playRestTick();
    lib.playRestTick();
    lib.playRestTick();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audio.players[0].seekTo).toHaveBeenCalledWith(0);
    expect(audio.players[0].play).toHaveBeenCalledTimes(3);
  });

  test("keeps the tick and the chime as separate players", () => {
    const audio = audioMock();
    const lib = load(audio);
    lib.playRestTick();
    lib.playRestFinished();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(2);
  });

  test("honours the iOS silent switch and does not interrupt the user's music", () => {
    const audio = audioMock();
    load(audio).playRestFinished();
    expect(audio.setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(audio.setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: false, interruptionMode: "mixWithOthers" }));
  });

  test("configures the audio session once, not on every cue", () => {
    const audio = audioMock();
    const lib = load(audio);
    lib.playRestTick();
    lib.playRestFinished();
    lib.playRestFinished();
    expect(audio.setAudioModeAsync).toHaveBeenCalledTimes(1);
  });

  test("stays quiet while muted", () => {
    const audio = audioMock();
    const lib = load(audio);
    lib.setMuted(true);
    expect(lib.isMuted()).toBe(true);
    lib.playRestTick();
    lib.playRestFinished();
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
  });

  test("comes back when unmuted", () => {
    const audio = audioMock();
    const lib = load(audio);
    lib.setMuted(true);
    lib.playRestFinished();
    lib.setMuted(false);
    lib.playRestFinished();
    expect(audio.players[0].play).toHaveBeenCalledTimes(1);
  });

  test("sound is on until someone turns it off", () => {
    expect(load(audioMock()).isMuted()).toBe(false);
  });

  test("releases the players so a finished workout holds no audio session", () => {
    const audio = audioMock();
    const lib = load(audio);
    lib.playRestTick();
    lib.playRestFinished();
    lib.releaseRestSounds();
    expect(audio.players[0].remove).toHaveBeenCalledTimes(1);
    expect(audio.players[1].remove).toHaveBeenCalledTimes(1);

    lib.playRestTick();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(3);
  });

  test("a native call that blows up never reaches the caller", () => {
    const audio = audioMock({ createAudioPlayer: jest.fn(() => { throw new Error("no audio session"); }) });
    const lib = load(audio);
    expect(() => lib.playRestFinished()).not.toThrow();
    expect(() => lib.releaseRestSounds()).not.toThrow();
  });
});

describe("without expo-audio installed", () => {
  test("degrades to a no-op instead of crashing the app", () => {
    const lib = load(null);
    expect(lib.isAvailable()).toBe(false);
    expect(() => lib.playRestTick()).not.toThrow();
    expect(() => lib.playRestFinished()).not.toThrow();
    expect(() => lib.releaseRestSounds()).not.toThrow();
    lib.setMuted(true);
    expect(lib.isMuted()).toBe(true);
  });
});

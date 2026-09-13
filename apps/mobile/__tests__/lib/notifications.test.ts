type Lib = typeof import("../../src/lib/notifications");

interface NativeMock {
  setNotificationHandler: jest.Mock;
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  SchedulableTriggerInputTypes: { TIME_INTERVAL: string };
}

function nativeMock(overrides: Partial<NativeMock> = {}): NativeMock {
  return {
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => ({ status: "undetermined", granted: false, canAskAgain: true })),
    requestPermissionsAsync: jest.fn(async () => ({ status: "granted", granted: true, canAskAgain: true })),
    scheduleNotificationAsync: jest.fn(async () => "notif-1"),
    cancelScheduledNotificationAsync: jest.fn(async () => undefined),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
    ...overrides,
  };
}

/** Fresh copy of the wrapper for every test — it memoises the module and the permission answer. */
function load(native: NativeMock | null): Lib {
  let lib!: Lib;
  jest.isolateModules(() => {
    jest.doMock(
      "expo-notifications",
      () => {
        if (!native) throw new Error("Cannot find module 'expo-notifications'");
        return native;
      },
      { virtual: true }
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy per test is the point.
    lib = require("../../src/lib/notifications") as Lib;
  });
  return lib;
}

afterEach(() => jest.resetModules());

describe("with expo-notifications installed", () => {
  test("reports itself available", () => {
    expect(load(nativeMock()).isAvailable()).toBe(true);
  });

  test("presents the alert even when the app is in the foreground", async () => {
    const native = nativeMock();
    await load(native).scheduleRestFinished(60);
    expect(native.setNotificationHandler).toHaveBeenCalledTimes(1);
    const handler = native.setNotificationHandler.mock.calls[0][0] as { handleNotification: () => Promise<Record<string, boolean>> };
    await expect(handler.handleNotification()).resolves.toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
  });

  test("does not touch the OS until something actually needs a notification", () => {
    const native = nativeMock();
    load(native);
    expect(native.setNotificationHandler).not.toHaveBeenCalled();
    expect(native.getPermissionsAsync).not.toHaveBeenCalled();
  });

  test("asks for permission the first time and schedules the rest cue in Turkish", async () => {
    const native = nativeMock();
    const id = await load(native).scheduleRestFinished(90);

    expect(native.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(id).toBe("notif-1");
    const [request] = native.scheduleNotificationAsync.mock.calls[0] as [{ content: { title: string; body: string }; trigger: { type: string; seconds: number } }];
    expect(request.content.title).toBe("Dinlenme bitti");
    expect(request.content.body).toBe("Sıradaki sete hazırsın.");
    expect(request.trigger).toMatchObject({ type: "timeInterval", seconds: 90 });
  });

  test("skips the permission prompt when it is already granted", async () => {
    const native = nativeMock({ getPermissionsAsync: jest.fn(async () => ({ status: "granted", granted: true, canAskAgain: false })) });
    await load(native).scheduleRestFinished(60);
    expect(native.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(native.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  test("only ever asks once, however many rests follow", async () => {
    const native = nativeMock();
    const lib = load(native);
    await lib.scheduleRestFinished(60);
    await lib.scheduleRestFinished(60);
    await lib.scheduleRestFinished(60);
    expect(native.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  test("schedules nothing when the user says no", async () => {
    const native = nativeMock({ requestPermissionsAsync: jest.fn(async () => ({ status: "denied", granted: false, canAskAgain: false })) });
    await expect(load(native).scheduleRestFinished(60)).resolves.toBeNull();
    expect(native.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("never leaves a stale cue behind: a new rest cancels the previous one", async () => {
    const native = nativeMock();
    native.scheduleNotificationAsync.mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const lib = load(native);
    await lib.scheduleRestFinished(60);
    await lib.scheduleRestFinished(45);
    expect(native.cancelScheduledNotificationAsync).toHaveBeenCalledWith("first");
  });

  test("cancel drops the pending cue and is a no-op afterwards", async () => {
    const native = nativeMock();
    const lib = load(native);
    await lib.scheduleRestFinished(60);
    await lib.cancelRestFinished();
    expect(native.cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-1");

    native.cancelScheduledNotificationAsync.mockClear();
    await lib.cancelRestFinished();
    expect(native.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  test("rounds a fractional delay up so the cue never lands early", async () => {
    const native = nativeMock();
    await load(native).scheduleRestFinished(14.2);
    expect(native.scheduleNotificationAsync.mock.calls[0][0].trigger.seconds).toBe(15);
  });

  test("a rest with no time left schedules nothing", async () => {
    const native = nativeMock();
    await expect(load(native).scheduleRestFinished(0)).resolves.toBeNull();
    expect(native.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("a native call that blows up never reaches the caller", async () => {
    const native = nativeMock({ scheduleNotificationAsync: jest.fn(async () => { throw new Error("no permission"); }) });
    const lib = load(native);
    await expect(lib.scheduleRestFinished(60)).resolves.toBeNull();
    await expect(lib.cancelRestFinished()).resolves.toBeUndefined();
  });
});

describe("without expo-notifications installed", () => {
  test("degrades to a no-op instead of crashing the app", async () => {
    const lib = load(null);
    expect(lib.isAvailable()).toBe(false);
    await expect(lib.requestPermission()).resolves.toBe(false);
    await expect(lib.scheduleRestFinished(60)).resolves.toBeNull();
    await expect(lib.cancelRestFinished()).resolves.toBeUndefined();
  });
});

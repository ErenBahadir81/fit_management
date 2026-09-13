/**
 * Local notifications — currently only the "your rest is over" cue.
 *
 * `expo-notifications` is a native module and is not guaranteed to be linked (Expo Go, a stale dev
 * client, a web build). Everything here goes through a lazy `require` in a try/catch and degrades
 * to a silent no-op, so a missing module costs the user a notification, never the app.
 *
 * Nothing touches the OS until the first rest actually starts: no handler, no permission prompt on
 * launch. Asking for notifications the second someone opens a fitness app is how you get denied.
 */

const REST_TITLE = "Dinlenme bitti";
const REST_BODY = "Sıradaki sete hazırsın.";

interface PermissionResult {
  granted?: boolean;
  status?: string;
}

/** The slice of `expo-notifications` we use — declared locally so the app still typechecks without it. */
interface NotificationsModule {
  setNotificationHandler: (handler: unknown) => void;
  getPermissionsAsync: () => Promise<PermissionResult>;
  requestPermissionsAsync: () => Promise<PermissionResult>;
  scheduleNotificationAsync: (request: unknown) => Promise<string>;
  cancelScheduledNotificationAsync: (id: string) => Promise<void>;
  SchedulableTriggerInputTypes?: { TIME_INTERVAL?: string };
}

type LoadState = { loaded: false } | { loaded: true; module: NotificationsModule | null };

let state: LoadState = { loaded: false };
let handlerSet = false;
let permission: Promise<boolean> | null = null;
let pendingRestId: string | null = null;

function hasFn(value: Record<string, unknown>, name: string): boolean {
  return typeof value[name] === "function";
}

function load(): NotificationsModule | null {
  if (state.loaded) return state.module;
  let mod: NotificationsModule | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate: the module may not be linked, and a static import would take the app down with it.
    const required = require("expo-notifications") as Record<string, unknown>;
    const candidate = (required.default ?? required) as Record<string, unknown>;
    const usable =
      hasFn(candidate, "scheduleNotificationAsync") &&
      hasFn(candidate, "cancelScheduledNotificationAsync") &&
      hasFn(candidate, "requestPermissionsAsync");
    mod = usable ? (candidate as unknown as NotificationsModule) : null;
  } catch {
    mod = null;
  }
  state = { loaded: true, module: mod };
  return mod;
}

/**
 * Present the cue even when the app is open: the phone is in a pocket between sets and the user is
 * as likely to be looking at the lock screen as at the workout.
 */
function ensureHandler(mod: NotificationsModule): void {
  if (handlerSet) return;
  handlerSet = true;
  try {
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        // Pre-SDK-53 key, harmless on newer runtimes.
        shouldShowAlert: true,
      }),
    });
  } catch {
    /* a handler we could not install is not worth a crash */
  }
}

/** True when a notification could actually be delivered on this build. */
export function isAvailable(): boolean {
  return load() !== null;
}

/** Asks once per app run, the first time a rest needs a cue. Resolves to the answer, never throws. */
export function requestPermission(): Promise<boolean> {
  if (permission) return permission;
  permission = (async () => {
    const mod = load();
    if (!mod) return false;
    ensureHandler(mod);
    try {
      const current = await mod.getPermissionsAsync();
      if (current.granted === true || current.status === "granted") return true;
      const asked = await mod.requestPermissionsAsync();
      return asked.granted === true || asked.status === "granted";
    } catch {
      return false;
    }
  })();
  return permission;
}

/**
 * Fire "{REST_TITLE}" in `seconds`. Replaces any cue already pending — there is only ever one rest.
 * Returns the scheduled id, or `null` when nothing was scheduled.
 */
export async function scheduleRestFinished(seconds: number): Promise<string | null> {
  const mod = load();
  if (!mod) return null;
  const delay = Math.ceil(seconds);
  if (!Number.isFinite(delay) || delay <= 0) return null;

  await cancelRestFinished();
  if (!(await requestPermission())) return null;

  try {
    const id = await mod.scheduleNotificationAsync({
      content: { title: REST_TITLE, body: REST_BODY, sound: true, interruptionLevel: "timeSensitive" },
      trigger: { type: mod.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? "timeInterval", seconds: delay, repeats: false },
    });
    pendingRestId = id;
    return id;
  } catch {
    return null;
  }
}

/** Drop the pending cue. A notification that lands after the user moved on is worse than none. */
export async function cancelRestFinished(): Promise<void> {
  const id = pendingRestId;
  if (id === null) return;
  pendingRestId = null;
  const mod = load();
  if (!mod) return;
  try {
    await mod.cancelScheduledNotificationAsync(id);
  } catch {
    /* the cue is gone or was never there */
  }
}

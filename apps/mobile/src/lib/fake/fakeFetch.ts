/**
 * In-memory implementation of docs/plan/02-api-contract.md as a `fetch` replacement.
 * It sits *under* the real `createApiClient`, so auth headers, refresh, error mapping and every
 * typed method behave exactly like production. Add routes here when a feature needs them.
 */
import type { FetchLike } from "@fitfloow/api-client";
import {
  DEFAULT_MASCOT_MESSAGES,
  findTemplate,
  pickVariant,
  renderTemplate,
  searchKey,
  trDateKey,
  weekKeyFor,
  shiftKey,
  round,
  type BodyEntryDTO,
  type GoalDTO,
  type GoalInput,
  type OnboardingTraining,
  type MascotKey,
  type MascotMessage,
  type MealEntryDTO,
  type UserDTO,
  type Weekday,
  type WeighInDTO,
  type WorkoutLogDTO,
  type DietTargetDTO,
  currentIndexFor,
  dayOfLog,
  isBreakLog,
  isValidIndex,
  jumpTransition,
  logDayTransition,
  normalizeProgramInput,
  exerciseNameKey,
  starterProgram,
  trainingLevelForExperience,
  pointerOf,
  programMode,
  reconcilePointer,
  undoTransition,
  type DayDTO,
  type DayInputLike,
  type LogPointerLike,
  type PointerState,
} from "@fitfloow/core";
import * as fx from "./fixtures";
import * as domain from "./domain";

export const FAKE_BASE_URL = "http://fake.local/api/v1";
export const FAKE_CREDENTIALS = { username: "eren", password: "eren123" } as const;

type Json = Record<string, unknown> | unknown[] | null;
interface Ctx {
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  user: UserDTO | null;
}
type Result = { status: number; body?: unknown };
type Handler = (ctx: Ctx) => Result | unknown;

const ok = (body: unknown): Result => ({ status: 200, body });
const noContent = (): Result => ({ status: 204 });
const err = (status: number, code: string, message: string): Result => ({ status, body: { error: { code, message } } });

export interface FakeState {
  user: UserDTO;
  password: string;
  program: ReturnType<typeof fx.makeProgram>;
  logs: WorkoutLogDTO[];
  weighIns: WeighInDTO[];
  bodyEntries: BodyEntryDTO[];
  goal: GoalDTO | null;
  mealEntries: MealEntryDTO[];
  target: DietTargetDTO;
  foods: typeof fx.FOODS;
  /** Session tokens accepted by the fake (rotates on refresh). */
  sessions: Set<string>;
  /** Per-log pointer history (`pointerBeforeId`…), which the API stores on the log but never sends. */
  pointerMeta: Record<string, LogPointerLike>;
  /** T8 — registered in this session and not yet onboarded: the one account a starter program may replace. */
  freshAccount?: boolean;
}

export function createFakeState(today = trDateKey()): FakeState {
  const weighIns = fx.makeWeighIns(today);
  const bodyEntries = fx.makeBodyEntries(today, weighIns);
  const user = fx.makeUser();
  return {
    user,
    password: FAKE_CREDENTIALS.password,
    program: fx.makeProgram(today),
    logs: fx.makeHistory(today),
    weighIns,
    bodyEntries,
    goal: domain.goalFor(today, user, bodyEntries),
    mealEntries: fx.makeMealEntries(today),
    target: { ...fx.DEFAULT_TARGET },
    foods: [...fx.FOODS],
    sessions: new Set(),
    pointerMeta: {},
  };
}

function parseQuery(qs: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!qs) return out;
  for (const part of qs.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = decodeURIComponent(i === -1 ? part : part.slice(0, i));
    const v = i === -1 ? "" : decodeURIComponent(part.slice(i + 1).replace(/\+/g, " "));
    out[k] = v;
  }
  return out;
}

function makeResponse(r: Result): Response {
  const text = r.body === undefined ? "" : JSON.stringify(r.body);
  if (typeof Response !== "undefined") {
    return new Response(text || null, { status: r.status, headers: { "content-type": "application/json" } });
  }
  // Minimal shim for exotic runtimes (the transport only uses status/ok/text/json).
  return { status: r.status, ok: r.status >= 200 && r.status < 300, text: async () => text, json: async () => (text ? JSON.parse(text) : null) } as unknown as Response;
}

export interface FakeFetchOptions {
  state?: FakeState;
  latencyMs?: number;
  today?: () => string;
}

export function createFakeFetch(opts: FakeFetchOptions = {}): FetchLike & { state: FakeState } {
  const today = opts.today ?? (() => trDateKey());
  // Fixtures are built for the same "today" the routes answer with, so an injected clock is coherent.
  const state = opts.state ?? createFakeState(today());
  state.pointerMeta ??= {};
  const latency = opts.latencyMs ?? 350;
  let tokenSeq = 1;

  const issueTokens = () => {
    const access = `fake.access.${state.user.username}.${tokenSeq++}`;
    const refresh = `fake.refresh.${state.user.username}.${tokenSeq++}`;
    state.sessions.add(access);
    state.sessions.add(refresh);
    return { accessToken: access, refreshToken: refresh };
  };

  const mascotFor = (key: MascotKey, vars: Record<string, string | number | null | undefined> = {}): MascotMessage => {
    const t = findTemplate(key, DEFAULT_MASCOT_MESSAGES) ?? DEFAULT_MASCOT_MESSAGES[0];
    return { key: t.key, mood: t.mood, text: renderTemplate(pickVariant(t.variants, `${state.user.id}${today()}${key}`), { name: state.user.displayName, ...vars }) };
  };

  const md = () => state.user.measurementDay as Weekday;
  const programView = () => fx.makeProgramView(today(), state.program, state.logs, md());

  /* --- training: the same core transitions the API runs (program.routes.ts) --- */
  const nowIso = () => new Date().toISOString();
  const todayLog = () => state.logs.find((l) => l.dateKey === today()) ?? null;
  const setPointer = (p: PointerState, touch = true) => {
    state.program = {
      ...state.program,
      currentDayId: p.currentDayId,
      currentIndex: p.currentIndex,
      cycleNumber: p.cycleNumber,
      weekNumber: p.cycleNumber,
      lastActionAt: touch ? nowIso() : state.program.lastActionAt,
    };
  };
  /** A log plus the pointer history the API keeps on it (not part of the DTO). */
  const pointerLog = (log: WorkoutLogDTO): LogPointerLike => ({ isBreak: log.isBreak, isOffDay: log.isOffDay, ...(state.pointerMeta[log.id] ?? {}) });
  /** The day `complete` means: today's done day when re-completing (B3), else the planned one. */
  const plannedDayFor = (existing: WorkoutLogDTO | null): DayDTO => {
    const days = state.program.days;
    if (existing && !isBreakLog(existing)) {
      const done = dayOfLog(days, existing);
      if (done) return done;
    }
    return days[currentIndexFor(state.program, today(), false)];
  };
  const cardioFrom = (raw: unknown, target: DayDTO["run"]): WorkoutLogDTO["run"] => {
    const segs = (raw as { segments?: { km: number; min: number }[] } | null)?.segments;
    if (!Array.isArray(segs) || segs.length === 0) return null;
    const totalKm = round(segs.reduce((a, x) => a + Number(x.km || 0), 0), 2);
    const totalMin = round(segs.reduce((a, x) => a + Number(x.min || 0), 0), 1);
    return { segments: segs, totalKm, totalMin, targetKm: target?.targetKm ?? 0, targetMin: target?.targetMin ?? 0 };
  };
  const fillLog = (log: WorkoutLogDTO, day: DayDTO, body: Record<string, unknown>): WorkoutLogDTO => {
    const next = { ...log };
    if (Array.isArray(body.strength) && body.strength.length) next.strength = body.strength as WorkoutLogDTO["strength"];
    if (body.run !== undefined && body.run !== null) next.run = cardioFrom(body.run, day.run);
    if (body.swim !== undefined && body.swim !== null) next.swim = cardioFrom(body.swim, day.swim);
    if (body.durationMin != null) next.durationMin = Number(body.durationMin);
    if (body.notes != null) next.notes = String(body.notes);
    if (body.rpe != null) next.rpe = Number(body.rpe);
    return next;
  };
  /**
   * "Today I did `dayId`" — mirrors the API's `logDay`: re-logging today's day edits it in place
   * (the pointer never moves twice, B3); replacing today's log first takes its pointer move back.
   */
  const logDay = (body: Record<string, unknown>): Result => {
    const days = state.program.days;
    if (days.length === 0) return err(409, "CONFLICT", "Program boş, önce günleri ekle");
    const dayId = String(body.dayId ?? "");
    const day = days.find((d) => d.id === dayId);
    if (!day) return err(400, "VALIDATION", "Bu gün programda yok");
    const existing = todayLog();

    if (existing && !isBreakLog(existing) && existing.dayId === dayId) {
      const edited = fillLog(existing, day, body);
      state.logs = state.logs.map((l) => (l.id === existing.id ? edited : l));
      return ok({ log: edited, program: state.program });
    }

    const base = existing ? undoTransition(state.program, pointerLog(existing)) : pointerOf(state.program);
    const t = logDayTransition({ mode: state.program.mode, days, currentDayId: base.currentDayId, cycleNumber: base.cycleNumber }, dayId, {
      resumePlanned: body.resumePlanned === true,
    });
    if (!t) return err(400, "VALIDATION", "Bu gün programda yok");
    const log = fillLog({ ...fx.makeLog(day, today(), t.before.cycleNumber), date: nowIso() }, day, body);
    if (existing) {
      state.logs = state.logs.filter((l) => l.id !== existing.id);
      delete state.pointerMeta[existing.id];
    }
    state.logs.unshift(log);
    state.pointerMeta[log.id] = { pointerBeforeId: t.before.currentDayId, pointerAfterId: t.after.currentDayId, cycleBefore: t.before.cycleNumber };
    setPointer(programMode(state.program) === "weekly" ? { ...t.after, cycleNumber: state.program.cycleNumber } : t.after);
    return ok({ log, program: state.program });
  };
  const recovery = () => fx.makeRecovery(today(), state.logs, md());
  const trends = (days: number) => fx.makeTrends(state.weighIns, state.bodyEntries, days, today());
  const progress = () => (state.goal && state.goal.status === "active" ? domain.progressFor(today(), state.goal, state.weighIns, state.bodyEntries, state.mealEntries) : null);
  const dayView = (key: string) => fx.makeDayView(key, state.mealEntries, state.target);
  const homeMascot = (): MascotMessage => {
    const pv = programView();
    const dv = dayView(today());
    if (pv.todayLog && !pv.todayLog.isOffDay) return mascotFor("home.workoutDone", { sessions: 3 });
    if (pv.current.day.kind === "rest") return mascotFor("home.restDay");
    if (dv.remaining.kcal < 0) return mascotFor("home.caloriesOver", { kcal: Math.abs(dv.remaining.kcal) });
    return mascotFor("home.workoutDue", { day: pv.current.day.title });
  };
  // Reports run the real core builder (highlights, score, Floo's line) over the fake state.
  const report = (weekKey: string) =>
    domain.reportFor({
      today: today(),
      weekKey,
      measurementDay: md(),
      user: state.user,
      goal: state.goal,
      weighIns: state.weighIns,
      bodyEntries: state.bodyEntries,
      logs: state.logs,
      meals: state.mealEntries,
      program: state.program,
    });
  const bodyEntryFrom = (b: Record<string, unknown>, id?: string): BodyEntryDTO => {
    const dateKey = typeof b.date === "string" ? trDateKey(new Date(b.date)) : today();
    const e = fx.makeBodyEntry({
      dateKey,
      heightCm: Number(b.heightCm ?? state.user.heightCm ?? 175),
      neckCm: Number(b.neckCm),
      waistCm: Number(b.waistCm),
      hipCm: b.hipCm == null ? null : Number(b.hipCm),
      weightKg: Number(b.weightKg),
      gender: (b.gender as "male" | "female") ?? state.user.gender,
      notes: (b.notes as string | null) ?? null,
    });
    return id ? { ...e, id } : e;
  };
  const upsertWeighIn = (weightKg: number, dateKey: string, source: WeighInDTO["source"] = "manual") => {
    const i = state.weighIns.findIndex((w) => w.dateKey === dateKey);
    const wi: WeighInDTO = { id: i === -1 ? fx.nextId("wi") : state.weighIns[i].id, dateKey, weightKg: round(weightKg, 1), source, createdAt: new Date().toISOString() };
    if (i === -1) {
      state.weighIns.push(wi);
      state.weighIns.sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
    } else state.weighIns[i] = wi;
    return wi;
  };

  /* ------------------------------ routes ------------------------------ */
  const routes: { method: string; pattern: string[]; auth: boolean; handler: Handler }[] = [];
  const on = (method: string, path: string, handler: Handler, auth = true) => routes.push({ method, pattern: path.split("/").filter(Boolean), auth, handler });

  // auth
  on(
    "POST",
    "/auth/login",
    ({ body }) => {
      const u = String(body.username ?? "").toLowerCase();
      if (u !== state.user.username || body.password !== state.password) return err(401, "AUTH_INVALID", "Kullanıcı adı veya şifre hatalı");
      return ok({ ...issueTokens(), user: state.user });
    },
    false
  );
  /**
   * C3 — sign-up. A brand-new account starts genuinely empty (no history, no goal, onboarding
   * not done) so the demo can walk the whole first-run flow, not just the furnished one.
   */
  on(
    "POST",
    "/auth/register",
    ({ body }) => {
      const username = String(body.username ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const displayName = String(body.displayName ?? "").trim();
      if (username.length < 3 || !displayName) return err(400, "VALIDATION", "Kullanıcı adı ve görünen ad gerekli");
      if (password.length < 8) return err(400, "VALIDATION", "Şifre en az 8 karakter olmalı");
      if (username === state.user.username) return err(409, "CONFLICT", "Bu kullanıcı adı alınmış");

      state.user = {
        ...fx.makeUser(),
        id: fx.nextId("u"),
        username,
        displayName,
        email: body.email ? String(body.email).trim().toLowerCase() : null,
        heightCm: null,
        birthDate: null,
        onboardingCompleted: false,
        createdAt: new Date().toISOString(),
      };
      state.password = password;
      state.logs = [];
      state.bodyEntries = [];
      state.weighIns = [];
      state.mealEntries = [];
      state.goal = null;
      state.freshAccount = true;
      return ok({ ...issueTokens(), user: state.user });
    },
    false
  );
  on(
    "POST",
    "/auth/refresh",
    ({ body }) => {
      const rt = String(body.refreshToken ?? "");
      if (!state.sessions.has(rt)) return err(401, "AUTH_INVALID", "Oturum süresi doldu");
      state.sessions.delete(rt);
      return ok(issueTokens());
    },
    false
  );
  on("POST", "/auth/logout", () => {
    state.sessions.clear();
    return noContent();
  }, false);
  on("GET", "/auth/me", ({ user }) => ok({ user }));
  on("PATCH", "/me", ({ body }) => {
    state.user = { ...state.user, ...(body as Partial<UserDTO>) };
    return ok({ user: state.user });
  });
  on("PATCH", "/me/password", ({ body }) => {
    if (body.currentPassword !== state.password) return err(400, "VALIDATION", "Mevcut şifre hatalı");
    state.password = String(body.newPassword);
    return noContent();
  });
  // C3 — "yaklaşık kalori ihtiyacın", the same maths the API runs.
  on("GET", "/me/energy", () => ok(domain.energyFor(today(), state.user, state.bodyEntries.at(-1) ?? null, state.goal)));

  /** C3 — the one-time questionnaire. Idempotent, exactly like the real route. */
  on("POST", "/onboarding", ({ body }) => {
    const profile = body.profile as Partial<UserDTO> & { heightCm?: number; gender?: "male" | "female" };
    const measurement = body.measurement as { weightKg?: number; neckCm?: number; waistCm?: number; hipCm?: number | null };
    if (!profile || !measurement) return err(400, "VALIDATION", "Profil ve ölçüm bilgisi gerekli");
    const gender = profile.gender ?? state.user.gender;
    if (gender === "female" && measurement.hipCm == null) return err(400, "VALIDATION", "Kadınlar için kalça ölçüsü gerekli");

    state.user = { ...state.user, ...profile, onboardingCompleted: true };
    const entry = bodyEntryFrom({ ...measurement, gender, heightCm: profile.heightCm ?? state.user.heightCm ?? 175 });
    state.bodyEntries = [...state.bodyEntries.filter((e) => e.dateKey !== entry.dateKey), entry].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
    upsertWeighIn(entry.weightKg, entry.dateKey, "bodyEntry");

    const wanted = body.goal as GoalInput | null | undefined;
    if (wanted && state.goal?.status !== "active") {
      state.goal = domain.goalFromInput(today(), state.user, entry, wanted);
    }
    // T8 — a freshly registered demo account gets the starter program, like the API.
    const training = body.training as OnboardingTraining | null | undefined;
    if (training && state.freshAccount) {
      const starter = starterProgram({ daysPerWeek: training.daysPerWeek, level: trainingLevelForExperience(training.experience) });
      const known = new Set(fx.EXERCISES.map((e) => exerciseNameKey(e.name)));
      // The demo catalog is small: an exercise it lacks keeps its name with no muscle load.
      const input = starter.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => (known.has(exerciseNameKey(e.name)) ? e : { ...e, muscles: [] })) }));
      const { days } = normalizeProgramInput(input, fx.EXERCISES, { mode: "cycle" });
      const now = nowIso();
      state.program = { ...state.program, id: fx.nextId("p"), name: starter.name, mode: "cycle", days, currentDayId: days[0].id, currentIndex: 0, cycleNumber: 1, weekNumber: 1, startedAt: now, lastActionAt: now, sourceTemplateId: null };
      state.freshAccount = false;
    }
    return ok({ user: state.user, bodyEntry: entry, goal: wanted ? state.goal : null, program: state.program });
  });

  // catalog
  on("GET", "/muscles", () => ok({ muscles: fx.MUSCLES }));
  on("GET", "/exercises", ({ query }) => {
    const q = searchKey(query.q ?? "");
    return ok({ exercises: q ? fx.EXERCISES.filter((e) => searchKey(e.name).includes(q)) : fx.EXERCISES });
  });

  // training
  on("GET", "/program", () => ok(programView()));
  on("PUT", "/program", ({ body }) => {
    const mode = body.mode === "weekly" || body.mode === "cycle" ? body.mode : programMode(state.program);
    const input = Array.isArray(body.days) ? (body.days as DayInputLike[]) : state.program.days;
    // Days keep the ids they were sent with, so the pointer stays on the same day (B5).
    const { days, errors } = normalizeProgramInput(input, fx.EXERCISES, { mode, existingIds: state.program.days.map((d) => d.id) });
    if (errors.length > 0) return err(400, "VALIDATION", errors[0]);
    const pointer = reconcilePointer(state.program, days);
    state.program = { ...state.program, name: (body.name as string) ?? state.program.name, mode, days };
    setPointer(pointer);
    return ok({ program: state.program });
  });
  on("POST", "/program/jump", ({ body }) => {
    const days = state.program.days;
    let dayId: string | null = typeof body.dayId === "string" ? body.dayId : null;
    if (dayId === null) {
      const index = Number(body.index);
      if (!isValidIndex(index, days.length)) return err(400, "VALIDATION", `Gün 0..${days.length - 1} arasında olmalı`);
      dayId = days[index].id;
    }
    const next = jumpTransition(state.program, dayId);
    if (!next) return err(400, "VALIDATION", "Bu gün programda yok");
    setPointer(next);
    return ok({ program: state.program });
  });
  on("POST", "/program/log-day", ({ body }) => logDay(body));
  on("POST", "/program/complete", ({ body }) => {
    if (state.program.days.length === 0) return err(409, "CONFLICT", "Program boş, önce günleri ekle");
    const day = plannedDayFor(todayLog());
    return logDay({ ...body, dayId: day.id, resumePlanned: false });
  });
  on("POST", "/program/skip", ({ body }) => {
    const reason = typeof body.reason === "string" ? body.reason : null;
    const days = state.program.days;
    if (days.length === 0) return err(409, "CONFLICT", "Program boş, önce günleri ekle");
    const existing = todayLog();
    if (existing) {
      if (!isBreakLog(existing) && existing.kind !== "rest") return err(409, "CONFLICT", "Bugün zaten tamamlandı");
      return ok({ log: existing, program: state.program });
    }
    const planned = days[currentIndexFor(state.program, today(), false)];
    // B1: a rest day is *done* and the cycle moves on …
    if (planned.kind === "rest") return logDay({ dayId: planned.id, notes: reason });
    // … any other day becomes a break: an off-day log, the pointer stays on the planned day.
    const pointer = pointerOf(state.program);
    const log = { ...fx.makeLog(planned, today(), pointer.cycleNumber, true), date: nowIso(), notes: reason };
    state.logs.unshift(log);
    state.pointerMeta[log.id] = { pointerBeforeId: pointer.currentDayId, pointerAfterId: pointer.currentDayId, cycleBefore: pointer.cycleNumber };
    state.program = { ...state.program, lastActionAt: nowIso() };
    return ok({ log, program: state.program });
  });
  on("POST", "/program/undo-last", () => {
    const i = state.logs.findIndex((l) => l.dateKey === today());
    if (i === -1) return err(404, "NOT_FOUND", "Geri alınacak bugüne ait kayıt yok");
    const [last] = state.logs.splice(i, 1);
    setPointer(undoTransition(state.program, pointerLog(last)));
    delete state.pointerMeta[last.id];
    return ok({ program: state.program, deletedLogId: last.id });
  });
  on("GET", "/workouts", ({ query }) => {
    let logs = state.logs;
    if (query.from) logs = logs.filter((l) => l.dateKey >= query.from);
    if (query.to) logs = logs.filter((l) => l.dateKey <= query.to);
    if (query.before) logs = logs.filter((l) => l.date < query.before);
    return ok({ logs: logs.slice(0, Number(query.limit ?? 50)) });
  });
  on("GET", "/workouts/:id", ({ params }) => {
    const log = state.logs.find((l) => l.id === params.id);
    return log ? ok({ log }) : err(404, "NOT_FOUND", "Kayıt bulunamadı");
  });
  on("PATCH", "/workouts/:id", ({ params, body }) => {
    const i = state.logs.findIndex((l) => l.id === params.id);
    if (i === -1) return err(404, "NOT_FOUND", "Kayıt bulunamadı");
    state.logs[i] = { ...state.logs[i], ...(body as Partial<WorkoutLogDTO>) };
    return ok({ log: state.logs[i] });
  });
  on("DELETE", "/workouts/:id", ({ params }) => {
    const log = state.logs.find((l) => l.id === params.id);
    if (!log) return err(404, "NOT_FOUND", "Antrenman bulunamadı");
    state.logs = state.logs.filter((l) => l.id !== params.id);
    // B4: a log that still owns the pointer hands it back.
    setPointer(undoTransition(state.program, pointerLog(log)), false);
    delete state.pointerMeta[log.id];
    return noContent();
  });
  // C1 — "last time you did this". Empty is a valid answer; the fake never 404s here either.
  on("GET", "/training/exercises/:name/last", ({ params }) => {
    const wanted = params.name.trim().toLocaleLowerCase("tr");
    for (const log of [...state.logs].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      if (log.isOffDay) continue;
      const entry = log.strength.find((e) => e.name.trim().toLocaleLowerCase("tr") === wanted && !e.skipped && e.sets.length > 0);
      if (entry) return ok({ dateKey: log.dateKey, sets: entry.sets });
    }
    return ok({ dateKey: null, sets: [] });
  });
  on("GET", "/recovery", () => ok(recovery()));
  on("GET", "/training/stats", ({ query }) => ok(fx.makeTrainingStats(today(), state.logs, md(), Number(query.weeks ?? 8))));

  // body
  on("GET", "/body/entries", ({ query }) => ok({ entries: state.bodyEntries.slice(-Number(query.limit ?? 100)), profile: { gender: state.user.gender, heightCm: state.user.heightCm } }));
  on("POST", "/body/entries", ({ body }) => {
    const entry = bodyEntryFrom(body);
    state.bodyEntries = [...state.bodyEntries.filter((e) => e.dateKey !== entry.dateKey), entry].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
    upsertWeighIn(entry.weightKg, entry.dateKey, "bodyEntry");
    return ok({ entry });
  });
  on("PATCH", "/body/entries/:id", ({ params, body }) => {
    const i = state.bodyEntries.findIndex((e) => e.id === params.id);
    if (i === -1) return err(404, "NOT_FOUND", "Ölçüm bulunamadı");
    const cur = state.bodyEntries[i];
    state.bodyEntries[i] = bodyEntryFrom({ heightCm: cur.heightCm, neckCm: cur.neckCm, waistCm: cur.waistCm, hipCm: cur.hipCm, weightKg: cur.weightKg, gender: cur.gender, date: cur.date, notes: cur.notes, ...body }, cur.id);
    return ok({ entry: state.bodyEntries[i] });
  });
  on("DELETE", "/body/entries/:id", ({ params }) => {
    state.bodyEntries = state.bodyEntries.filter((e) => e.id !== params.id);
    return noContent();
  });
  on("GET", "/body/weighins", ({ query }) => {
    const from = shiftKey(today(), -Number(query.days ?? 90));
    return ok({ weighIns: state.weighIns.filter((w) => w.dateKey >= from) });
  });
  on("POST", "/body/weighins", ({ body }) => ok({ weighIn: upsertWeighIn(Number(body.weightKg), (body.dateKey as string) ?? today()) }));
  on("DELETE", "/body/weighins/:id", ({ params }) => {
    state.weighIns = state.weighIns.filter((w) => w.id !== params.id);
    return noContent();
  });
  on("GET", "/body/trends", ({ query }) => ok(trends(Number(query.days ?? 90))));
  on("GET", "/body/summary", () => ok(fx.makeSummary(state.bodyEntries, state.weighIns, state.user)));

  // goals
  on("GET", "/goals/current", () => ok({ goal: state.goal, progress: progress() }));
  on("POST", "/goals/preview", ({ body }) => {
    const start = state.bodyEntries[state.bodyEntries.length - 1];
    if (!start) return err(409, "NO_BODY_ENTRY", "Önce bir vücut ölçümü gir");
    const plan = domain.planFor(state.user, start, Number(body.targetBodyFatPct), (body.profile as GoalDTO["profile"]) ?? "optimal", today());
    return ok({ plan, warnings: plan.warnings });
  });
  on("POST", "/goals", ({ body }) => {
    if (state.goal?.status === "active") return err(409, "GOAL_EXISTS", "Zaten aktif bir hedefin var");
    const start = state.bodyEntries[state.bodyEntries.length - 1];
    if (!start) return err(409, "NO_BODY_ENTRY", "Önce bir vücut ölçümü gir");
    state.goal = domain.goalCreate(today(), state.user, start, Number(body.targetBodyFatPct), (body.profile as GoalDTO["profile"]) ?? "optimal");
    return ok({ goal: state.goal });
  });
  on("PATCH", "/goals/current", ({ body }) => {
    if (!state.goal || state.goal.status !== "active") return err(404, "NOT_FOUND", "Aktif hedef yok");
    state.goal = domain.goalUpdate(today(), state.user, state.goal, state.weighIns, {
      targetBodyFatPct: body.targetBodyFatPct == null ? undefined : Number(body.targetBodyFatPct),
      profile: body.profile as GoalDTO["profile"] | undefined,
    });
    return ok({ goal: state.goal });
  });
  on("POST", "/goals/current/recalibrate", () => {
    if (!state.goal || state.goal.status !== "active") return err(404, "NOT_FOUND", "Aktif hedef yok");
    const res = domain.recalibrationFor(today(), state.user, state.goal, state.weighIns, state.mealEntries);
    state.goal = res.goal;
    return ok(res);
  });
  on("POST", "/goals/current/complete", () => {
    if (!state.goal) return err(404, "NOT_FOUND", "Aktif hedef yok");
    state.goal = { ...state.goal, status: "completed", completedAt: new Date().toISOString() };
    return ok({ goal: state.goal });
  });
  on("POST", "/goals/current/abandon", () => {
    if (!state.goal) return err(404, "NOT_FOUND", "Aktif hedef yok");
    state.goal = { ...state.goal, status: "abandoned", completedAt: new Date().toISOString() };
    return ok({ goal: state.goal });
  });

  // reports
  on("GET", "/reports/home", () => {
    const pv = programView();
    const p = progress();
    const wk = weekKeyFor(today(), md());
    return ok(
      fx.makeHome({
        today: today(),
        user: state.user,
        programView: pv,
        recovery: recovery(),
        dayView: dayView(today()),
        goal: p,
        weighedIn: state.weighIns.some((w) => w.dateKey === today()),
        report: report(wk),
        mascot: homeMascot(),
      })
    );
  });
  on("GET", "/reports/weekly", ({ query }) => ok(report(query.week ? weekKeyFor(query.week, md()) : weekKeyFor(today(), md()))));
  on("GET", "/reports/weekly/history", ({ query }) => {
    const wk = weekKeyFor(today(), md());
    const n = Number(query.limit ?? 12);
    return ok({ weeks: Array.from({ length: n }, (_, i) => domain.summaryFor(report(shiftKey(wk, -7 * (i + 1))))) });
  });

  // mascot
  on("GET", "/mascot/message", ({ query }) => {
    const ctx = query.context ?? "home";
    if (ctx === "home") return ok(homeMascot());
    const p = progress();
    const key: MascotKey =
      ctx === "report" ? (p ? "report.onTrack" : "report.empty")
      : ctx === "scan" ? "scan.start"
      : ctx === "workout" ? "workout.start"
      : ctx === "body" ? (state.weighIns.some((w) => w.dateKey === today()) ? "body.weighInStreak" : "body.newMeasurement")
      : p ? (p.percentComplete >= 50 ? "goal.halfway" : "goal.created") : "goal.none";
    return ok(mascotFor(key, { weeks: state.goal?.plan.estimatedWeeks, pct: state.goal?.targetBodyFatPct, streak: 5, kg: p?.kgToGo }));
  });

  // nutrition
  on("GET", "/nutrition/day", ({ query }) => ok(dayView(query.date || today())));
  on("POST", "/nutrition/entries", ({ body }) => {
    const dateKey = (body.dateKey as string) || today();
    const grams = Number(body.grams);
    let entry: MealEntryDTO;
    if (body.foodId) {
      const f = state.foods.find((x) => x.id === body.foodId);
      if (!f) return err(404, "NOT_FOUND", "Yiyecek bulunamadı");
      entry = fx.makeEntry(dateKey, body.meal as MealEntryDTO["meal"], f, grams, 12);
    } else {
      const c = body.custom as { name: string; per100g: MealEntryDTO["per100g"] };
      entry = { id: fx.nextId("me"), dateKey, meal: body.meal as MealEntryDTO["meal"], foodId: null, name: c.name, grams, per100g: c.per100g, totals: fx.totalsOf(c.per100g, grams), source: "manual", scanId: null, loggedAt: new Date().toISOString() };
    }
    entry = { ...entry, source: (body.source as MealEntryDTO["source"]) ?? entry.source, scanId: (body.scanId as string) ?? null, loggedAt: new Date().toISOString() };
    state.mealEntries.push(entry);
    return ok({ entry, dayTotals: dayView(dateKey).totals });
  });
  on("PATCH", "/nutrition/entries/:id", ({ params, body }) => {
    const i = state.mealEntries.findIndex((e) => e.id === params.id);
    if (i === -1) return err(404, "NOT_FOUND", "Kayıt bulunamadı");
    const e = state.mealEntries[i];
    const grams = body.grams != null ? Number(body.grams) : e.grams;
    state.mealEntries[i] = { ...e, grams, meal: (body.meal as MealEntryDTO["meal"]) ?? e.meal, totals: fx.totalsOf(e.per100g, grams) };
    return ok({ entry: state.mealEntries[i], dayTotals: dayView(e.dateKey).totals });
  });
  on("DELETE", "/nutrition/entries/:id", ({ params }) => {
    state.mealEntries = state.mealEntries.filter((e) => e.id !== params.id);
    return noContent();
  });
  on("GET", "/nutrition/foods/search", ({ query }) => {
    const q = searchKey(query.q ?? "");
    const foods = q ? state.foods.filter((f) => searchKey(`${f.name} ${f.nameEn ?? ""} ${f.aliases.join(" ")}`).includes(q)) : state.foods;
    return ok({ foods: foods.slice(0, Number(query.limit ?? 20)), remote: [] });
  });
  on("GET", "/nutrition/foods/barcode/:code", () => ok({ food: null }));
  on("GET", "/nutrition/foods/:id", ({ params }) => {
    const f = state.foods.find((x) => x.id === params.id);
    return f ? ok({ food: f }) : err(404, "NOT_FOUND", "Yiyecek bulunamadı");
  });
  on("POST", "/nutrition/foods", ({ body }) => {
    const f = { ...fx.FOODS[0], ...(body as object), id: fx.nextId("food"), source: "user" as const, verified: false, popularity: 0, aliases: (body.aliases as string[]) ?? [], servings: (body.servings as typeof fx.FOODS[0]["servings"]) ?? [], barcode: (body.barcode as string) ?? null, brand: (body.brand as string) ?? null, nameEn: (body.nameEn as string) ?? null, category: (body.category as string) ?? "diğer", defaultServingG: Number(body.defaultServingG ?? 100) };
    state.foods.unshift(f);
    return ok({ food: f });
  });
  on("GET", "/nutrition/recent", () => {
    const seen = new Set<string>();
    const foods = [];
    for (const e of [...state.mealEntries].reverse()) {
      if (!e.foodId || seen.has(e.foodId)) continue;
      seen.add(e.foodId);
      const f = state.foods.find((x) => x.id === e.foodId);
      if (f) foods.push(f);
      if (foods.length >= 20) break;
    }
    return ok({ foods });
  });
  on("POST", "/nutrition/scan", () => {
    const pick = (id: string, conf: number, grams: number) => {
      const f = state.foods.find((x) => x.id === id)!;
      return { label: f.nameEn ?? f.name, labelTr: f.name, confidence: conf, food: f, suggestedGrams: grams };
    };
    return ok({ scanId: fx.nextId("scan"), imageUrl: null, detections: [pick("f_tavuk", 0.84, 150), pick("f_bulgur", 0.61, 150), pick("f_salata", 0.42, 120)], mock: true, latencyMs: 420, modelVersion: "fake-1" });
  });
  on("GET", "/nutrition/week", ({ query }) => ok(fx.makeWeekNutrition(query.week ? weekKeyFor(query.week, md()) : weekKeyFor(today(), md()), state.mealEntries, state.target)));
  on("GET", "/nutrition/target", () => ok(state.target));
  on("PUT", "/nutrition/target", ({ body }) => {
    if (body.mode === "auto") state.target = { ...fx.DEFAULT_TARGET };
    else state.target = { mode: "manual", calories: Number(body.calories ?? state.target.calories), protein: Number(body.protein ?? state.target.protein), carbs: Number(body.carbs ?? state.target.carbs), fat: Number(body.fat ?? state.target.fat), derivedFrom: null };
    return ok(state.target);
  });

  on("GET", "/health", () => ok({ ok: true, uptime: 1, db: "fake" }), false);

  /* ----------------------------- dispatcher ---------------------------- */
  function match(method: string, path: string): { route: (typeof routes)[number]; params: Record<string, string> } | null {
    const segs = path.split("/").filter(Boolean);
    for (const route of routes) {
      if (route.method !== method || route.pattern.length !== segs.length) continue;
      const params: Record<string, string> = {};
      let okMatch = true;
      for (let i = 0; i < segs.length; i++) {
        const p = route.pattern[i];
        if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(segs[i]);
        else if (p !== segs[i]) {
          okMatch = false;
          break;
        }
      }
      if (okMatch) return { route, params };
    }
    return null;
  }

  const fakeFetch = (async (input: string, init?: RequestInit): Promise<Response> => {
    if (latency > 0) await new Promise((r) => setTimeout(r, latency * (0.7 + Math.random() * 0.6)));
    const rel = input.startsWith(FAKE_BASE_URL) ? input.slice(FAKE_BASE_URL.length) : input.replace(/^https?:\/\/[^/]+(\/api\/v1)?/, "");
    const qi = rel.indexOf("?");
    const path = qi === -1 ? rel : rel.slice(0, qi);
    const query = parseQuery(qi === -1 ? "" : rel.slice(qi + 1));
    const method = (init?.method ?? "GET").toUpperCase();
    const m = match(method, path);
    if (!m) return makeResponse(err(404, "NOT_FOUND", `Rota yok: ${method} ${path}`));

    let user: UserDTO | null = null;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const authHeader = headers.authorization ?? headers.Authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (state.sessions.has(token)) user = state.user;
    }
    if (m.route.auth && !user) return makeResponse(err(401, "AUTH_REQUIRED", "Giriş yapmalısın"));

    let body: Record<string, unknown> = {};
    if (typeof init?.body === "string" && init.body) {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        return makeResponse(err(400, "VALIDATION", "Geçersiz JSON"));
      }
    }
    try {
      const result = m.route.handler({ params: m.params, query, body, user });
      const r: Result = result && typeof result === "object" && "status" in (result as Result) ? (result as Result) : ok(result as Json);
      return makeResponse(r);
    } catch (e) {
      return makeResponse(err(500, "INTERNAL", (e as Error).message));
    }
  }) as FetchLike & { state: FakeState };
  fakeFetch.state = state;
  return fakeFetch;
}

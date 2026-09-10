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
  type MascotKey,
  type MascotMessage,
  type MealEntryDTO,
  type UserDTO,
  type Weekday,
  type WeighInDTO,
  type WorkoutLogDTO,
  type DietTargetDTO,
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
  const state = opts.state ?? createFakeState();
  const latency = opts.latencyMs ?? 350;
  const today = opts.today ?? (() => trDateKey());
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
  const routes: Array<{ method: string; pattern: string[]; auth: boolean; handler: Handler }> = [];
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

  // catalog
  on("GET", "/muscles", () => ok({ muscles: fx.MUSCLES }));
  on("GET", "/exercises", ({ query }) => {
    const q = searchKey(query.q ?? "");
    return ok({ exercises: q ? fx.EXERCISES.filter((e) => searchKey(e.name).includes(q)) : fx.EXERCISES });
  });

  // training
  on("GET", "/program", () => ok(programView()));
  on("PUT", "/program", ({ body }) => {
    const days = (body.days as typeof state.program.days) ?? state.program.days;
    state.program = { ...state.program, name: (body.name as string) ?? state.program.name, days, currentIndex: Math.min(state.program.currentIndex, days.length - 1), lastActionAt: new Date().toISOString() };
    return ok({ program: state.program });
  });
  on("POST", "/program/jump", ({ body }) => {
    const index = Number(body.index);
    if (!(index >= 0 && index < state.program.days.length)) return err(400, "VALIDATION", "Geçersiz gün");
    state.program = { ...state.program, currentIndex: index, lastActionAt: new Date().toISOString() };
    return ok({ program: state.program });
  });
  const advance = () => {
    const next = (state.program.currentIndex + 1) % state.program.days.length;
    state.program = { ...state.program, currentIndex: next, weekNumber: next === 0 ? state.program.weekNumber + 1 : state.program.weekNumber, lastActionAt: new Date().toISOString() };
  };
  on("POST", "/program/complete", ({ body }) => {
    const day = state.program.days[state.program.currentIndex];
    const log = fx.makeLog(day, today(), state.program.weekNumber);
    if (Array.isArray(body.strength) && body.strength.length) log.strength = body.strength as WorkoutLogDTO["strength"];
    if (body.durationMin != null) log.durationMin = Number(body.durationMin);
    if (body.notes != null) log.notes = String(body.notes);
    if (body.rpe != null) log.rpe = Number(body.rpe);
    state.logs.unshift(log);
    advance();
    return ok({ log, program: state.program });
  });
  on("POST", "/program/skip", () => {
    const day = state.program.days[state.program.currentIndex];
    const log = fx.makeLog(day, today(), state.program.weekNumber, true);
    state.logs.unshift(log);
    advance();
    return ok({ log, program: state.program });
  });
  on("POST", "/program/undo-last", () => {
    const i = state.logs.findIndex((l) => l.dateKey === today());
    if (i === -1) return err(404, "NOT_FOUND", "Bugün geri alınacak kayıt yok");
    state.logs.splice(i, 1);
    const prev = (state.program.currentIndex - 1 + state.program.days.length) % state.program.days.length;
    state.program = { ...state.program, currentIndex: prev };
    return ok({ program: state.program });
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
    state.logs = state.logs.filter((l) => l.id !== params.id);
    return noContent();
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

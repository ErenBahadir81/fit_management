/**
 * In-memory fake implementing the `ApiClient` surface (NEXT_PUBLIC_API_FAKE=1).
 *
 * The backend is being written concurrently; this keeps every admin screen demoable and
 * unit-testable today. It is referenced only from the `NEXT_PUBLIC_API_FAKE` branch in
 * `src/lib/api.ts`, so the constant folds away and this module is dropped from the default
 * (real-client) bundle.
 */
import { ApiClientError } from "@fitfloow/api-client";
import type { ApiClient } from "@fitfloow/api-client";
import {
  DEFAULT_MASCOT_MESSAGES,
  bodyComposition,
  navyBodyFat,
  round,
  shiftKey,
  trDateKey,
  type AdminCreateUserInput,
  type AdminUpdateUserInput,
  type AdminUserDTO,
  type BodyEntryDTO,
  type ExerciseDTO,
  type ExerciseInput,
  type FoodDTO,
  type FoodInput,
  type GoalDTO,
  type MascotTemplateDTO,
  type MuscleDTO,
  type ProgramDTO,
  type ProgramTemplateDTO,
  type ProgramTemplateInput,
  type SettingsDTO,
  type UserDTO,
  type WeeklyReportDTO,
  type WorkoutLogDTO,
} from "@fitfloow/core";
import { computeGoalPlan } from "../goal-sim";
import { templateVolume } from "../volume";
import { CREDENTIALS, EXERCISES, FOODS, MASCOT_MESSAGES, MUSCLES, SCANS, SETTINGS, TEMPLATES, USERS, dashboardSeries, type FakeScan } from "./seed";

export interface FakeState {
  session: UserDTO | null;
  users: AdminUserDTO[];
  muscles: MuscleDTO[];
  exercises: ExerciseDTO[];
  templates: ProgramTemplateDTO[];
  foods: FoodDTO[];
  messages: MascotTemplateDTO[];
  settings: SettingsDTO;
  scans: FakeScan[];
  programByUser: Record<string, string>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createFakeState(): FakeState {
  return {
    session: null,
    users: clone(USERS),
    muscles: clone(MUSCLES),
    exercises: clone(EXERCISES),
    templates: clone(TEMPLATES),
    foods: clone(FOODS),
    messages: clone(MASCOT_MESSAGES),
    settings: clone(SETTINGS),
    scans: clone(SCANS),
    programByUser: { usr_eren: "tpl_ppl7", usr_inci: "tpl_full4", usr_kaan: "tpl_ppl7", usr_mert: "tpl_cali5", usr_zeynep: "tpl_full4" },
  };
}

export interface FakeOptions {
  /** Artificial latency so skeletons are actually visible while developing. 0 in tests. */
  latencyMs?: number;
  state?: FakeState;
  /** Start already authenticated (used by tests and by the demo shell). */
  signedIn?: boolean;
}

const toUser = (u: AdminUserDTO): UserDTO => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  role: u.role,
  gender: u.gender,
  heightCm: u.heightCm,
  birthDate: u.birthDate,
  activityLevel: u.activityLevel,
  measurementDay: u.measurementDay,
  mascotEnabled: u.mascotEnabled,
  createdAt: u.createdAt,
  lastSeenAt: u.lastSeenAt ?? null,
});

let idCounter = 1000;
const nextId = (prefix: string) => `${prefix}_${++idCounter}`;

function notFound(what: string): never {
  throw new ApiClientError(404, "NOT_FOUND", `${what} bulunamadı`);
}

function bodyEntryFor(user: AdminUserDTO, dayOffset: number, weightKg: number, waistCm: number): BodyEntryDTO {
  const heightCm = user.heightCm ?? 175;
  const neckCm = user.gender === "male" ? 39 : 32;
  const hipCm = user.gender === "female" ? waistCm + 24 : null;
  const bf = navyBodyFat({ gender: user.gender, heightCm, neckCm, waistCm, hipCm }) ?? 20;
  const comp = bodyComposition(weightKg, bf);
  const dateKey = shiftKey(trDateKey(), -dayOffset);
  return {
    id: `body_${user.id}_${dayOffset}`,
    date: `${dateKey}T07:30:00.000Z`,
    dateKey,
    gender: user.gender,
    heightCm,
    neckCm,
    waistCm,
    hipCm,
    weightKg,
    bodyFatPct: bf,
    fatMassKg: comp.fatMassKg,
    leanMassKg: comp.leanMassKg,
    notes: null,
  };
}

const BODY_PROFILE: Record<string, { weight: number; waist: number; target: number }> = {
  usr_eren: { weight: 103, waist: 92, target: 12 },
  usr_inci: { weight: 64, waist: 74, target: 24 },
  usr_kaan: { weight: 82, waist: 84, target: 15 },
  usr_selin: { weight: 58, waist: 70, target: 22 },
  usr_mert: { weight: 96, waist: 104, target: 20 },
  usr_zeynep: { weight: 55, waist: 66, target: 21 },
};

function goalFor(state: FakeState, user: AdminUserDTO): GoalDTO | null {
  if (!user.goalStatus) return null;
  const profile = BODY_PROFILE[user.id] ?? { weight: 80, waist: 85, target: 18 };
  const latest = bodyEntryFor(user, 3, profile.weight, profile.waist);
  const startKey = shiftKey(trDateKey(), -42);
  const plan = computeGoalPlan({
    sex: user.gender,
    weightKg: latest.weightKg,
    bodyFatPct: latest.bodyFatPct,
    heightCm: latest.heightCm,
    age: user.birthDate ? new Date().getUTCFullYear() - Number(user.birthDate.slice(0, 4)) : null,
    activityLevel: user.activityLevel,
    targetBodyFatPct: profile.target,
    profile: "optimal",
    startKey,
    settings: state.settings.goal,
  });
  return {
    id: `goal_${user.id}`,
    status: user.goalStatus,
    targetBodyFatPct: profile.target,
    profile: "optimal",
    start: {
      dateKey: startKey,
      weightKg: round(latest.weightKg + 2.4, 1),
      bodyFatPct: round(latest.bodyFatPct + 1.2, 1),
      leanMassKg: latest.leanMassKg,
      fatMassKg: round(latest.fatMassKg + 2.4, 1),
      bodyEntryId: latest.id,
    },
    plan,
    tdeeOverride: null,
    createdAt: `${startKey}T08:00:00.000Z`,
    updatedAt: new Date().toISOString(),
    completedAt: user.goalStatus === "completed" ? new Date().toISOString() : null,
  };
}

function programFor(state: FakeState, user: AdminUserDTO): ProgramDTO | null {
  const templateId = state.programByUser[user.id];
  const template = state.templates.find((t) => t.id === templateId);
  if (!template) return null;
  return {
    id: `prg_${user.id}`,
    name: template.name,
    days: clone(template.days),
    currentIndex: 2 % template.days.length,
    weekNumber: 7,
    startedAt: shiftKey(trDateKey(), -45) + "T06:00:00.000Z",
    lastActionAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    sourceTemplateId: template.id,
  };
}

function workoutsFor(state: FakeState, user: AdminUserDTO): WorkoutLogDTO[] {
  const program = programFor(state, user);
  if (!program) return [];
  return [0, 1, 2, 4, 6].map((offset, i) => {
    const day = program.days[(program.days.length - 1 - i + program.days.length) % program.days.length];
    const dateKey = shiftKey(trDateKey(), -(offset + 1));
    return {
      id: `log_${user.id}_${i}`,
      date: `${dateKey}T18:20:00.000Z`,
      dateKey,
      dayOrder: day.order,
      weekNumber: 7,
      title: day.title,
      kind: day.kind,
      isOffDay: day.kind === "rest",
      strength: day.exercises.map((e) => ({
        name: e.name,
        muscles: e.muscles,
        plannedSets: e.targetSets,
        plannedReps: e.targetReps,
        plannedRIR: e.targetRIR,
        source: "planned" as const,
        skipped: false,
        metric: e.metric,
        sets: Array.from({ length: e.targetSets }, () => ({ reps: e.targetReps, rir: e.targetRIR })),
      })),
      run: day.run ? { segments: [{ km: day.run.targetKm, min: day.run.targetMin }], totalKm: day.run.targetKm, totalMin: day.run.targetMin, targetKm: day.run.targetKm, targetMin: day.run.targetMin } : null,
      swim: day.swim ? { segments: [{ km: day.swim.targetKm, min: day.swim.targetMin }], totalKm: day.swim.targetKm, totalMin: day.swim.targetMin, targetKm: day.swim.targetKm, targetMin: day.swim.targetMin } : null,
      durationMin: 52 + i * 3,
      notes: i === 0 ? "Bench'te üst set zorladı, RIR 1." : null,
      rpe: 7 + (i % 2),
    };
  });
}

function weekReportFor(state: FakeState, user: AdminUserDTO): WeeklyReportDTO | null {
  const goal = goalFor(state, user);
  const program = programFor(state, user);
  if (!program) return null;
  const weekKey = shiftKey(trDateKey(), -3);
  const week1 = goal?.plan.roadmap[0] ?? null;
  const target = week1?.dailyCalorieTarget ?? 2400;
  const days = Array.from({ length: 7 }, (_, i) => {
    const logged = i < 5;
    const kcal = logged ? Math.round(target + (i % 3 === 0 ? 180 : -140)) : 0;
    return {
      dateKey: shiftKey(weekKey, i),
      kcal,
      protein: logged ? Math.round((week1?.macros.protein ?? 170) * 0.94) : 0,
      carbs: logged ? Math.round((week1?.macros.carbs ?? 200) * 1.02) : 0,
      fat: logged ? Math.round((week1?.macros.fat ?? 70) * 0.98) : 0,
      logged,
      deficit: logged ? Math.round((goal?.plan.tdee ?? 2800) - kcal) : 0,
    };
  });
  const loggedDays = days.filter((d) => d.logged);
  const volume = templateVolume(program.days, state.muscles).map((row) => ({
    key: row.key,
    name: row.name,
    done: round(row.weeklySets * 0.86, 1),
    target: row.target,
    status: row.status,
  }));
  const banked = loggedDays.reduce((s, d) => s + d.deficit, 0);
  return {
    weekKey,
    startKey: weekKey,
    endKey: shiftKey(weekKey, 6),
    dayIndexToday: 3,
    isCurrent: true,
    measurementDay: user.measurementDay,
    generatedAt: new Date().toISOString(),
    goal: goal
      ? {
          targetBodyFatPct: goal.targetBodyFatPct,
          profile: goal.profile,
          weekIndexInPlan: 6,
          plannedDailyTarget: target,
          plannedWeeklyDeficit: week1?.weeklyDeficitKcal ?? 3500,
          tdeeUsed: goal.plan.tdee,
          expectedWeightEnd: week1?.endWeightKg ?? 0,
          expectedBfEnd: week1?.endBfPct ?? 0,
        }
      : null,
    nutrition: {
      daysLogged: loggedDays.length,
      avgKcal: Math.round(loggedDays.reduce((s, d) => s + d.kcal, 0) / Math.max(1, loggedDays.length)),
      totalKcal: loggedDays.reduce((s, d) => s + d.kcal, 0),
      targetKcal: target * 7,
      avgProtein: Math.round(loggedDays.reduce((s, d) => s + d.protein, 0) / Math.max(1, loggedDays.length)),
      proteinTarget: week1?.macros.protein ?? 170,
      deficitBankedKcal: banked,
      deficitPlannedKcal: week1?.weeklyDeficitKcal ?? 3500,
      deficitPct: round((banked / Math.max(1, week1?.weeklyDeficitKcal ?? 3500)) * 100, 0),
      fatEquivalentKg: round(banked / state.settings.goal.kcalPerKgFat, 2),
      days,
    },
    body: {
      weightStart: BODY_PROFILE[user.id]?.weight ?? 80,
      weightEnd: round((BODY_PROFILE[user.id]?.weight ?? 80) - 0.6, 1),
      weightDelta: -0.6,
      ewmaStart: BODY_PROFILE[user.id]?.weight ?? 80,
      ewmaEnd: round((BODY_PROFILE[user.id]?.weight ?? 80) - 0.45, 2),
      ewmaDelta: -0.45,
      expectedDelta: -(week1?.rateKgPerWeek ?? 0.5),
      bodyFatStart: null,
      bodyFatEnd: null,
      waistStart: BODY_PROFILE[user.id]?.waist ?? 85,
      waistEnd: round((BODY_PROFILE[user.id]?.waist ?? 85) - 0.5, 1),
      weighInDays: 5,
      hasMeasurement: true,
    },
    training: {
      sessions: 4,
      plannedSessions: 5,
      offDays: 1,
      sets: round(volume.reduce((s, v) => s + v.done, 0), 0),
      cardioKm: 6,
      volumeByMuscle: volume,
    },
    goalDistance: goal
      ? {
          kgToGo: round(goal.plan.totalLossKg * 0.62, 1),
          bfToGo: round((goal.start.bodyFatPct - goal.targetBodyFatPct) * 0.6, 1),
          weeksRemainingPlan: Math.max(0, goal.plan.estimatedWeeks - 6),
          weeksRemainingProjected: Math.max(0, goal.plan.estimatedWeeks - 5),
          percentComplete: 38,
          onTrack: "onTrack",
          projectedDate: goal.plan.targetDate,
        }
      : null,
    score: 78,
    highlights: ["5 günde kalori kaydı tam", "Bench Press'te haftalık hacim %6 arttı", "Bel çevresi 0,5 cm azaldı"],
    mascot: { mood: "happy", key: "report.onTrack", text: "Tam planda gidiyorsun. Aynen böyle devam!" },
  };
}

/**
 * Build a client whose shape matches `@fitfloow/api-client`. Endpoints the admin panel does
 * not use resolve with empty/neutral payloads rather than throwing, so a stray call never
 * breaks a screen.
 */
export function createFakeApiClient(options: FakeOptions = {}): ApiClient {
  const state = options.state ?? createFakeState();
  const latency = options.latencyMs ?? 0;
  if (options.signedIn) state.session = toUser(state.users[0]);

  const wait = <T>(value: T): Promise<T> =>
    latency > 0 ? new Promise((resolve) => setTimeout(() => resolve(clone(value)), latency)) : Promise.resolve(clone(value));

  const requireAdmin = () => {
    if (!state.session) throw new ApiClientError(401, "AUTH_REQUIRED", "Oturum gerekli");
    if (state.session.role !== "admin") throw new ApiClientError(403, "FORBIDDEN", "Bu işlem için yönetici yetkisi gerekli");
  };

  const notImplemented = (name: string) => () => Promise.reject(new ApiClientError(501, "INTERNAL", `${name} demo modunda yok`));

  const client = {
    /** The fake never talks HTTP; kept so the shape matches `ApiClient`. */
    transport: {
      request: <T,>(path: string) => Promise.reject(new ApiClientError(501, "INTERNAL", `Demo modunda ${path} yok`)) as Promise<T>,
    },

    auth: {
      login: async (username: string, password: string) => {
        await wait(null);
        const user = state.users.find((u) => u.username === username.toLowerCase());
        const expected = CREDENTIALS[username.toLowerCase()];
        if (!user || !expected || expected !== password) throw new ApiClientError(401, "AUTH_INVALID", "Kullanıcı adı veya parola hatalı");
        if (user.role !== "admin") throw new ApiClientError(403, "FORBIDDEN", "Yönetim paneline yalnızca yöneticiler girebilir");
        state.session = toUser(user);
        return { accessToken: "fake-access", refreshToken: "fake-refresh", user: clone(state.session) };
      },
      refresh: async () => wait({ accessToken: "fake-access", refreshToken: "fake-refresh" }),
      logout: async () => {
        state.session = null;
      },
      me: async () => {
        if (!state.session) throw new ApiClientError(401, "AUTH_REQUIRED", "Oturum gerekli");
        return wait({ user: state.session });
      },
    },

    me: {
      update: async (input: Record<string, unknown>) => {
        if (!state.session) throw new ApiClientError(401, "AUTH_REQUIRED", "Oturum gerekli");
        state.session = { ...state.session, ...input } as UserDTO;
        const idx = state.users.findIndex((u) => u.id === state.session!.id);
        if (idx >= 0) state.users[idx] = { ...state.users[idx], ...input } as AdminUserDTO;
        return wait({ user: state.session });
      },
      changePassword: async (currentPassword: string) => {
        if (!state.session) throw new ApiClientError(401, "AUTH_REQUIRED", "Oturum gerekli");
        if (CREDENTIALS[state.session.username] !== currentPassword)
          throw new ApiClientError(400, "VALIDATION", "Mevcut parola hatalı");
        await wait(null);
      },
    },

    catalog: {
      muscles: async () => wait({ muscles: state.muscles.filter((m) => m.active) }),
      exercises: async (q?: string) =>
        wait({ exercises: state.exercises.filter((e) => !q || e.name.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr"))) }),
    },

    training: {
      program: notImplemented("training.program"),
      updateProgram: notImplemented("training.updateProgram"),
      jump: notImplemented("training.jump"),
      complete: notImplemented("training.complete"),
      skip: notImplemented("training.skip"),
      undoLast: notImplemented("training.undoLast"),
      workouts: async () => wait({ logs: [] }),
      workout: notImplemented("training.workout"),
      updateWorkout: notImplemented("training.updateWorkout"),
      deleteWorkout: notImplemented("training.deleteWorkout"),
      recovery: notImplemented("training.recovery"),
      stats: notImplemented("training.stats"),
    },

    body: {
      entries: async () => wait({ entries: [], profile: { gender: "male" as const, heightCm: null } }),
      createEntry: notImplemented("body.createEntry"),
      updateEntry: notImplemented("body.updateEntry"),
      deleteEntry: notImplemented("body.deleteEntry"),
      weighIns: async () => wait({ weighIns: [] }),
      createWeighIn: notImplemented("body.createWeighIn"),
      deleteWeighIn: notImplemented("body.deleteWeighIn"),
      trends: notImplemented("body.trends"),
      summary: notImplemented("body.summary"),
    },

    goals: {
      current: async () => wait({ goal: null, progress: null }),
      preview: notImplemented("goals.preview"),
      create: notImplemented("goals.create"),
      update: notImplemented("goals.update"),
      recalibrate: notImplemented("goals.recalibrate"),
      complete: notImplemented("goals.complete"),
      abandon: notImplemented("goals.abandon"),
    },

    reports: {
      weekly: notImplemented("reports.weekly"),
      history: async () => wait({ weeks: [] }),
      home: notImplemented("reports.home"),
    },

    nutrition: {
      day: notImplemented("nutrition.day"),
      addEntry: notImplemented("nutrition.addEntry"),
      updateEntry: notImplemented("nutrition.updateEntry"),
      deleteEntry: notImplemented("nutrition.deleteEntry"),
      search: async (q: string) => {
        const match = state.foods.filter((f) => f.name.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));
        return wait({ foods: match, remote: [] });
      },
      food: async (id: string) => {
        const f = state.foods.find((x) => x.id === id);
        return f ? wait({ food: f }) : notFound("Besin");
      },
      createFood: notImplemented("nutrition.createFood"),
      barcode: async () => wait({ food: null }),
      recent: async () => wait({ foods: state.foods.slice(0, 8) }),
      scan: notImplemented("nutrition.scan"),
      week: notImplemented("nutrition.week"),
      target: notImplemented("nutrition.target"),
      setTarget: notImplemented("nutrition.setTarget"),
    },

    mascot: {
      message: async () => {
        const tpl = DEFAULT_MASCOT_MESSAGES[0];
        return wait({ mood: tpl.mood, text: tpl.variants[0], key: tpl.key });
      },
    },

    admin: {
      dashboard: async () => {
        requireAdmin();
        const series = dashboardSeries();
        const last7 = series.slice(-7);
        return wait({
          users: state.users.length,
          activeUsers7d: state.users.filter((u) => u.lastSeenAt && Date.now() - new Date(u.lastSeenAt).getTime() < 7 * 86400_000).length,
          workouts7d: last7.reduce((s, d) => s + d.workouts, 0),
          meals7d: last7.reduce((s, d) => s + d.meals, 0),
          scans7d: last7.reduce((s, d) => s + d.scans, 0),
          goalsActive: state.users.filter((u) => u.goalStatus === "active").length,
          series,
        });
      },

      users: async (q?: string) => {
        requireAdmin();
        const needle = (q ?? "").toLocaleLowerCase("tr").trim();
        const users = needle
          ? state.users.filter(
              (u) => u.username.toLocaleLowerCase("tr").includes(needle) || u.displayName.toLocaleLowerCase("tr").includes(needle)
            )
          : state.users;
        return wait({ users });
      },
      user: async (id: string) => {
        requireAdmin();
        const u = state.users.find((x) => x.id === id);
        return u ? wait({ user: u }) : notFound("Kullanıcı");
      },
      createUser: async (input: AdminCreateUserInput) => {
        requireAdmin();
        if (state.users.some((u) => u.username === input.username))
          throw new ApiClientError(409, "CONFLICT", "Bu kullanıcı adı zaten alınmış");
        const user: AdminUserDTO = {
          id: nextId("usr"),
          username: input.username,
          displayName: input.displayName,
          role: input.role ?? "user",
          gender: input.gender ?? "male",
          heightCm: input.heightCm ?? null,
          birthDate: input.birthDate ?? null,
          activityLevel: input.activityLevel ?? "moderate",
          measurementDay: input.measurementDay ?? 0,
          mascotEnabled: true,
          createdAt: new Date().toISOString(),
          lastSeenAt: null,
          hasProgram: false,
          goalStatus: null,
        };
        state.users = [user, ...state.users];
        CREDENTIALS[user.username] = input.password;
        return wait({ user });
      },
      updateUser: async (id: string, input: AdminUpdateUserInput) => {
        requireAdmin();
        const idx = state.users.findIndex((u) => u.id === id);
        if (idx < 0) notFound("Kullanıcı");
        const { password, ...rest } = input as AdminUpdateUserInput & { password?: string };
        if (password) CREDENTIALS[state.users[idx].username] = password;
        state.users[idx] = { ...state.users[idx], ...rest };
        return wait({ user: state.users[idx] });
      },
      deleteUser: async (id: string) => {
        requireAdmin();
        state.users = state.users.filter((u) => u.id !== id);
        await wait(null);
      },
      userOverview: async (id: string) => {
        requireAdmin();
        const user = state.users.find((u) => u.id === id);
        if (!user) notFound("Kullanıcı");
        const profile = BODY_PROFILE[user.id] ?? { weight: 80, waist: 85, target: 18 };
        return wait({
          user,
          program: programFor(state, user),
          latestBody: bodyEntryFor(user, 3, profile.weight, profile.waist),
          goal: goalFor(state, user),
          lastWorkouts: workoutsFor(state, user),
          weekReport: weekReportFor(state, user),
        });
      },
      assignProgram: async (id: string, templateId: string) => {
        requireAdmin();
        const user = state.users.find((u) => u.id === id);
        if (!user) notFound("Kullanıcı");
        if (!state.templates.some((t) => t.id === templateId)) notFound("Program şablonu");
        state.programByUser[id] = templateId;
        user.hasProgram = true;
        const program = programFor(state, user);
        if (!program) notFound("Program");
        return wait({ program });
      },
      resetPassword: async (id: string, password: string) => {
        requireAdmin();
        const user = state.users.find((u) => u.id === id);
        if (!user) notFound("Kullanıcı");
        CREDENTIALS[user.username] = password;
        await wait(null);
      },

      settings: async () => {
        requireAdmin();
        return wait(state.settings);
      },
      updateSettings: async (input: SettingsDTO) => {
        requireAdmin();
        state.settings = clone({ ...input, updatedAt: new Date().toISOString() });
        return wait(state.settings);
      },

      muscles: async () => {
        requireAdmin();
        return wait({ muscles: [...state.muscles].sort((a, b) => a.order - b.order) });
      },
      createMuscle: async (input: Omit<MuscleDTO, "order"> & { order?: number }) => {
        requireAdmin();
        if (state.muscles.some((m) => m.key === input.key)) throw new ApiClientError(409, "CONFLICT", "Bu anahtar zaten var");
        const muscle: MuscleDTO = { ...input, order: input.order ?? state.muscles.length };
        state.muscles = [...state.muscles, muscle];
        return wait({ muscle });
      },
      updateMuscle: async (key: string, input: Partial<Omit<MuscleDTO, "key">>) => {
        requireAdmin();
        const idx = state.muscles.findIndex((m) => m.key === key);
        if (idx < 0) notFound("Kas");
        state.muscles[idx] = { ...state.muscles[idx], ...input };
        return wait({ muscle: state.muscles[idx] });
      },
      deleteMuscle: async (key: string) => {
        requireAdmin();
        state.muscles = state.muscles.filter((m) => m.key !== key).map((m, i) => ({ ...m, order: i }));
        await wait(null);
      },
      reorderMuscles: async (keys: string[]) => {
        requireAdmin();
        const byKey = new Map(state.muscles.map((m) => [m.key, m]));
        const ordered = keys.map((k) => byKey.get(k)).filter((m): m is MuscleDTO => Boolean(m));
        const rest = state.muscles.filter((m) => !keys.includes(m.key));
        state.muscles = [...ordered, ...rest].map((m, i) => ({ ...m, order: i }));
        return wait({ muscles: state.muscles });
      },

      exercises: async (q?: { q?: string; muscle?: string }) => {
        requireAdmin();
        const needle = (q?.q ?? "").toLocaleLowerCase("tr").trim();
        const exercises = state.exercises.filter(
          (e) =>
            (!needle || e.name.toLocaleLowerCase("tr").includes(needle) || e.equipment.some((x) => x.includes(needle))) &&
            (!q?.muscle || e.muscles.some((m) => m.key === q.muscle))
        );
        return wait({ exercises });
      },
      createExercise: async (input: ExerciseInput) => {
        requireAdmin();
        const exercise: ExerciseDTO = {
          id: nextId("ex"),
          name: input.name,
          muscles: input.muscles ?? [],
          defaultSets: input.defaultSets,
          defaultReps: input.defaultReps,
          metric: input.metric ?? "reps",
          kind: input.kind ?? "strength",
          equipment: input.equipment ?? [],
          instructions: input.instructions ?? "",
          active: input.active ?? true,
        };
        state.exercises = [exercise, ...state.exercises];
        return wait({ exercise });
      },
      updateExercise: async (id: string, input: Partial<ExerciseInput>) => {
        requireAdmin();
        const idx = state.exercises.findIndex((e) => e.id === id);
        if (idx < 0) notFound("Hareket");
        state.exercises[idx] = { ...state.exercises[idx], ...input } as ExerciseDTO;
        return wait({ exercise: state.exercises[idx] });
      },
      deleteExercise: async (id: string) => {
        requireAdmin();
        state.exercises = state.exercises.filter((e) => e.id !== id);
        await wait(null);
      },

      templates: async () => {
        requireAdmin();
        return wait({ templates: state.templates.map(withVolume(state)) });
      },
      template: async (id: string) => {
        requireAdmin();
        const t = state.templates.find((x) => x.id === id);
        return t ? wait({ template: withVolume(state)(t) }) : notFound("Şablon");
      },
      createTemplate: async (input: ProgramTemplateInput) => {
        requireAdmin();
        const now = new Date().toISOString();
        const template: ProgramTemplateDTO = {
          id: nextId("tpl"),
          name: input.name,
          description: input.description ?? "",
          days: (input.days ?? []) as ProgramTemplateDTO["days"],
          tags: input.tags ?? [],
          cycleLength: (input.days ?? []).length,
          createdAt: now,
          updatedAt: now,
        };
        state.templates = [template, ...state.templates];
        return wait({ template: withVolume(state)(template) });
      },
      updateTemplate: async (id: string, input: Partial<ProgramTemplateInput>) => {
        requireAdmin();
        const idx = state.templates.findIndex((t) => t.id === id);
        if (idx < 0) notFound("Şablon");
        const days = (input.days ?? state.templates[idx].days) as ProgramTemplateDTO["days"];
        state.templates[idx] = {
          ...state.templates[idx],
          ...input,
          days,
          cycleLength: days.length,
          updatedAt: new Date().toISOString(),
        } as ProgramTemplateDTO;
        return wait({ template: withVolume(state)(state.templates[idx]) });
      },
      deleteTemplate: async (id: string) => {
        requireAdmin();
        state.templates = state.templates.filter((t) => t.id !== id);
        await wait(null);
      },
      duplicateTemplate: async (id: string) => {
        requireAdmin();
        const src = state.templates.find((t) => t.id === id);
        if (!src) notFound("Şablon");
        const now = new Date().toISOString();
        const template: ProgramTemplateDTO = { ...clone(src), id: nextId("tpl"), name: `${src.name} (kopya)`, createdAt: now, updatedAt: now };
        state.templates = [template, ...state.templates];
        return wait({ template: withVolume(state)(template) });
      },

      mascotMessages: async () => {
        requireAdmin();
        return wait({ messages: state.messages });
      },
      createMascotMessage: async (input: Omit<MascotTemplateDTO, "id" | "active"> & { active?: boolean }) => {
        requireAdmin();
        const message: MascotTemplateDTO = { id: nextId("msg"), key: input.key, mood: input.mood, variants: input.variants, active: input.active ?? true };
        state.messages = [...state.messages, message];
        return wait({ message });
      },
      updateMascotMessage: async (id: string, input: Partial<Omit<MascotTemplateDTO, "id" | "key">>) => {
        requireAdmin();
        const idx = state.messages.findIndex((m) => m.id === id);
        if (idx < 0) notFound("Mesaj");
        state.messages[idx] = { ...state.messages[idx], ...input };
        return wait({ message: state.messages[idx] });
      },
      deleteMascotMessage: async (id: string) => {
        requireAdmin();
        state.messages = state.messages.filter((m) => m.id !== id);
        await wait(null);
      },
      resetMascotMessages: async () => {
        requireAdmin();
        state.messages = clone(MASCOT_MESSAGES);
        return wait({ messages: state.messages });
      },

      foods: async (q?: { q?: string; limit?: number; source?: string }) => {
        requireAdmin();
        const needle = (q?.q ?? "").toLocaleLowerCase("tr").trim();
        const all = state.foods.filter(
          (f) =>
            (!needle ||
              f.name.toLocaleLowerCase("tr").includes(needle) ||
              (f.nameEn ?? "").toLowerCase().includes(needle) ||
              f.aliases.some((a) => a.toLowerCase().includes(needle))) &&
            (!q?.source || f.source === q.source)
        );
        return wait({ foods: all.slice(0, q?.limit ?? 200), total: all.length });
      },
      createFood: async (input: FoodInput) => {
        requireAdmin();
        const food: FoodDTO = {
          id: nextId("food"),
          name: input.name,
          nameEn: input.nameEn ?? null,
          aliases: input.aliases ?? [],
          category: input.category ?? "diğer",
          per100g: input.per100g,
          defaultServingG: input.defaultServingG ?? 100,
          servings: input.servings ?? [],
          source: "admin",
          barcode: input.barcode ?? null,
          verified: input.verified ?? false,
          popularity: 0,
          brand: input.brand ?? null,
        };
        state.foods = [food, ...state.foods];
        return wait({ food });
      },
      updateFood: async (id: string, input: Partial<FoodInput>) => {
        requireAdmin();
        const idx = state.foods.findIndex((f) => f.id === id);
        if (idx < 0) notFound("Besin");
        state.foods[idx] = { ...state.foods[idx], ...input } as FoodDTO;
        return wait({ food: state.foods[idx] });
      },
      deleteFood: async (id: string) => {
        requireAdmin();
        state.foods = state.foods.filter((f) => f.id !== id);
        await wait(null);
      },
      importFoods: async (input: { query: string; source: "off" | "usda"; limit?: number }) => {
        requireAdmin();
        const base = ["yoğurtlu", "közlenmiş", "tam tahıllı", "light", "ev yapımı"];
        const foods: FoodDTO[] = base.slice(0, input.limit ?? 5).map((prefix, i) => ({
          id: nextId("food"),
          name: `${prefix} ${input.query}`,
          nameEn: `${input.query} (${input.source})`,
          aliases: [input.query.toLowerCase()],
          category: "içe aktarılan",
          per100g: { kcal: 90 + i * 27, protein: 3 + i, carbs: 12 + i * 2, fat: 2 + i },
          defaultServingG: 100,
          servings: [{ label: "porsiyon", grams: 100 }],
          source: input.source,
          barcode: null,
          verified: false,
          popularity: 0,
          brand: null,
        }));
        return wait({ foods });
      },

      scans: async (limit = 50) => {
        requireAdmin();
        return wait({
          scans: state.scans.slice(0, limit).map((s) => ({
            id: s.id,
            userId: s.userId,
            username: s.username,
            imageUrl: s.imageUrl,
            detections: s.detections,
            mock: s.mock,
            createdAt: s.createdAt,
          })),
        });
      },

      health: async () => {
        requireAdmin();
        return wait({
          db: "ok" as const,
          vision: { ok: true, mock: true, modelVersion: "mock-1.0.0", latencyMs: 42, url: "http://127.0.0.1:8000" },
          version: "2.0.0-demo",
          uptimeSec: 18_420,
          checkedAt: new Date().toISOString(),
        });
      },
    },
  };

  return client as unknown as ApiClient;
}

function withVolume(state: FakeState) {
  return (t: ProgramTemplateDTO): ProgramTemplateDTO => ({
    ...t,
    weeklyVolume: Object.fromEntries(templateVolume(t.days, state.muscles).map((r) => [r.key, r.weeklySets])),
  });
}

/** The scan gallery needs to know which detection was finally logged. */
export function fakeScanDetail(state: FakeState, id: string): FakeScan | null {
  return state.scans.find((s) => s.id === id) ?? null;
}

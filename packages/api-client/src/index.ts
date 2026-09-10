import type {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  AdminUserDTO,
  AuthTokens,
  BodyEntryDTO,
  BodyEntryInput,
  BodySummary,
  BodyTrends,
  CompleteWorkoutInput,
  CreateMealEntryInput,
  DashboardDTO,
  DietTargetDTO,
  ExerciseDTO,
  ExerciseInput,
  FoodDTO,
  FoodInput,
  FoodSearchResponse,
  GoalDTO,
  GoalInput,
  GoalPreview,
  GoalView,
  HomeDTO,
  LoginResponse,
  MascotMessage,
  MascotTemplateDTO,
  Meal,
  MealEntryDTO,
  MuscleDTO,
  NutritionDayView,
  ProgramDTO,
  ProgramInput,
  ProgramTemplateDTO,
  ProgramTemplateInput,
  ProgramView,
  Recalibration,
  RecoveryView,
  ScanResultDTO,
  SettingsDTO,
  SystemHealth,
  Totals,
  TrainingStats,
  UpdateMeInput,
  UserDTO,
  WeekNutrition,
  WeeklyReportDTO,
  WeeklyReportSummary,
  WeighInDTO,
  WeighInInput,
  WorkoutLogDTO,
} from "@fitfloow/core";
import { createTransport, type ApiClientOptions, type RequestOptions, type Transport } from "./http";

export * from "./http";

export type ScanImage =
  | { uri: string; name?: string; type?: string } // React Native file object
  | Blob
  | File;

/**
 * Typed client for the FitFloow API. Every method maps 1:1 to docs/plan/02-api-contract.md.
 * Backend agents implement these routes; frontend agents call these methods (never raw fetch).
 */
export function createApiClient(options: ApiClientOptions) {
  const t: Transport = createTransport(options);
  const tokens = options.tokens;
  const r = <T>(path: string, opts?: RequestOptions) => t.request<T>(path, opts);

  return {
    transport: t,

    auth: {
      async login(username: string, password: string): Promise<LoginResponse> {
        const cookie = options.authMode === "cookie";
        const res = await r<LoginResponse>(`/auth/login${cookie ? "?cookie=1" : ""}`, {
          body: { username, password },
          auth: false,
        });
        if (!cookie && tokens) await tokens.setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
        return res;
      },
      async refresh(refreshToken?: string): Promise<AuthTokens> {
        const rt = refreshToken ?? (await tokens?.getRefreshToken()) ?? undefined;
        const res = await r<AuthTokens>("/auth/refresh", { body: rt ? { refreshToken: rt } : {}, auth: false });
        if (options.authMode !== "cookie" && tokens) await tokens.setTokens(res);
        return res;
      },
      async logout(): Promise<void> {
        const rt = (await tokens?.getRefreshToken()) ?? undefined;
        try {
          await r<void>("/auth/logout", { body: rt ? { refreshToken: rt } : {} });
        } finally {
          await tokens?.clear();
        }
      },
      me: () => r<{ user: UserDTO }>("/auth/me"),
    },

    me: {
      update: (input: UpdateMeInput) => r<{ user: UserDTO }>("/me", { method: "PATCH", body: input }),
      changePassword: (currentPassword: string, newPassword: string) =>
        r<void>("/me/password", { method: "PATCH", body: { currentPassword, newPassword } }),
    },

    catalog: {
      muscles: () => r<{ muscles: MuscleDTO[] }>("/muscles"),
      exercises: (q?: string) => r<{ exercises: ExerciseDTO[] }>("/exercises", { query: { q } }),
    },

    training: {
      program: () => r<ProgramView>("/program"),
      updateProgram: (input: ProgramInput) => r<{ program: ProgramDTO }>("/program", { method: "PUT", body: input }),
      jump: (index: number) => r<{ program: ProgramDTO }>("/program/jump", { body: { index } }),
      complete: (input: CompleteWorkoutInput) =>
        r<{ log: WorkoutLogDTO; program: ProgramDTO }>("/program/complete", { body: input }),
      skip: (reason?: string) => r<{ log: WorkoutLogDTO; program: ProgramDTO }>("/program/skip", { body: { reason } }),
      undoLast: () => r<{ program: ProgramDTO }>("/program/undo-last", { method: "POST", body: {} }),
      workouts: (q?: { from?: string; to?: string; limit?: number; before?: string }) =>
        r<{ logs: WorkoutLogDTO[] }>("/workouts", { query: q }),
      workout: (id: string) => r<{ log: WorkoutLogDTO }>(`/workouts/${id}`),
      updateWorkout: (id: string, input: Partial<CompleteWorkoutInput>) =>
        r<{ log: WorkoutLogDTO }>(`/workouts/${id}`, { method: "PATCH", body: input }),
      deleteWorkout: (id: string) => r<void>(`/workouts/${id}`, { method: "DELETE" }),
      recovery: () => r<RecoveryView>("/recovery"),
      stats: (weeks = 8) => r<TrainingStats>("/training/stats", { query: { weeks } }),
    },

    body: {
      entries: (limit?: number) =>
        r<{ entries: BodyEntryDTO[]; profile: { gender: UserDTO["gender"]; heightCm: number | null } }>("/body/entries", {
          query: { limit },
        }),
      createEntry: (input: BodyEntryInput) => r<{ entry: BodyEntryDTO }>("/body/entries", { body: input }),
      updateEntry: (id: string, input: Partial<BodyEntryInput>) =>
        r<{ entry: BodyEntryDTO }>(`/body/entries/${id}`, { method: "PATCH", body: input }),
      deleteEntry: (id: string) => r<void>(`/body/entries/${id}`, { method: "DELETE" }),
      weighIns: (days = 90) => r<{ weighIns: WeighInDTO[] }>("/body/weighins", { query: { days } }),
      createWeighIn: (input: WeighInInput) => r<{ weighIn: WeighInDTO }>("/body/weighins", { body: input }),
      deleteWeighIn: (id: string) => r<void>(`/body/weighins/${id}`, { method: "DELETE" }),
      trends: (days = 90) => r<BodyTrends>("/body/trends", { query: { days } }),
      summary: () => r<BodySummary>("/body/summary"),
    },

    goals: {
      current: () => r<GoalView>("/goals/current"),
      preview: (input: GoalInput) => r<GoalPreview>("/goals/preview", { body: input }),
      create: (input: GoalInput) => r<{ goal: GoalDTO }>("/goals", { body: input }),
      update: (input: Partial<GoalInput>) => r<{ goal: GoalDTO }>("/goals/current", { method: "PATCH", body: input }),
      recalibrate: () => r<{ goal: GoalDTO; recalibration: Recalibration }>("/goals/current/recalibrate", { method: "POST", body: {} }),
      complete: () => r<{ goal: GoalDTO }>("/goals/current/complete", { method: "POST", body: {} }),
      abandon: () => r<{ goal: GoalDTO }>("/goals/current/abandon", { method: "POST", body: {} }),
    },

    reports: {
      weekly: (week?: string) => r<WeeklyReportDTO>("/reports/weekly", { query: { week } }),
      history: (limit = 12) => r<{ weeks: WeeklyReportSummary[] }>("/reports/weekly/history", { query: { limit } }),
      home: () => r<HomeDTO>("/reports/home"),
    },

    nutrition: {
      day: (date?: string) => r<NutritionDayView>("/nutrition/day", { query: { date } }),
      addEntry: (input: CreateMealEntryInput) => r<{ entry: MealEntryDTO; dayTotals: Totals }>("/nutrition/entries", { body: input }),
      updateEntry: (id: string, input: { grams?: number; meal?: Meal }) =>
        r<{ entry: MealEntryDTO; dayTotals: Totals }>(`/nutrition/entries/${id}`, { method: "PATCH", body: input }),
      deleteEntry: (id: string) => r<void>(`/nutrition/entries/${id}`, { method: "DELETE" }),
      search: (q: string, opts?: { limit?: number; remote?: boolean }) =>
        r<FoodSearchResponse>("/nutrition/foods/search", { query: { q, limit: opts?.limit, remote: opts?.remote ? 1 : undefined } }),
      food: (id: string) => r<{ food: FoodDTO }>(`/nutrition/foods/${id}`),
      createFood: (input: FoodInput) => r<{ food: FoodDTO }>("/nutrition/foods", { body: input }),
      barcode: (code: string) => r<{ food: FoodDTO | null }>(`/nutrition/foods/barcode/${encodeURIComponent(code)}`),
      recent: () => r<{ foods: FoodDTO[] }>("/nutrition/recent"),
      scan: (image: ScanImage, signal?: AbortSignal) => {
        const fd = new FormData();
        // React Native accepts {uri,name,type}; browsers accept Blob/File.
        fd.append("image", image as unknown as Blob, (image as { name?: string }).name ?? "scan.jpg");
        return r<ScanResultDTO>("/nutrition/scan", { method: "POST", formData: fd, signal });
      },
      week: (week?: string) => r<WeekNutrition>("/nutrition/week", { query: { week } }),
      target: () => r<DietTargetDTO>("/nutrition/target"),
      setTarget: (input: { mode: "auto" | "manual"; calories?: number; protein?: number; carbs?: number; fat?: number }) =>
        r<DietTargetDTO>("/nutrition/target", { method: "PUT", body: input }),
    },

    mascot: {
      message: (context: "home" | "report" | "scan" | "workout" | "body" | "goal") =>
        r<MascotMessage>("/mascot/message", { query: { context } }),
    },

    admin: {
      dashboard: () => r<DashboardDTO>("/admin/dashboard"),
      users: (q?: string) => r<{ users: AdminUserDTO[] }>("/admin/users", { query: { q } }),
      user: (id: string) => r<{ user: AdminUserDTO }>(`/admin/users/${id}`),
      createUser: (input: AdminCreateUserInput) => r<{ user: AdminUserDTO }>("/admin/users", { body: input }),
      updateUser: (id: string, input: AdminUpdateUserInput) =>
        r<{ user: AdminUserDTO }>(`/admin/users/${id}`, { method: "PATCH", body: input }),
      deleteUser: (id: string) => r<void>(`/admin/users/${id}`, { method: "DELETE" }),
      userOverview: (id: string) =>
        r<{
          user: AdminUserDTO;
          program: ProgramDTO | null;
          latestBody: BodyEntryDTO | null;
          goal: GoalDTO | null;
          lastWorkouts: WorkoutLogDTO[];
          weekReport: WeeklyReportDTO | null;
        }>(`/admin/users/${id}/overview`),
      assignProgram: (id: string, templateId: string) =>
        r<{ program: ProgramDTO }>(`/admin/users/${id}/assign-program`, { body: { templateId } }),
      resetPassword: (id: string, password: string) => r<void>(`/admin/users/${id}/reset-password`, { body: { password } }),

      settings: () => r<SettingsDTO>("/admin/settings"),
      updateSettings: (input: SettingsDTO) => r<SettingsDTO>("/admin/settings", { method: "PUT", body: input }),

      muscles: () => r<{ muscles: MuscleDTO[] }>("/admin/muscles"),
      createMuscle: (input: Omit<MuscleDTO, "order"> & { order?: number }) => r<{ muscle: MuscleDTO }>("/admin/muscles", { body: input }),
      updateMuscle: (key: string, input: Partial<Omit<MuscleDTO, "key">>) =>
        r<{ muscle: MuscleDTO }>(`/admin/muscles/${key}`, { method: "PATCH", body: input }),
      deleteMuscle: (key: string) => r<void>(`/admin/muscles/${key}`, { method: "DELETE" }),
      reorderMuscles: (keys: string[]) => r<{ muscles: MuscleDTO[] }>("/admin/muscles/order", { method: "PUT", body: { keys } }),

      exercises: (q?: { q?: string; muscle?: string }) => r<{ exercises: ExerciseDTO[] }>("/admin/exercises", { query: q }),
      createExercise: (input: ExerciseInput) => r<{ exercise: ExerciseDTO }>("/admin/exercises", { body: input }),
      updateExercise: (id: string, input: Partial<ExerciseInput>) =>
        r<{ exercise: ExerciseDTO }>(`/admin/exercises/${id}`, { method: "PATCH", body: input }),
      deleteExercise: (id: string) => r<void>(`/admin/exercises/${id}`, { method: "DELETE" }),

      templates: () => r<{ templates: ProgramTemplateDTO[] }>("/admin/program-templates"),
      template: (id: string) => r<{ template: ProgramTemplateDTO }>(`/admin/program-templates/${id}`),
      createTemplate: (input: ProgramTemplateInput) => r<{ template: ProgramTemplateDTO }>("/admin/program-templates", { body: input }),
      updateTemplate: (id: string, input: Partial<ProgramTemplateInput>) =>
        r<{ template: ProgramTemplateDTO }>(`/admin/program-templates/${id}`, { method: "PATCH", body: input }),
      deleteTemplate: (id: string) => r<void>(`/admin/program-templates/${id}`, { method: "DELETE" }),
      duplicateTemplate: (id: string) =>
        r<{ template: ProgramTemplateDTO }>(`/admin/program-templates/${id}/duplicate`, { method: "POST", body: {} }),

      mascotMessages: () => r<{ messages: MascotTemplateDTO[] }>("/admin/mascot-messages"),
      createMascotMessage: (input: Omit<MascotTemplateDTO, "id" | "active"> & { active?: boolean }) =>
        r<{ message: MascotTemplateDTO }>("/admin/mascot-messages", { body: input }),
      updateMascotMessage: (id: string, input: Partial<Omit<MascotTemplateDTO, "id" | "key">>) =>
        r<{ message: MascotTemplateDTO }>(`/admin/mascot-messages/${id}`, { method: "PATCH", body: input }),
      deleteMascotMessage: (id: string) => r<void>(`/admin/mascot-messages/${id}`, { method: "DELETE" }),
      resetMascotMessages: () => r<{ messages: MascotTemplateDTO[] }>("/admin/mascot-messages/reset", { method: "POST", body: {} }),

      foods: (q?: { q?: string; limit?: number; source?: string }) => r<{ foods: FoodDTO[]; total: number }>("/admin/foods", { query: q }),
      createFood: (input: FoodInput) => r<{ food: FoodDTO }>("/admin/foods", { body: input }),
      updateFood: (id: string, input: Partial<FoodInput>) => r<{ food: FoodDTO }>(`/admin/foods/${id}`, { method: "PATCH", body: input }),
      deleteFood: (id: string) => r<void>(`/admin/foods/${id}`, { method: "DELETE" }),
      importFoods: (input: { query: string; source: "off" | "usda"; limit?: number }) =>
        r<{ foods: FoodDTO[] }>("/admin/foods/import", { body: input }),

      scans: (limit = 50) =>
        r<{ scans: Array<{ id: string; userId: string; username: string; imageUrl: string | null; detections: ScanResultDTO["detections"]; mock: boolean; createdAt: string }> }>(
          "/admin/scans",
          { query: { limit } }
        ),
      health: () => r<SystemHealth>("/admin/system/health"),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

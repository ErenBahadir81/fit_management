/**
 * Seed data for the in-memory fake API (NEXT_PUBLIC_API_FAKE=1).
 *
 * Real Turkish domain content, carried over from the v1 catalogue and extended to the v2
 * muscle set, so every screen can be judged with plausible data instead of placeholders.
 * Muscle colours follow a per-region hue family (front = violet, back = blue, arms = amber,
 * core = pink, legs = green) which the volume matrix and recovery charts reuse.
 */
import {
  DEFAULT_MASCOT_MESSAGES,
  DEFAULT_SETTINGS,
  shiftKey,
  trDateKey,
  type AdminUserDTO,
  type DayDTO,
  type ExerciseDTO,
  type FoodDTO,
  type MascotTemplateDTO,
  type MuscleDTO,
  type ProgramTemplateDTO,
  type SettingsDTO,
} from "@fitfloow/core";

export const MUSCLES: MuscleDTO[] = [
  { key: "chest", name: "Göğüs", short: "Göğüs", size: "large", fullRecoveryHours: 48, weeklyTarget: { min: 15, max: 20 }, region: "front", color: "#6d5df6", order: 0, active: true },
  { key: "frontDelt", name: "Ön Omuz", short: "Ön Omz", size: "small", fullRecoveryHours: 36, weeklyTarget: { min: 8, max: 15 }, region: "front", color: "#9186ff", order: 1, active: true },
  { key: "sideDelt", name: "Yan Omuz", short: "Yan Omz", size: "small", fullRecoveryHours: 36, weeklyTarget: { min: 4, max: 8 }, region: "front", color: "#b3acff", order: 2, active: true },
  { key: "lats", name: "Sırt (Lats)", short: "Lats", size: "large", fullRecoveryHours: 48, weeklyTarget: { min: 10, max: 18 }, region: "back", color: "#2e7cf6", order: 3, active: true },
  { key: "traps", name: "Trapez", short: "Trapez", size: "large", fullRecoveryHours: 36, weeklyTarget: { min: 5, max: 10 }, region: "back", color: "#5a9bfa", order: 4, active: true },
  { key: "rearDelt", name: "Arka Omuz", short: "Arka Omz", size: "small", fullRecoveryHours: 36, weeklyTarget: { min: 4, max: 9 }, region: "back", color: "#86b7fc", order: 5, active: true },
  { key: "biceps", name: "Biceps", short: "Biceps", size: "small", fullRecoveryHours: 36, weeklyTarget: { min: 6, max: 12 }, region: "arms", color: "#e8890c", order: 6, active: true },
  { key: "triceps", name: "Triceps", short: "Triceps", size: "small", fullRecoveryHours: 36, weeklyTarget: { min: 6, max: 14 }, region: "arms", color: "#f2a93b", order: 7, active: true },
  { key: "abs", name: "Karın", short: "Karın", size: "small", fullRecoveryHours: 24, weeklyTarget: { min: 4, max: 8 }, region: "core", color: "#e1467c", order: 8, active: true },
  { key: "quads", name: "Ön Bacak", short: "Quad", size: "large", fullRecoveryHours: 72, weeklyTarget: { min: 10, max: 18 }, region: "legs", color: "#0f9f68", order: 9, active: true },
  { key: "hamstrings", name: "Arka Bacak", short: "Hams", size: "large", fullRecoveryHours: 72, weeklyTarget: { min: 8, max: 14 }, region: "legs", color: "#35be86", order: 10, active: true },
  { key: "glutes", name: "Kalça", short: "Kalça", size: "large", fullRecoveryHours: 48, weeklyTarget: { min: 8, max: 14 }, region: "legs", color: "#6bd3a6", order: 11, active: true },
  { key: "calves", name: "Baldır", short: "Baldır", size: "small", fullRecoveryHours: 24, weeklyTarget: { min: 4, max: 10 }, region: "legs", color: "#99e0c2", order: 12, active: true },
];

interface ExSeed {
  name: string;
  muscles: Array<[string, number]>;
  sets: number;
  reps: number;
  metric?: ExerciseDTO["metric"];
  kind?: ExerciseDTO["kind"];
  equipment?: string[];
  instructions?: string;
}

const EX_SEED: ExSeed[] = [
  { name: "Push-up", muscles: [["chest", 1], ["frontDelt", 0.6], ["triceps", 0.5]], sets: 5, reps: 12, equipment: ["vücut ağırlığı"], instructions: "Gövde tek çizgi; dirsekler 45°. Göğüs yere değecek kadar in." },
  { name: "Bench Press", muscles: [["chest", 1], ["frontDelt", 0.5], ["triceps", 0.6]], sets: 4, reps: 8, equipment: ["barbell", "bench"], instructions: "Kürek kemiklerini sıkıştır, bar göğsün alt kısmına insin." },
  { name: "Incline DB Press", muscles: [["chest", 0.9], ["frontDelt", 0.6], ["triceps", 0.4]], sets: 4, reps: 10, equipment: ["dumbbell", "bench"] },
  { name: "DB Fly", muscles: [["chest", 0.9]], sets: 4, reps: 12, equipment: ["dumbbell"], instructions: "Dirsekler hafif bükülü sabit kalsın; hareketi göğüsten başlat." },
  { name: "Dips", muscles: [["chest", 0.8], ["triceps", 1], ["frontDelt", 0.5]], sets: 4, reps: 10, equipment: ["paralel bar"] },
  { name: "HSPU", muscles: [["frontDelt", 1], ["triceps", 0.7], ["traps", 0.5]], sets: 4, reps: 6, equipment: ["duvar"], instructions: "Amuda kalk, başını yere kontrollü indir. Karın sıkı." },
  { name: "Pike Push-up", muscles: [["frontDelt", 0.9], ["triceps", 0.5], ["chest", 0.3]], sets: 4, reps: 8, equipment: ["vücut ağırlığı"] },
  { name: "Lateral Raise", muscles: [["sideDelt", 1]], sets: 3, reps: 15, equipment: ["dumbbell"], instructions: "Omuz hizasına kadar; trapeze kaçırma." },
  { name: "Face Pull", muscles: [["rearDelt", 1], ["traps", 0.5]], sets: 3, reps: 15, equipment: ["kablo", "lastik"] },
  { name: "Pull-up", muscles: [["lats", 1], ["biceps", 0.6], ["rearDelt", 0.3]], sets: 5, reps: 8, equipment: ["bar"], instructions: "Tam asılıştan çeneyi barın üstüne. Salınım yok." },
  { name: "Barbell Row", muscles: [["lats", 0.9], ["traps", 0.6], ["biceps", 0.4], ["rearDelt", 0.4]], sets: 4, reps: 10, equipment: ["barbell"] },
  { name: "Lat Pulldown", muscles: [["lats", 0.9], ["biceps", 0.5]], sets: 4, reps: 12, equipment: ["makine"] },
  { name: "Shrug", muscles: [["traps", 1]], sets: 3, reps: 15, equipment: ["dumbbell", "barbell"] },
  { name: "Barbell Curl", muscles: [["biceps", 1]], sets: 3, reps: 12, equipment: ["barbell"] },
  { name: "Hammer Curl", muscles: [["biceps", 0.9]], sets: 3, reps: 12, equipment: ["dumbbell"] },
  { name: "Triceps Pushdown", muscles: [["triceps", 1]], sets: 3, reps: 14, equipment: ["kablo"] },
  { name: "Leg Raises", muscles: [["abs", 1]], sets: 3, reps: 15, equipment: ["bar", "mat"] },
  { name: "Squat", muscles: [["quads", 1], ["glutes", 0.7], ["hamstrings", 0.4]], sets: 4, reps: 12, equipment: ["barbell"], instructions: "Kalça ve diz aynı anda; sırt nötr, topuk yerde." },
  { name: "Romanian Deadlift", muscles: [["hamstrings", 1], ["glutes", 0.8], ["lats", 0.3]], sets: 4, reps: 10, equipment: ["barbell"] },
  { name: "Lunge", muscles: [["quads", 0.8], ["glutes", 0.8], ["hamstrings", 0.4]], sets: 3, reps: 12, equipment: ["dumbbell"] },
  { name: "Pistol Squat", muscles: [["quads", 1], ["glutes", 0.6]], sets: 3, reps: 8, equipment: ["vücut ağırlığı"] },
  { name: "Hip Thrust", muscles: [["glutes", 1], ["hamstrings", 0.5]], sets: 4, reps: 12, equipment: ["barbell", "bench"] },
  { name: "Calf Raise", muscles: [["calves", 1]], sets: 4, reps: 20, equipment: ["vücut ağırlığı"] },
  { name: "Handstand", muscles: [["frontDelt", 0.8], ["sideDelt", 0.5], ["traps", 0.5]], sets: 5, reps: 30, metric: "time", equipment: ["duvar"] },
  { name: "Plank", muscles: [["abs", 1]], sets: 3, reps: 45, metric: "time", equipment: ["mat"] },
  { name: "Hollow Hold", muscles: [["abs", 0.9]], sets: 3, reps: 30, metric: "time", equipment: ["mat"] },
  { name: "Wall Sit", muscles: [["quads", 0.8]], sets: 3, reps: 45, metric: "time", equipment: ["duvar"] },
  { name: "Mobility Flow", muscles: [], sets: 1, reps: 1, metric: "stretch", kind: "mobility", equipment: ["mat"], instructions: "Kalça açıcı, torasik rotasyon, omuz dislokasyon — 8'er tekrar." },
];

export const EXERCISES: ExerciseDTO[] = EX_SEED.map((e, i) => ({
  id: `ex_${String(i + 1).padStart(3, "0")}`,
  name: e.name,
  muscles: e.muscles.map(([key, load]) => ({ key, load })),
  defaultSets: e.sets,
  defaultReps: e.reps,
  metric: e.metric ?? "reps",
  kind: e.kind ?? "strength",
  equipment: e.equipment ?? [],
  instructions: e.instructions ?? "",
  active: true,
}));

function ex(name: string, sets: number, reps: number, rir: number | null = 2) {
  const found = EXERCISES.find((e) => e.name === name);
  return {
    name,
    muscles: found?.muscles ?? [],
    targetSets: sets,
    targetReps: reps,
    targetRIR: rir,
    metric: found?.metric ?? ("reps" as const),
  };
}

const PPL_DAYS: DayDTO[] = [
  { order: 1, title: "Push A", focus: "Göğüs & Ön Omuz", kind: "strength", exercises: [ex("Bench Press", 4, 8), ex("Incline DB Press", 3, 10), ex("Lateral Raise", 3, 15, 1), ex("Triceps Pushdown", 3, 14, 1)], run: null, swim: null },
  { order: 2, title: "Pull A", focus: "Sırt & Biceps", kind: "strength", exercises: [ex("Pull-up", 4, 8), ex("Barbell Row", 4, 10), ex("Face Pull", 3, 15, 1), ex("Barbell Curl", 3, 12, 1)], run: null, swim: null },
  { order: 3, title: "Bacak A", focus: "Quad ağırlıklı", kind: "strength", exercises: [ex("Squat", 4, 8), ex("Lunge", 3, 12), ex("Calf Raise", 4, 20, 0), ex("Plank", 3, 45, null)], run: null, swim: null },
  { order: 4, title: "Kondisyon", focus: "Koşu & karın", kind: "run", exercises: [ex("Leg Raises", 3, 15, 1), ex("Hollow Hold", 3, 30, null)], run: { targetKm: 6, targetMin: 34, label: "Tempolu koşu" }, swim: null },
  { order: 5, title: "Push B", focus: "Omuz ağırlıklı", kind: "strength", exercises: [ex("HSPU", 4, 6), ex("DB Fly", 4, 12), ex("Lateral Raise", 3, 15, 1), ex("Dips", 3, 10)], run: null, swim: null },
  { order: 6, title: "Pull B & Bacak", focus: "Hamstring & lats", kind: "strength", exercises: [ex("Romanian Deadlift", 4, 10), ex("Lat Pulldown", 4, 12), ex("Hip Thrust", 3, 12), ex("Hammer Curl", 3, 12, 1)], run: null, swim: null },
  { order: 7, title: "Dinlenme", focus: "Mobilite & yürüyüş", kind: "rest", exercises: [ex("Mobility Flow", 1, 1, null)], run: null, swim: null },
];

const FULLBODY_DAYS: DayDTO[] = [
  { order: 1, title: "Full Body A", focus: "Bileşik hareketler", kind: "strength", exercises: [ex("Squat", 3, 10), ex("Bench Press", 3, 10), ex("Barbell Row", 3, 10), ex("Plank", 3, 45, null)], run: null, swim: null },
  { order: 2, title: "Yüzme", focus: "Aktif toparlanma", kind: "swim", exercises: [], run: null, swim: { targetKm: 1.2, targetMin: 40, label: "Serbest" } },
  { order: 3, title: "Full Body B", focus: "Kalça & sırt", kind: "strength", exercises: [ex("Romanian Deadlift", 3, 10), ex("Pull-up", 3, 8), ex("Hip Thrust", 3, 12), ex("Lateral Raise", 3, 15, 1)], run: null, swim: null },
  { order: 4, title: "Dinlenme", focus: "Yürüyüş", kind: "rest", exercises: [], run: null, swim: null },
];

const CALISTHENICS_DAYS: DayDTO[] = [
  { order: 1, title: "İtiş", focus: "Göğüs & triceps", kind: "strength", exercises: [ex("Push-up", 5, 12), ex("Dips", 4, 10), ex("Pike Push-up", 3, 8)], run: null, swim: null },
  { order: 2, title: "Çekiş", focus: "Sırt & biceps", kind: "strength", exercises: [ex("Pull-up", 5, 8), ex("Barbell Row", 3, 10), ex("Face Pull", 3, 15, 1)], run: null, swim: null },
  { order: 3, title: "Bacak & Karın", focus: "Tek bacak gücü", kind: "strength", exercises: [ex("Pistol Squat", 3, 8), ex("Wall Sit", 3, 45, null), ex("Leg Raises", 3, 15, 1)], run: null, swim: null },
  { order: 4, title: "Denge", focus: "Handstand çalışması", kind: "strength", exercises: [ex("Handstand", 5, 30, null), ex("Hollow Hold", 3, 30, null), ex("Mobility Flow", 1, 1, null)], run: null, swim: null },
  { order: 5, title: "Dinlenme", focus: "", kind: "rest", exercises: [], run: null, swim: null },
];

export const TEMPLATES: ProgramTemplateDTO[] = [
  {
    id: "tpl_ppl7",
    name: "Push / Pull / Bacak — 7 gün",
    description: "Klasik PPL döngüsü; bir kondisyon günü ve bir dinlenme günü içerir. Orta-ileri seviye.",
    days: PPL_DAYS,
    tags: ["ppl", "salon", "orta"],
    cycleLength: PPL_DAYS.length,
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-08-30T14:20:00.000Z",
  },
  {
    id: "tpl_full4",
    name: "Full Body 4 gün",
    description: "Haftada 2-3 antrenman hedefleyenler için kısa döngü. Yüzme günüyle aktif toparlanma.",
    days: FULLBODY_DAYS,
    tags: ["full-body", "başlangıç"],
    cycleLength: FULLBODY_DAYS.length,
    createdAt: "2026-07-02T11:30:00.000Z",
    updatedAt: "2026-07-02T11:30:00.000Z",
  },
  {
    id: "tpl_cali5",
    name: "Kalistenik 5 gün",
    description: "Ekipmansız; handstand ve pistol squat progresyonlarına odaklı.",
    days: CALISTHENICS_DAYS,
    tags: ["kalistenik", "ev", "ileri"],
    cycleLength: CALISTHENICS_DAYS.length,
    createdAt: "2026-08-11T08:15:00.000Z",
    updatedAt: "2026-09-01T18:05:00.000Z",
  },
];

const today = trDateKey();

export const USERS: AdminUserDTO[] = [
  { id: "usr_eren", username: "eren", displayName: "Eren Yılmaz", role: "admin", gender: "male", heightCm: 183, birthDate: "1996-04-18", activityLevel: "moderate", measurementDay: 0, mascotEnabled: true, createdAt: "2025-11-02T07:12:00.000Z", lastSeenAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(), hasProgram: true, goalStatus: "active" },
  { id: "usr_inci", username: "inci", displayName: "İnci Demir", role: "user", gender: "female", heightCm: 166, birthDate: "1998-11-05", activityLevel: "light", measurementDay: 1, mascotEnabled: true, createdAt: "2025-11-02T07:14:00.000Z", lastSeenAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), hasProgram: true, goalStatus: "active" },
  { id: "usr_kaan", username: "kaan", displayName: "Kaan Aksoy", role: "user", gender: "male", heightCm: 178, birthDate: "1993-02-22", activityLevel: "active", measurementDay: 0, mascotEnabled: true, createdAt: "2026-01-19T09:41:00.000Z", lastSeenAt: new Date(Date.now() - 26 * 3600 * 1000).toISOString(), hasProgram: true, goalStatus: "completed" },
  { id: "usr_selin", username: "selin", displayName: "Selin Korkmaz", role: "user", gender: "female", heightCm: 171, birthDate: "2000-07-30", activityLevel: "moderate", measurementDay: 3, mascotEnabled: false, createdAt: "2026-03-08T16:02:00.000Z", lastSeenAt: new Date(Date.now() - 5 * 86400 * 1000).toISOString(), hasProgram: false, goalStatus: null },
  { id: "usr_mert", username: "mert", displayName: "Mert Şahin", role: "user", gender: "male", heightCm: 175, birthDate: "1989-09-12", activityLevel: "sedentary", measurementDay: 0, mascotEnabled: true, createdAt: "2026-05-27T12:55:00.000Z", lastSeenAt: new Date(Date.now() - 19 * 86400 * 1000).toISOString(), hasProgram: true, goalStatus: "abandoned" },
  { id: "usr_zeynep", username: "zeynep", displayName: "Zeynep Arslan", role: "user", gender: "female", heightCm: 160, birthDate: "1995-12-01", activityLevel: "veryActive", measurementDay: 6, mascotEnabled: true, createdAt: "2026-08-04T10:10:00.000Z", lastSeenAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(), hasProgram: true, goalStatus: "active" },
];

/** username → password for the fake login screen. */
export const CREDENTIALS: Record<string, string> = { eren: "fitfloow", admin: "fitfloow" };

interface FoodSeed {
  name: string;
  nameEn: string | null;
  cat: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  serving: number;
  aliases?: string[];
  verified?: boolean;
  brand?: string | null;
  source?: FoodDTO["source"];
}

const FOOD_SEED: FoodSeed[] = [
  { name: "Tavuk göğsü (ızgara)", nameEn: "Grilled chicken breast", cat: "et", kcal: 165, p: 31, c: 0, f: 3.6, serving: 150, aliases: ["chicken_breast", "grilled_chicken"], verified: true },
  { name: "Yumurta (haşlanmış)", nameEn: "Boiled egg", cat: "kahvaltı", kcal: 155, p: 13, c: 1.1, f: 11, serving: 50, aliases: ["egg", "boiled_egg"], verified: true },
  { name: "Beyaz peynir", nameEn: "White cheese", cat: "süt", kcal: 264, p: 17, c: 2.5, f: 21, serving: 30, aliases: ["feta", "white_cheese"], verified: true },
  { name: "Pilav (pirinç)", nameEn: "Rice pilaf", cat: "tahıl", kcal: 130, p: 2.7, c: 28, f: 0.3, serving: 180, aliases: ["rice", "pilaf"], verified: true },
  { name: "Bulgur pilavı", nameEn: "Bulgur pilaf", cat: "tahıl", kcal: 112, p: 4.1, c: 23, f: 0.6, serving: 180, aliases: ["bulgur"], verified: true },
  { name: "Mercimek çorbası", nameEn: "Lentil soup", cat: "çorba", kcal: 63, p: 3.5, c: 9.8, f: 1.3, serving: 250, aliases: ["lentil_soup", "soup"], verified: true },
  { name: "Tam buğday ekmeği", nameEn: "Whole wheat bread", cat: "tahıl", kcal: 247, p: 13, c: 41, f: 3.4, serving: 40, aliases: ["bread", "whole_wheat_bread"], verified: true },
  { name: "Zeytinyağı", nameEn: "Olive oil", cat: "yağ", kcal: 884, p: 0, c: 0, f: 100, serving: 10, aliases: ["olive_oil"], verified: true },
  { name: "Yoğurt (yağsız)", nameEn: "Nonfat yogurt", cat: "süt", kcal: 59, p: 10, c: 3.6, f: 0.4, serving: 200, aliases: ["yogurt", "greek_yogurt"], verified: true },
  { name: "Muz", nameEn: "Banana", cat: "meyve", kcal: 89, p: 1.1, c: 23, f: 0.3, serving: 120, aliases: ["banana"], verified: true },
  { name: "Elma", nameEn: "Apple", cat: "meyve", kcal: 52, p: 0.3, c: 14, f: 0.2, serving: 150, aliases: ["apple"], verified: true },
  { name: "Somon (fırın)", nameEn: "Baked salmon", cat: "balık", kcal: 208, p: 20, c: 0, f: 13, serving: 140, aliases: ["salmon"], verified: true },
  { name: "Nohut yemeği", nameEn: "Chickpea stew", cat: "sebze", kcal: 164, p: 8.9, c: 27, f: 2.6, serving: 220, aliases: ["chickpea", "hummus_dish"] },
  { name: "Menemen", nameEn: "Turkish scrambled eggs", cat: "kahvaltı", kcal: 118, p: 6.4, c: 4.2, f: 8.4, serving: 250, aliases: ["menemen"] },
  { name: "Adana kebap", nameEn: "Adana kebab", cat: "et", kcal: 267, p: 18, c: 2.1, f: 21, serving: 180, aliases: ["kebab", "adana"] },
  { name: "Protein tozu (whey)", nameEn: "Whey protein", cat: "takviye", kcal: 380, p: 78, c: 8, f: 4, serving: 30, aliases: ["whey", "protein_powder"], brand: "Hardline", source: "off" },
  { name: "Badem", nameEn: "Almond", cat: "kuruyemiş", kcal: 579, p: 21, c: 22, f: 50, serving: 25, aliases: ["almond"], verified: true },
  { name: "Simit", nameEn: "Turkish bagel", cat: "fırın", kcal: 307, p: 9.1, c: 55, f: 5.2, serving: 100, aliases: ["simit"] },
];

export const FOODS: FoodDTO[] = FOOD_SEED.map((f, i) => ({
  id: `food_${String(i + 1).padStart(3, "0")}`,
  name: f.name,
  nameEn: f.nameEn,
  aliases: f.aliases ?? [],
  category: f.cat,
  per100g: { kcal: f.kcal, protein: f.p, carbs: f.c, fat: f.f },
  defaultServingG: f.serving,
  servings: [{ label: "porsiyon", grams: f.serving }],
  source: f.source ?? "seed",
  barcode: null,
  verified: f.verified ?? false,
  popularity: 100 - i * 3,
  brand: f.brand ?? null,
}));

export const MASCOT_MESSAGES: MascotTemplateDTO[] = DEFAULT_MASCOT_MESSAGES.map((m, i) => ({
  id: `msg_${String(i + 1).padStart(3, "0")}`,
  key: m.key,
  mood: m.mood,
  variants: [...m.variants],
  active: true,
}));

export const SETTINGS: SettingsDTO = structuredClone(DEFAULT_SETTINGS);

export interface FakeScan {
  id: string;
  userId: string;
  username: string;
  imageUrl: string | null;
  detections: Array<{ label: string; labelTr: string; confidence: number; food: FoodDTO | null; suggestedGrams: number }>;
  mock: boolean;
  createdAt: string;
  loggedFoodId: string | null;
}

function food(name: string): FoodDTO | null {
  return FOODS.find((f) => f.name === name) ?? null;
}

export const SCANS: FakeScan[] = [
  {
    id: "scan_001",
    userId: "usr_eren",
    username: "eren",
    imageUrl: null,
    detections: [
      { label: "grilled_chicken", labelTr: "Izgara tavuk", confidence: 0.91, food: food("Tavuk göğsü (ızgara)"), suggestedGrams: 150 },
      { label: "rice", labelTr: "Pilav", confidence: 0.74, food: food("Pilav (pirinç)"), suggestedGrams: 180 },
    ],
    mock: true,
    createdAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    loggedFoodId: "food_001",
  },
  {
    id: "scan_002",
    userId: "usr_inci",
    username: "inci",
    imageUrl: null,
    detections: [
      { label: "lentil_soup", labelTr: "Mercimek çorbası", confidence: 0.83, food: food("Mercimek çorbası"), suggestedGrams: 250 },
      { label: "bread", labelTr: "Ekmek", confidence: 0.46, food: food("Tam buğday ekmeği"), suggestedGrams: 40 },
    ],
    mock: true,
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    loggedFoodId: "food_006",
  },
  {
    id: "scan_003",
    userId: "usr_zeynep",
    username: "zeynep",
    imageUrl: null,
    detections: [{ label: "menemen", labelTr: "Menemen", confidence: 0.29, food: food("Menemen"), suggestedGrams: 250 }],
    mock: true,
    createdAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    loggedFoodId: null,
  },
  {
    id: "scan_004",
    userId: "usr_kaan",
    username: "kaan",
    imageUrl: null,
    detections: [
      { label: "salmon", labelTr: "Somon", confidence: 0.88, food: food("Somon (fırın)"), suggestedGrams: 140 },
      { label: "salad", labelTr: "Salata", confidence: 0.51, food: null, suggestedGrams: 120 },
    ],
    mock: true,
    createdAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
    loggedFoodId: "food_012",
  },
  {
    id: "scan_005",
    userId: "usr_eren",
    username: "eren",
    imageUrl: null,
    detections: [{ label: "kebab", labelTr: "Kebap", confidence: 0.67, food: food("Adana kebap"), suggestedGrams: 180 }],
    mock: true,
    createdAt: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    loggedFoodId: "food_015",
  },
  {
    id: "scan_006",
    userId: "usr_mert",
    username: "mert",
    imageUrl: null,
    detections: [],
    mock: true,
    createdAt: new Date(Date.now() - 4 * 86400 * 1000).toISOString(),
    loggedFoodId: null,
  },
];

/** Deterministic-ish 14-day activity series ending today. */
export function dashboardSeries(): Array<{ dateKey: string; workouts: number; meals: number; scans: number }> {
  const shape = [
    [3, 11, 2],
    [4, 14, 3],
    [2, 9, 1],
    [5, 16, 4],
    [4, 13, 2],
    [1, 7, 0],
    [3, 12, 2],
    [5, 15, 3],
    [4, 17, 5],
    [2, 10, 1],
    [4, 14, 2],
    [6, 18, 4],
    [3, 12, 3],
    [4, 15, 2],
  ];
  return shape.map(([workouts, meals, scans], i) => ({
    dateKey: shiftKey(today, i - 13),
    workouts,
    meals,
    scans,
  }));
}

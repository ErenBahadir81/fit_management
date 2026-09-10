import type { ExerciseInput } from "@fitfloow/core";

const L = (keys: string[]) => keys.map((key) => ({ key, load: 1 }));

/** v1 catalog converted to explicit muscle loads (load 1 = one set counts fully). */
export const SEED_EXERCISES: ExerciseInput[] = [
  { name: "Push-up", muscles: L(["chest", "frontDelt", "traps"]), defaultSets: 5, defaultReps: 12, metric: "reps", kind: "strength", equipment: [], instructions: "Vücut düz bir çizgi; göğüs yere yaklaşır, dirsekler 45°." },
  { name: "HSPU", muscles: L(["chest", "frontDelt", "traps"]), defaultSets: 4, defaultReps: 6, metric: "reps", kind: "strength", equipment: ["duvar"], instructions: "Duvar destekli amuda şınav; baş üçgen oluşturacak şekilde yere değer." },
  { name: "Pike Push-up", muscles: L(["frontDelt", "chest", "traps"]), defaultSets: 4, defaultReps: 8, metric: "reps", kind: "strength", equipment: [], instructions: "Kalça yukarıda V pozisyonu; baş yere doğru." },
  { name: "DB Fly", muscles: L(["chest"]), defaultSets: 4, defaultReps: 12, metric: "reps", kind: "strength", equipment: ["dumbbell"], instructions: "Dirsekler hafif bükük, göğsü açarak indir." },
  { name: "Dips", muscles: L(["chest", "frontDelt", "traps"]), defaultSets: 4, defaultReps: 10, metric: "reps", kind: "strength", equipment: ["paralel bar"], instructions: "Öne eğilerek göğsü hedefle." },
  { name: "Lateral Raise", muscles: L(["sideDelt"]), defaultSets: 3, defaultReps: 15, metric: "reps", kind: "strength", equipment: ["dumbbell"], instructions: "Dirsekten hafif bükük, omuz hizasına kadar." },
  { name: "Pull-up", muscles: L(["lats"]), defaultSets: 5, defaultReps: 8, metric: "reps", kind: "strength", equipment: ["bar"], instructions: "Tam açılım, çene bar üstüne." },
  { name: "Row", muscles: L(["lats", "traps"]), defaultSets: 4, defaultReps: 10, metric: "reps", kind: "strength", equipment: ["dumbbell"], instructions: "Sırt düz, dirseği arkaya çek." },
  { name: "Shrug", muscles: L(["traps"]), defaultSets: 3, defaultReps: 15, metric: "reps", kind: "strength", equipment: ["dumbbell"], instructions: "Omuzları kulaklara doğru kaldır, tepede 1 sn tut." },
  { name: "Leg Raises", muscles: L(["abs"]), defaultSets: 3, defaultReps: 15, metric: "reps", kind: "strength", equipment: [], instructions: "Bel yere yapışık, bacaklar düz." },
  { name: "Squat", muscles: L(["legs"]), defaultSets: 4, defaultReps: 12, metric: "reps", kind: "strength", equipment: [], instructions: "Kalça paralelin altına, topuklar yerde." },
  { name: "Lunge", muscles: L(["legs"]), defaultSets: 3, defaultReps: 12, metric: "reps", kind: "strength", equipment: [], instructions: "Ön diz ayak ucunu geçmesin." },
  { name: "Pistol Squat", muscles: L(["legs"]), defaultSets: 3, defaultReps: 8, metric: "reps", kind: "strength", equipment: [], instructions: "Tek bacak; denge için kollar önde." },
  { name: "Calf Raise", muscles: L(["legs"]), defaultSets: 4, defaultReps: 20, metric: "reps", kind: "strength", equipment: [], instructions: "Tepede 1 sn tut, tam açılım." },
  { name: "Handstand", muscles: L(["frontDelt", "sideDelt", "traps"]), defaultSets: 5, defaultReps: 30, metric: "time", kind: "strength", equipment: ["duvar"], instructions: "Saniye bazlı; omuzlar kulaklara doğru itilir." },
  { name: "Plank", muscles: L(["abs"]), defaultSets: 3, defaultReps: 45, metric: "time", kind: "strength", equipment: [], instructions: "Saniye bazlı; kalça düşmesin." },
  { name: "Hollow Hold", muscles: L(["abs"]), defaultSets: 3, defaultReps: 30, metric: "time", kind: "strength", equipment: [], instructions: "Bel yere yapışık, kollar ve bacaklar havada." },
  { name: "Wall Sit", muscles: L(["legs"]), defaultSets: 3, defaultReps: 45, metric: "time", kind: "strength", equipment: ["duvar"], instructions: "Dizler 90°, sırt duvarda." },
  { name: "Stretch", muscles: [], defaultSets: 1, defaultReps: 1, metric: "stretch", kind: "mobility", equipment: [], instructions: "Genel esneme; kas yükü sayılmaz." },
  { name: "Mobility", muscles: [], defaultSets: 1, defaultReps: 1, metric: "stretch", kind: "mobility", equipment: [], instructions: "Eklem hareket açıklığı çalışması." },
];

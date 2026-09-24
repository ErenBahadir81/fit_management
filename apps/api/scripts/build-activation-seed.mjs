#!/usr/bin/env node
/**
 * Builds `src/seed/data/exerciseActivation.v1.ts` from the research evidence file
 * (`src/seed/data/exerciseActivation.v1.evidence.json`).
 *
 * load = plain average of every literature estimate recorded for that exercise–muscle pair,
 * rounded to 0.05; pairs averaging < 0.1 are dropped. An estimate carrying `exclude: "<reason>"`
 * stays in the evidence file for traceability but is not averaged (see `notes.review`).
 * confidence: high = ≥3 estimates and spread ≤ 0.3; medium = ≥2 estimates and spread ≤ 0.5; low = otherwise.
 * Only strength exercises count muscles: a cardio or mobility row with a counted pair is an error.
 *
 * Usage: node apps/api/scripts/build-activation-seed.mjs          (regenerate)
 *        node apps/api/scripts/build-activation-seed.mjs --check  (fail if the .ts is stale or hand-edited)
 * The generated file seeds the exercise catalog (`SEED_EXERCISES`). A live database is revised in the
 * admin panel (Hareketler → kas yükleri); change the evidence file and rerun this to change the seed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "src", "seed", "data");
const evidence = JSON.parse(readFileSync(join(dataDir, "exerciseActivation.v1.evidence.json"), "utf8"));

export const MUSCLE_KEYS = [
  "chest", "frontDelt", "sideDelt", "rearDelt", "traps", "lats", "lowerBack", "biceps", "triceps",
  "forearms", "abs", "obliques", "quads", "hamstrings", "glutes", "adductors", "calves",
];

const round05 = (x) => Math.round(x * 20) / 20;

function confidence(n, spread) {
  if (n >= 3 && spread <= 0.3) return "high";
  if (n >= 2 && spread <= 0.5) return "medium";
  return "low";
}

const KINDS = ["strength", "cardio", "mobility"];

const rows = evidence.exercises.map((ex) => {
  if (!KINDS.includes(ex.kind)) throw new Error(`${ex.name}: unknown kind ${ex.kind}`);
  for (const r of ex.review ?? []) {
    if (!r.date || !r.verdict || !r.summary) throw new Error(`${ex.name}: review entries need date, verdict and summary`);
    for (const id of r.sources ?? []) if (!evidence.sources[id]) throw new Error(`${ex.name}: review cites unknown source ${id}`);
  }
  const muscles = [];
  for (const m of ex.muscles ?? []) {
    if (!MUSCLE_KEYS.includes(m.key)) throw new Error(`${ex.name}: unknown muscle key ${m.key}`);
    for (const e of m.estimates) {
      if (!evidence.sources[e.source]) throw new Error(`${ex.name}/${m.key}: unknown source ${e.source}`);
      if ("exclude" in e && (typeof e.exclude !== "string" || !e.exclude.trim()))
        throw new Error(`${ex.name}/${m.key}/${e.source}: exclude must be a reason`);
    }
    const used = m.estimates.filter((e) => !("exclude" in e));
    if (used.length === 0) continue;
    const values = used.map((e) => e.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const load = Math.min(1, round05(avg));
    if (load < 0.1) continue;
    const spread = Math.round((Math.max(...values) - Math.min(...values)) * 100) / 100;
    muscles.push({
      key: m.key,
      load,
      confidence: { level: confidence(values.length, spread), n: values.length, spread },
      sources: [...new Set(used.map((e) => e.source))],
    });
  }
  if (ex.kind !== "strength" && muscles.length > 0) throw new Error(`${ex.name}: a ${ex.kind} exercise must not count muscles`);
  muscles.sort((a, b) => b.load - a.load || MUSCLE_KEYS.indexOf(a.key) - MUSCLE_KEYS.indexOf(b.key));
  return { slug: ex.slug, name: ex.name, nameTr: ex.nameTr ?? ex.name, equipment: ex.equipment ?? [], metric: ex.metric, kind: ex.kind,
    defaultSets: ex.defaultSets, defaultReps: ex.defaultReps, instructions: ex.instructions ?? "", muscles };
});

const usedSources = new Set(rows.flatMap((r) => r.muscles.flatMap((m) => m.sources)));
const sources = Object.fromEntries(Object.entries(evidence.sources).filter(([id]) => usedSources.has(id)).sort(([a], [b]) => a.localeCompare(b)));

const q = (s) => JSON.stringify(s);
const muscleLine = (m) =>
  `      { key: ${q(m.key)}, load: ${m.load}, confidence: { level: ${q(m.confidence.level)}, n: ${m.confidence.n}, spread: ${m.confidence.spread} }, sources: [${m.sources.map(q).join(", ")}] },`;
const rowText = (r) => [
  `  {`,
  `    slug: ${q(r.slug)}, name: ${q(r.name)}, nameTr: ${q(r.nameTr)},`,
  `    kind: ${q(r.kind)}, metric: ${q(r.metric)}, defaultSets: ${r.defaultSets}, defaultReps: ${r.defaultReps}, equipment: [${r.equipment.map(q).join(", ")}],`,
  `    instructions: ${q(r.instructions)},`,
  r.muscles.length ? `    muscles: [\n${r.muscles.map(muscleLine).join("\n")}\n    ],` : `    muscles: [],`,
  `  },`,
].join("\n");

const out = `/**
 * Exercise → muscle activation catalog, v1 (literature average).
 *
 * \`load\` is how much of ONE working set counts toward that muscle's weekly volume (0..1):
 * the plain average of the estimates recorded for the pair in \`exerciseActivation.v1.evidence.json\`
 * (ExRx role mapping, fractional set-counting literature, EMG ratios), rounded to 0.05.
 * \`confidence\`: n = number of estimates, spread = max − min; high = n ≥ 3 and spread ≤ 0.3,
 * medium = n ≥ 2 and spread ≤ 0.5, low = anything else.
 *
 * Approximate literature data, meant to be revised (e.g. with a gym).
 *
 * Generated by \`apps/api/scripts/build-activation-seed.mjs\` — do not edit by hand. It seeds the
 * exercise catalog (\`SEED_EXERCISES\`); a live database is revised in the admin panel (e.g. after a
 * gym review). To change the seed itself, add estimates to the evidence file and rerun the script.
 */

export type ActivationMuscleKey =
${MUSCLE_KEYS.map((k) => `  | ${q(k)}`).join("\n")};

export const ACTIVATION_MUSCLE_KEYS: readonly ActivationMuscleKey[] = [${MUSCLE_KEYS.map(q).join(", ")}];

export type ActivationConfidence = "high" | "medium" | "low";

export interface ActivationSource {
  title: string;
  url: string;
  kind: "exrx" | "emg" | "volume-method" | "review";
  year?: number;
}

export interface MuscleActivation {
  key: ActivationMuscleKey;
  load: number;
  confidence: { level: ActivationConfidence; n: number; spread: number };
  sources: string[];
}

export interface ExerciseActivation {
  slug: string;
  name: string;
  nameTr: string;
  kind: "strength" | "cardio" | "mobility";
  metric: "reps" | "time" | "stretch";
  defaultSets: number;
  defaultReps: number;
  equipment: string[];
  instructions: string;
  muscles: MuscleActivation[];
}

export const ACTIVATION_SOURCES: Record<string, ActivationSource> = {
${Object.entries(sources).map(([id, s]) => `  ${q(id)}: { title: ${q(s.title)}, url: ${q(s.url)}, kind: ${q(s.kind)}${s.year ? `, year: ${s.year}` : ""} },`).join("\n")}
};

export const EXERCISE_ACTIVATION_V1: ExerciseActivation[] = [
${rows.map(rowText).join("\n")}
];
`;
const target = join(dataDir, "exerciseActivation.v1.ts");
const summary = `${rows.length} exercises, ${Object.keys(sources).length} sources, ${rows.reduce((a, r) => a + r.muscles.length, 0)} pairs`;
if (process.argv.includes("--check")) {
  // Used by the API tests: the generated file must be exactly what the evidence file produces.
  if (readFileSync(target, "utf8") !== out) {
    console.error("exerciseActivation.v1.ts is out of date or was edited by hand; run node apps/api/scripts/build-activation-seed.mjs");
    process.exit(1);
  }
  console.log(`up to date (${summary})`);
} else {
  writeFileSync(target, out);
  console.log(`wrote ${summary}`);
}

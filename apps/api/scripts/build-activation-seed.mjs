#!/usr/bin/env node
/**
 * Builds `src/seed/data/exerciseActivation.v1.ts` from the research evidence file
 * (`src/seed/data/exerciseActivation.v1.evidence.json`).
 *
 * load = plain average of every literature estimate recorded for that exercise–muscle pair,
 * rounded to 0.05; pairs averaging < 0.1 are dropped.
 * confidence: high = ≥3 estimates and spread ≤ 0.3; medium = ≥2 estimates and spread ≤ 0.5; low = otherwise.
 *
 * Usage: node apps/api/scripts/build-activation-seed.mjs
 * After a gym revision, edit the .ts file directly; rerun this only when the evidence file changes.
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

const rows = evidence.exercises.map((ex) => {
  const muscles = [];
  for (const m of ex.muscles ?? []) {
    if (!MUSCLE_KEYS.includes(m.key)) throw new Error(`${ex.name}: unknown muscle key ${m.key}`);
    const values = m.estimates.map((e) => e.value);
    for (const e of m.estimates) if (!evidence.sources[e.source]) throw new Error(`${ex.name}/${m.key}: unknown source ${e.source}`);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const load = Math.min(1, round05(avg));
    if (load < 0.1) continue;
    const spread = Math.round((Math.max(...values) - Math.min(...values)) * 100) / 100;
    muscles.push({
      key: m.key,
      load,
      confidence: { level: confidence(values.length, spread), n: values.length, spread },
      sources: [...new Set(m.estimates.map((e) => e.source))],
    });
  }
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
 * This is approximate data meant to be revised by hand (e.g. with a gym). Edit rows here directly;
 * \`apps/api/scripts/build-activation-seed.mjs\` regenerates this file only from the evidence file.
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
writeFileSync(join(dataDir, "exerciseActivation.v1.ts"), out);
console.log(`wrote ${rows.length} exercises, ${Object.keys(sources).length} sources, ${rows.reduce((a, r) => a + r.muscles.length, 0)} pairs`);

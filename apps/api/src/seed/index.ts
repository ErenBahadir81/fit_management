/**
 * Idempotent, layered seed + migration (owner: B1). Called at boot (SEED_ON_BOOT) and by `pnpm seed`.
 * Each step is isolated and never destroys existing data — see docs/plan/01-data-model.md §Migration.
 */
export async function runSeed(): Promise<void> {
  // B1 implements: users (eren/inci), settings singleton, muscles, exercises, templates, foods, mascot messages, migrations.
}

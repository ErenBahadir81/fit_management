import { describe, expect, it } from "vitest";
import * as core from "../index";
import * as nutrition from "./index";

/**
 * `packages/core/src/index.ts` re-exports every domain with `export *`. When two domains export the
 * same name TypeScript resolves it to *nothing* rather than erroring, so an importer silently gets
 * `undefined`. This guards the nutrition surface against that; a failure names the clashing symbol.
 */
describe("core barrel", () => {
  it("re-exports every nutrition symbol unambiguously", () => {
    const names = Object.keys(nutrition);
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) expect((core as Record<string, unknown>)[name], name).toBeDefined();
  });
});

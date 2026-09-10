import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `missing block: ${selector}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated block: ${selector}`);
}

function tokens(body: string): string[] {
  return [...body.matchAll(/(--ff-[a-z0-9-]+)\s*:/g)].map((m) => m[1]).sort();
}

/**
 * Light and dark are designed together: neither may quietly lose a token, or a component
 * silently falls back to an inherited/undefined colour in one theme only.
 */
describe("theme tokens", () => {
  const light = tokens(block(":root {"));
  const manualDark = tokens(block("html.dark {"));
  const systemDark = tokens(block(":root:not(.light) {"));

  it("defines a non-trivial light palette", () => {
    expect(light.length).toBeGreaterThan(20);
    expect(light).toContain("--ff-brand");
    expect(light).toContain("--ff-canvas");
    expect(light).toContain("--ff-line");
  });

  it("mirrors every light token in the manual dark theme", () => {
    expect(manualDark).toEqual(light);
  });

  it("mirrors every light token in the prefers-color-scheme dark theme", () => {
    expect(systemDark).toEqual(light);
  });

  it("keeps the brand violet as the light-theme primary", () => {
    expect(block(":root {")).toContain("--ff-brand: #6d5df6");
  });

  it("exposes each token to Tailwind through an inline @theme mapping", () => {
    const theme = block("@theme inline {");
    for (const name of ["--ff-canvas", "--ff-surface", "--ff-line", "--ff-text", "--ff-brand", "--ff-success", "--ff-warn", "--ff-danger"]) {
      expect(theme, `not mapped: ${name}`).toContain(`var(${name})`);
    }
  });

  it("honours prefers-reduced-motion globally", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
    expect(css).toMatch(/transition-duration:\s*0\.001ms\s*!important/);
  });

  it("ships a focus-visible ring in the brand colour", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ff-brand\)/);
  });
});

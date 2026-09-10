import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@fitfloow/core";

describe("admin smoke", () => {
  it("imports shared core", () => {
    expect(DEFAULT_SETTINGS.mascot.name).toBe("Floo");
  });
});

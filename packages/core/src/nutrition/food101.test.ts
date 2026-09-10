import { describe, expect, it } from "vitest";
import { FOOD101_LABELS, FOOD101_TR, TURKISH25_LABELS, TURKISH25_TR, isFood101Label, labelToTitle, labelTr } from "./food101";

describe("food101 label table", () => {
  it("has exactly the 101 Food-101 classes", () => {
    expect(FOOD101_LABELS).toHaveLength(101);
    expect(FOOD101_LABELS[0]).toBe("apple_pie");
    expect(FOOD101_LABELS[FOOD101_LABELS.length - 1]).toBe("waffles");
  });

  it("uses snake_case ASCII labels only", () => {
    for (const l of FOOD101_LABELS) expect(l).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("has no duplicates", () => {
    expect(new Set(FOOD101_LABELS).size).toBe(101);
  });

  it("gives every label a non-empty Turkish name", () => {
    for (const l of FOOD101_LABELS) expect(FOOD101_TR[l]?.length ?? 0).toBeGreaterThan(1);
  });

  it("contains the classes the mock vision client emits", () => {
    for (const l of ["pizza", "hamburger", "omelette", "steak", "sushi", "baklava"]) expect(isFood101Label(l)).toBe(true);
  });
});

describe("TurkishFoods-25 label table", () => {
  it("has 25 labels with Turkish names", () => {
    expect(TURKISH25_LABELS).toHaveLength(25);
    for (const l of TURKISH25_LABELS) expect(TURKISH25_TR[l]?.length ?? 0).toBeGreaterThan(1);
  });

  it("covers the Turkish classes the mock vision client emits", () => {
    for (const l of ["lahmacun", "menemen", "kofte", "pilav", "mercimek_corbasi"]) expect(TURKISH25_TR[l]).toBeTruthy();
  });
});

describe("labelTr / labelToTitle", () => {
  it("resolves Turkish names from either table", () => {
    expect(labelTr("pizza")).toBe("Pizza");
    expect(labelTr("mercimek_corbasi")).toBe("Mercimek çorbası");
    expect(labelTr("PIZZA")).toBe("Pizza");
  });

  it("returns null for unknown labels", () => {
    expect(labelTr("space_food")).toBeNull();
  });

  it("titles an unknown label readably", () => {
    expect(labelToTitle("hot_and_sour_soup")).toBe("Hot and sour soup");
    expect(labelToTitle("")).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { foodScore, normalizeQuery, queryTokens, rankFoods, type RankableFood } from "./search";

const food = (name: string, extra: Partial<RankableFood> = {}): RankableFood & { name: string } => ({
  name,
  searchKey: normalizeQuery(name),
  aliases: [],
  popularity: 0,
  ...extra,
});

describe("normalizeQuery", () => {
  it("folds Turkish casing and diacritics", () => {
    expect(normalizeQuery("İSKENDER")).toBe("iskender");
    expect(normalizeQuery("Mercimek Çorbası")).toBe("mercimek corbasi");
    expect(normalizeQuery("Yoğurt")).toBe("yogurt");
    expect(normalizeQuery("IŞIL")).toBe("isil");
  });
  it("collapses whitespace and punctuation", () => {
    expect(normalizeQuery("  tavuk   göğsü (ızgara) ")).toBe("tavuk gogsu izgara");
  });
  it("survives empty input", () => {
    expect(normalizeQuery("")).toBe("");
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("queryTokens", () => {
  it("splits the normalized query into words", () => {
    expect(queryTokens("Tavuk Göğsü")).toEqual(["tavuk", "gogsu"]);
  });
  it("drops empty tokens", () => {
    expect(queryTokens("  ")).toEqual([]);
  });
});

describe("foodScore", () => {
  it("ranks an exact name match above a prefix match", () => {
    expect(foodScore(food("Pilav"), "pilav")).toBeGreaterThan(foodScore(food("Pilav üstü döner"), "pilav"));
  });

  it("ranks a prefix match above a mid-word contains match", () => {
    expect(foodScore(food("Ekmek"), "ekm")).toBeGreaterThan(foodScore(food("Tam buğday ekmeği"), "ekm"));
  });

  it("scores an exact alias hit high", () => {
    const withAlias = food("Mercimek çorbası", { aliases: ["mercimek_corbasi", "lentil soup"] });
    expect(foodScore(withAlias, "mercimek_corbasi")).toBeGreaterThanOrEqual(70);
  });

  it("matches a vision label alias exactly as the model emits it", () => {
    const f = food("Lahmacun", { aliases: ["lahmacun"] });
    expect(foodScore(f, "lahmacun")).toBeGreaterThan(0);
  });

  it("uses popularity only as a tie-breaker", () => {
    const popular = food("Pilav üstü tavuk", { popularity: 500 });
    const exact = food("Pilav", { popularity: 0 });
    expect(foodScore(exact, "pilav")).toBeGreaterThan(foodScore(popular, "pilav"));
  });

  it("prefers the more popular of two equal matches", () => {
    expect(foodScore(food("Pilav", { popularity: 40 }), "pilav")).toBeGreaterThan(foodScore(food("Pilav", { popularity: 0 }), "pilav"));
  });

  it("gives a small bonus to verified foods", () => {
    expect(foodScore(food("Pilav", { verified: true }), "pilav")).toBeGreaterThan(foodScore(food("Pilav"), "pilav"));
  });

  it("matches every token of a multi-word query", () => {
    const f = food("Izgara tavuk göğsü");
    expect(foodScore(f, "tavuk gogsu")).toBeGreaterThan(0);
    expect(foodScore(f, "tavuk balik")).toBe(0);
  });

  it("returns 0 for an unrelated food", () => {
    expect(foodScore(food("Baklava"), "pilav")).toBe(0);
  });

  it("returns 0 for an empty query", () => {
    expect(foodScore(food("Pilav"), "")).toBe(0);
  });

  it("folds the query the same way as the key", () => {
    expect(foodScore(food("Mercimek çorbası"), "ÇORBA")).toBeGreaterThan(0);
  });
});

describe("rankFoods", () => {
  const list = [
    food("Pilav üstü döner", { popularity: 90 }),
    food("Pilav", { popularity: 10 }),
    food("Bulgur pilavı", { popularity: 200 }),
    food("Baklava", { popularity: 999 }),
  ];

  it("sorts by relevance and drops non-matches", () => {
    expect(rankFoods(list, "pilav").map((f) => f.name)).toEqual(["Pilav", "Pilav üstü döner", "Bulgur pilavı"]);
  });

  it("applies the limit", () => {
    expect(rankFoods(list, "pilav", 2)).toHaveLength(2);
  });

  it("falls back to popularity ordering for an empty query", () => {
    expect(rankFoods(list, "", 2).map((f) => f.name)).toEqual(["Baklava", "Bulgur pilavı"]);
  });

  it("is stable for equal scores", () => {
    const a = food("Pilav", { popularity: 5 });
    const b = food("Pilav", { popularity: 5 });
    expect(rankFoods([a, b], "pilav")).toEqual([a, b]);
  });
});

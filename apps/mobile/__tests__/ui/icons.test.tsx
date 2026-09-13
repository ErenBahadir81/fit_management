import React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { screen } from "@testing-library/react-native";
import { renderUI } from "../helpers";
import { APP_ICONS, APP_ICON_NAMES, glyphFor, type AppIcon } from "../../src/ui/icons";
import { Icon } from "../../src/ui/Icon";
import { TAB_ITEMS } from "../../src/ui/TabBar";

const entries = Object.entries(APP_ICONS) as [AppIcon, (typeof APP_ICONS)[AppIcon]][];

describe("semantic icon map", () => {
  test("covers the app's concepts", () => {
    // The vocabulary the product speaks in. Adding a concept is fine; losing one is not.
    for (const concept of ["home", "program", "nutrition", "body", "profile", "goal", "streak", "rest", "scan", "weighIn"]) {
      expect(APP_ICON_NAMES).toContain(concept);
    }
  });

  test("every concept maps to a real Ionicons glyph", () => {
    expect(entries.length).toBeGreaterThan(20);
    for (const [concept, spec] of entries) {
      expect({ concept, ok: spec.name in Ionicons.glyphMap }).toEqual({ concept, ok: true });
      expect({ concept, ok: spec.active in Ionicons.glyphMap }).toEqual({ concept, ok: true });
    }
  });

  test("one visual weight: every base glyph is an outline, and the active glyph is its filled twin", () => {
    for (const [concept, spec] of entries) {
      expect({ concept, name: spec.name }).toEqual({ concept, name: expect.stringMatching(/-outline$/) });
      expect({ concept, active: spec.active }).toEqual({ concept, active: spec.name.replace(/-outline$/, "") });
    }
  });

  test("glyphFor returns the outline by default and the filled glyph when active", () => {
    expect(glyphFor("home")).toBe("home-outline");
    expect(glyphFor("home", true)).toBe("home");
    expect(glyphFor("goal")).toBe("flag-outline");
  });

  test("the tab bar reads its glyphs from the map, filled only when active", () => {
    expect(TAB_ITEMS.map((t) => t.name)).toEqual(["index", "program", "nutrition", "body", "profile"]);
    for (const item of TAB_ITEMS) {
      expect(item.icon).toMatch(/-outline$/);
      expect(item.iconActive).toBe(item.icon.replace(/-outline$/, ""));
    }
  });
});

/** Ionicons renders the glyph as a codepoint in a <Text>; that character is what the user sees. */
const drawn = (testID: string) => [screen.getByTestId(testID).props.children].flat()[0];
const charFor = (name: keyof typeof Ionicons.glyphMap) => String.fromCodePoint(Number(Ionicons.glyphMap[name]));

describe("Icon", () => {
  test("renders a semantic concept, and `active` swaps in the filled glyph", async () => {
    await renderUI(
      <>
        <Icon icon="goal" testID="i-rest" />
        <Icon icon="goal" active testID="i-active" />
      </>
    );
    expect(drawn("i-rest")).toBe(charFor("flag-outline"));
    expect(drawn("i-active")).toBe(charFor("flag"));
    expect(charFor("flag-outline")).not.toBe(charFor("flag"));
  });

  test("still accepts a raw glyph name so existing call sites keep working", async () => {
    await renderUI(<Icon name="sparkles" testID="i-raw" />);
    expect(drawn("i-raw")).toBe(charFor("sparkles"));
  });
});

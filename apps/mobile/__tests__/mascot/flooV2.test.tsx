import React from "react";
import { render, screen } from "@testing-library/react-native";
import * as skiaWeb from "../../src/lib/skiaWeb";
import { FlooV2 } from "../../src/mascot/FlooV2";

jest.mock("../../src/mascot/model/FlooModel", () => jest.requireActual("../mocks/flooModel"));

const drawn = () => screen.getByTestId("f").props.flooProps;

describe("FlooV2 (v1 props, Floo 3 body)", () => {
  afterEach(() => jest.restoreAllMocks());

  test.each([
    ["think", "think"],
    ["proud", "proud"],
    ["cheer", "celebrate"],
    ["hype", "celebrate"],
    ["flex", "energetic"],
    ["curious", "think"],
    ["worried", "worried"],
  ] as const)("v1 %s draws the model's %s face", async (v1, model) => {
    await render(<FlooV2 mood={v1} size="m" testID="f" />);
    expect(drawn().mood).toBe(model);
  });

  test("passes trigger and pointAt through to the model, with the caller's width", async () => {
    const trigger = { name: "goalHit" as const, key: 3 };
    const pointAt = { x: 80, y: 20 };
    await render(<FlooV2 mood="happy" size={120} trigger={trigger} pointAt={pointAt} testID="f" />);
    expect(drawn()).toEqual(expect.objectContaining({ trigger, pointAt, size: 120, animate: true }));
  });

  test("without them the model gets no trigger and no pointing target", async () => {
    await render(<FlooV2 mood="happy" size="s" testID="f" />);
    expect(drawn().trigger ?? null).toBeNull();
    expect(drawn().pointAt ?? null).toBeNull();
    expect(drawn().size).toBe(56);
  });

  test("falls back to the SVG mascot (no triggers) when CanvasKit never loaded", async () => {
    jest.spyOn(skiaWeb, "isSkiaUnavailable").mockReturnValue(true);
    await render(<FlooV2 mood="cheer" size="s" trigger={{ name: "tap", key: 1 }} testID="f" />);
    expect(drawn()).toBeUndefined();
    expect(screen.getByTestId("f").props.accessibilityLabel).toBe("Floo, coşkulu");
  });
});

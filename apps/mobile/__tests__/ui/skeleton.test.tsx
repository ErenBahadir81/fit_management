import React from "react";
import { Text as RNText } from "react-native";
import { screen } from "@testing-library/react-native";
import { renderUI } from "../helpers";
import { Skeleton, SkeletonGroup, SkeletonText } from "../../src/ui/Skeleton";
import { Reveal } from "../../src/ui/Reveal";

describe("Skeleton", () => {
  test("renders a block with the requested size and radius", async () => {
    await renderUI(<Skeleton testID="sk" width={120} height={16} radius={8} />);
    const el = screen.getByTestId("sk", { includeHiddenElements: true });
    expect(el).toHaveStyle({ width: 120, height: 16, borderRadius: 8 });
    expect(el.props.accessibilityElementsHidden).toBe(true);
  });

  test("SkeletonText renders N lines, last one shorter", async () => {
    await renderUI(<SkeletonText lines={3} testID="lines" />);
    expect(screen.getByTestId("lines-0", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("lines-2", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("lines-3", { includeHiddenElements: true })).toBeNull();
  });

  test("SkeletonGroup lays out children and is hidden from screen readers", async () => {
    await renderUI(
      <SkeletonGroup testID="g">
        <Skeleton width={40} height={40} />
      </SkeletonGroup>
    );
    expect(screen.getByTestId("g", { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  });
});

describe("Reveal", () => {
  test("shows the skeleton while not ready and the content when ready", async () => {
    const { rerender } = await renderUI(
      <Reveal ready={false} skeleton={<RNText>skeleton</RNText>}>
        <RNText>content</RNText>
      </Reveal>
    );
    expect(screen.getByText("skeleton")).toBeTruthy();
    expect(screen.queryByText("content")).toBeNull();
    await rerender(
      <Reveal ready skeleton={<RNText>skeleton</RNText>}>
        <RNText>content</RNText>
      </Reveal>
    );
    expect(screen.getByText("content")).toBeTruthy();
  });

  test("ready from the first render never mounts the skeleton (cache-first)", async () => {
    await renderUI(
      <Reveal ready skeleton={<RNText>skeleton</RNText>}>
        <RNText>content</RNText>
      </Reveal>
    );
    expect(screen.queryByText("skeleton")).toBeNull();
    expect(screen.getByText("content")).toBeTruthy();
  });
});

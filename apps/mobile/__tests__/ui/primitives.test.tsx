import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { renderUI } from "../helpers";
import { Text } from "../../src/ui/Text";
import { Box } from "../../src/ui/Box";
import { Card } from "../../src/ui/Card";
import { Chip } from "../../src/ui/Chip";
import { ProgressBar } from "../../src/ui/ProgressBar";
import { Ring, ringGeometry } from "../../src/ui/Ring";
import { ListRow } from "../../src/ui/ListRow";
import { Divider } from "../../src/ui/Divider";
import { Surface } from "../../src/ui/Surface";
import { StatTile } from "../../src/ui/StatTile";

describe("Text", () => {
  test("applies the variant scale and tabular numerals", async () => {
    await renderUI(
      <>
        <Text variant="hero" tabular testID="h">
          72,4
        </Text>
        <Text variant="caption" color="inkMuted" testID="c">
          x
        </Text>
      </>
    );
    expect(screen.getByTestId("h")).toHaveStyle({ fontSize: 40, fontVariant: ["tabular-nums"] });
    expect(screen.getByTestId("c")).toHaveStyle({ fontSize: 11, color: "#5B6273" });
  });
  test("defaults to body and ink color; supports align/tone", async () => {
    await renderUI(
      <Text testID="b" align="center" tone="danger">
        b
      </Text>
    );
    expect(screen.getByTestId("b")).toHaveStyle({ fontSize: 15, textAlign: "center", color: "#EF4444" });
  });
});

describe("Box / Surface / Card / Divider", () => {
  test("Box maps spacing shorthands to style", async () => {
    await renderUI(<Box testID="b" p="lg" gap="sm" row align="center" justify="between" bg="surface" radius="card" />);
    expect(screen.getByTestId("b")).toHaveStyle({
      padding: 16,
      gap: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: "#FFFFFF",
      borderRadius: 24,
    });
  });
  test("Card uses 24 pt radius + 20 pt padding and can be pressable", async () => {
    const onPress = jest.fn();
    await renderUI(
      <Card testID="card" onPress={onPress}>
        <Text>c</Text>
      </Card>
    );
    const el = screen.getByTestId("card");
    expect(el).toHaveStyle({ borderRadius: 24, padding: 20 });
    await fireEvent.press(el);
    expect(onPress).toHaveBeenCalled();
  });
  test("Surface and Divider render", async () => {
    await renderUI(
      <Surface testID="s">
        <Divider testID="d" />
      </Surface>
    );
    expect(screen.getByTestId("s")).toHaveStyle({ backgroundColor: "#FFFFFF" });
    expect(screen.getByTestId("d")).toHaveStyle({ height: 1 });
  });
});

describe("Chip", () => {
  beforeEach(() => jest.clearAllMocks());
  test("selected state, press with selection haptic, tones", async () => {
    const onPress = jest.fn();
    await renderUI(
      <>
        <Chip label="Pazar" selected onPress={onPress} testID="c1" />
        <Chip label="Hazır" tone="success" testID="c2" />
      </>
    );
    const c1 = screen.getByTestId("c1");
    expect(c1.props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent(c1, "pressIn");
    await fireEvent.press(c1);
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText("Hazır")).toBeTruthy();
  });
});

describe("ProgressBar / Ring / StatTile / ListRow", () => {
  test("ProgressBar clamps and exposes accessibilityValue", async () => {
    await renderUI(<ProgressBar value={1.4} testID="pb" label="Protein" />);
    expect(screen.getByTestId("pb").props.accessibilityValue).toMatchObject({ now: 100, min: 0, max: 100 });
  });
  test("ringGeometry computes circumference and dash offset", () => {
    const g = ringGeometry(100, 10, 0.25);
    expect(g.r).toBe(45);
    expect(g.circumference).toBeCloseTo(2 * Math.PI * 45, 5);
    expect(g.dashOffset).toBeCloseTo(g.circumference * 0.75, 5);
    expect(ringGeometry(100, 10, 2).dashOffset).toBe(0);
  });
  test("Ring renders center content and a11y value", async () => {
    await renderUI(
      <Ring value={0.5} size={120} testID="ring">
        <Text>50</Text>
      </Ring>
    );
    expect(screen.getByTestId("ring").props.accessibilityValue).toMatchObject({ now: 50 });
    expect(screen.getByText("50")).toBeTruthy();
  });
  test("StatTile shows label + value", async () => {
    await renderUI(<StatTile label="Seri" value="4" hint="gün" />);
    expect(screen.getByText("Seri")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });
  test("ListRow shows label/value and forwards presses", async () => {
    const onPress = jest.fn();
    await renderUI(<ListRow label="Tema" value="Sistem" onPress={onPress} testID="row" />);
    await fireEvent.press(screen.getByTestId("row"));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText("Sistem")).toBeTruthy();
  });
});

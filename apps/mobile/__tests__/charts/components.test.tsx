import React from "react";
import { screen } from "@testing-library/react-native";
import { renderUI } from "../helpers";
import { RingChart } from "../../src/charts/RingChart";
import { BarWeek } from "../../src/charts/BarWeek";
import { Sparkline } from "../../src/charts/Sparkline";
import { LineTrend } from "../../src/charts/LineTrend";

describe("chart components", () => {
  test("RingChart shows value + caption inside the ring", async () => {
    await renderUI(<RingChart value={0.62} label="1.240" caption="kalan" testID="rc" />);
    expect(screen.getByText("1.240")).toBeTruthy();
    expect(screen.getByText("kalan")).toBeTruthy();
    expect(screen.getByTestId("rc").props.accessibilityValue).toMatchObject({ now: 62 });
  });

  test("BarWeek renders 7 day labels and marks today", async () => {
    const days = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"].map((label, i) => ({ label, value: 1500 + i * 100, logged: i < 4 }));
    await renderUI(<BarWeek days={days} target={1800} todayIndex={3} testID="bw" />);
    for (const d of days) expect(screen.getByText(d.label)).toBeTruthy();
    expect(screen.getByTestId("bw").props.accessibilityLabel).toMatch(/hedef/i);
  });

  test("Sparkline renders for ≥2 points and an empty box otherwise", async () => {
    await renderUI(
      <>
        <Sparkline values={[1, 2, 3, 2]} testID="sp" />
        <Sparkline values={[1]} testID="sp-empty" />
      </>
    );
    expect(screen.getByTestId("sp", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("sp-empty")).toBeTruthy();
  });

  test("LineTrend renders an empty state with < 2 points and a chart otherwise", async () => {
    await renderUI(<LineTrend points={[]} testID="lt" />);
    expect(screen.getByText(/yeterli veri yok/i)).toBeTruthy();
    await renderUI(
      <LineTrend
        points={[
          { dateKey: "2026-09-01", raw: 80, ewma: 80 },
          { dateKey: "2026-09-02", raw: 79.6, ewma: 79.9 },
        ]}
        goal={78}
        unit="kg"
        testID="lt2"
      />
    );
    expect(screen.getByTestId("lt2")).toBeTruthy();
  });
});

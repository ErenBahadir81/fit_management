import React from "react";
import { act, screen } from "@testing-library/react-native";
import { renderUI } from "../../helpers";
import { CountUp } from "../../../src/features/reports/components/CountUp";
import { fmtNumber } from "../../../src/lib/format";

const fmt1 = (v: number) => fmtNumber(v, 1);

describe("CountUp", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("rolls from `from` to the value; the accessibility label is always the final value", async () => {
    await renderUI(<CountUp value={79.4} from={0} format={fmt1} testID="cu" />);
    const el = screen.getByTestId("cu");
    expect(el.props.accessibilityLabel).toBe("79,4");
    expect(el.props.children).toBe("0,0");
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("cu").props.children).toBe("79,4");
  });

  test("a later value rolls again and lands exactly on the new number", async () => {
    const { rerender } = await renderUI(<CountUp value={80} from={80} format={fmt1} testID="cu" />);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await rerender(<CountUp value={79.3} from={80} format={fmt1} testID="cu" />);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("cu").props.children).toBe("79,3");
    expect(screen.getByTestId("cu").props.accessibilityLabel).toBe("79,3");
  });
});

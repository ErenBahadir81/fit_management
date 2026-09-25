import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderUI } from "../helpers";
import { DatePicker } from "../../src/ui/DatePicker";

function Harness({ initial, ...rest }: { initial: string; minYear?: number; maxYear?: number }) {
  const [v, setV] = React.useState(initial);
  return (
    <>
      <DatePicker value={v} onChange={setV} label="Doğum tarihi" testID="d" {...rest} />
    </>
  );
}

const pick = (col: "day" | "month" | "year", value: number | string) => fireEvent.press(screen.getByTestId(`d-${col}-option-${value}`));

describe("DatePicker", () => {
  test("three wheels: day, Turkish month name, year", async () => {
    await renderUI(<Harness initial="1994-04-12" />);
    expect(screen.getByTestId("d-day").props.accessibilityValue).toMatchObject({ text: "12" });
    expect(screen.getByTestId("d-month").props.accessibilityValue).toMatchObject({ text: "Nisan" });
    expect(screen.getByTestId("d-year").props.accessibilityValue).toMatchObject({ text: "1994" });
  });

  test("changing one wheel emits a full date key", async () => {
    const onChange = jest.fn();
    await renderUI(<DatePicker value="1994-04-12" onChange={onChange} label="Doğum tarihi" testID="d" />);
    await pick("month", 9);
    expect(onChange).toHaveBeenCalledWith("1994-09-12");
  });

  test("a day that does not exist in the new month clamps to the last one", async () => {
    await renderUI(<Harness initial="1994-01-31" />);
    await pick("month", 2);
    expect(screen.getByTestId("d-day").props.accessibilityValue).toMatchObject({ text: "28" });
    expect(screen.getByTestId("d-month").props.accessibilityValue).toMatchObject({ text: "Şubat" });
  });

  test("February in a leap year offers the 29th", async () => {
    await renderUI(<Harness initial="1996-02-01" />);
    expect(screen.getByTestId("d-day-option-29")).toBeTruthy();
    expect(screen.queryByTestId("d-day-option-30")).toBeNull();
  });

  test("years run newest first inside the range it is given", async () => {
    await renderUI(<Harness initial="2000-01-01" minYear={1998} maxYear={2001} />);
    expect(screen.getByTestId("d-year-option-2001")).toBeTruthy();
    expect(screen.getByTestId("d-year-option-1998")).toBeTruthy();
    expect(screen.queryByTestId("d-year-option-1997")).toBeNull();
  });

  test("no value yet still renders, and the first pick produces a date", async () => {
    const onChange = jest.fn();
    await renderUI(<DatePicker value={null} onChange={onChange} label="Doğum tarihi" testID="d" minYear={1990} maxYear={2000} />);
    await pick("day", 5);
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-05$/));
  });

  test("with no value the resting date is marked as not chosen, and can be taken as is", async () => {
    const onChange = jest.fn();
    await renderUI(<DatePicker value={null} onChange={onChange} label="Doğum tarihi" testID="d" minYear={1990} maxYear={2000} />);
    expect(screen.getByText("Henüz seçilmedi; tekerlekleri kaydır.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("d-accept"));
    expect(onChange).toHaveBeenCalledWith("1995-01-01");
  });

  test("once a date is chosen the not-chosen line is gone", async () => {
    await renderUI(<Harness initial="1994-04-12" />);
    expect(screen.queryByTestId("d-pending")).toBeNull();
  });
});

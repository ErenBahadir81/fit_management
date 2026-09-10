import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderUI } from "../../helpers";
import { MeasureForm } from "../../../src/features/body/components/MeasureSheet";
import { navyPreview } from "../../../src/features/body/bodyMath";
import { fmtPct } from "../../../src/lib/format";

const male = { gender: "male" as const, heightCm: 180 };
const defaults = { weightKg: 84, neckCm: 39, waistCm: 92, hipCm: null };

describe("MeasureForm (Ölçüm ekle)", () => {
  test("prefills gender + height and shows a live Navy preview that follows the waist input", async () => {
    const onSave = jest.fn();
    await renderUI(<MeasureForm profile={male} defaults={defaults} onSave={onSave} saving={false} />);
    expect(screen.getByTestId("mf-gender-male").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText("180 cm")).toBeTruthy();
    const initial = navyPreview({ ...defaults, ...male });
    expect(screen.getByText(fmtPct(initial.bodyFatPct, 1))).toBeTruthy();
    expect(screen.getByText(/±3,5/)).toBeTruthy();
    expect(screen.getByText(initial.categoryLabel!)).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("mf-waist-input"), "86,5");
    const next = navyPreview({ ...defaults, ...male, waistCm: 86.5 });
    expect(next.bodyFatPct).not.toBe(initial.bodyFatPct);
    expect(screen.getByText(fmtPct(next.bodyFatPct, 1))).toBeTruthy();
    expect(screen.getByText(next.categoryLabel!)).toBeTruthy();
  });

  test("waist ≤ neck shows the validation copy instead of numbers and disables save", async () => {
    const onSave = jest.fn();
    await renderUI(<MeasureForm profile={male} defaults={defaults} onSave={onSave} saving={false} />);
    await fireEvent.changeText(screen.getByTestId("mf-waist-input"), "39");
    expect(screen.getByText("Bel çevresi boyundan büyük olmalı")).toBeTruthy();
    expect(screen.queryByTestId("mf-preview-bf")).toBeNull();
    expect(screen.getByTestId("mf-save").props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId("mf-save"));
    expect(onSave).not.toHaveBeenCalled();
  });

  test("steppers move by 0,5 cm and the input follows; the stepper clamps at the schema bounds", async () => {
    await renderUI(<MeasureForm profile={male} defaults={{ ...defaults, neckCm: 79.5 }} onSave={jest.fn()} saving={false} />);
    await fireEvent.press(screen.getByTestId("mf-neck-inc"));
    expect(screen.getByTestId("mf-neck-input").props.value).toBe("80");
    expect(screen.getByTestId("mf-neck-inc").props.accessibilityState).toMatchObject({ disabled: true });
  });

  test("a female profile needs the hip measurement; save sends the full BodyEntryInput", async () => {
    const onSave = jest.fn();
    await renderUI(<MeasureForm profile={{ gender: "female", heightCm: 165 }} defaults={{ weightKg: 60, neckCm: 32, waistCm: 74, hipCm: null }} onSave={onSave} saving={false} />);
    // hip defaults to 96 for women → valid straight away
    expect(screen.getByTestId("mf-hip-input").props.value).toBe("96");
    await fireEvent.changeText(screen.getByTestId("mf-hip-input"), "98");
    await fireEvent.press(screen.getByTestId("mf-save"));
    expect(onSave).toHaveBeenCalledWith({ gender: "female", heightCm: 165, neckCm: 32, waistCm: 74, hipCm: 98, weightKg: 60 });
  });

  test("switching to male drops the hip from the payload", async () => {
    const onSave = jest.fn();
    await renderUI(<MeasureForm profile={{ gender: "female", heightCm: 165 }} defaults={{ weightKg: 60, neckCm: 32, waistCm: 74, hipCm: 96 }} onSave={onSave} saving={false} />);
    await fireEvent.press(screen.getByTestId("mf-gender-male"));
    expect(screen.queryByTestId("mf-hip-input")).toBeNull();
    await fireEvent.press(screen.getByTestId("mf-save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ gender: "male", hipCm: null }));
  });
});

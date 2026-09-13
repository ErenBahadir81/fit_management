import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { ApiClient } from "@fitfloow/api-client";
import type { EnergyDTO } from "@fitfloow/core";
import { makeQueryClient, renderUI } from "../../helpers";
import { EnergyCard } from "../../../src/features/nutrition/components/EnergyCard";
import { setApi } from "../../../src/lib/api";
import { createFakeApi } from "../../../src/lib/fake";
import { fmtInt } from "../../../src/lib/format";

jest.mock("expo-router", () => jest.requireActual("../../mocks/expo-router"));

const noop = jest.fn();
const render = () => renderUI(<EnergyCard onSetGoal={noop} onAddMeasurement={noop} />, { queryClient: makeQueryClient() });

function stubEnergy(over: Partial<EnergyDTO> = {}) {
  const energy: EnergyDTO = {
    bmr: 1720,
    tdee: 2666,
    maintenanceCalories: 2666,
    targetCalories: 2180,
    dailyDeficit: 486,
    derivedFrom: "goal",
    activityLevel: "moderate",
    activityMultiplier: 1.55,
    leanMassKg: 69.9,
    ...over,
  };
  setApi({ me: { energy: jest.fn(async () => energy) } } as unknown as ApiClient);
  return energy;
}

describe("EnergyCard", () => {
  beforeEach(() => jest.clearAllMocks());

  test("says the target plainly, then BMR, maintenance and the deficit between them", async () => {
    const e = stubEnergy();
    await render();
    await waitFor(() => expect(screen.getByTestId("energy-card")).toBeTruthy());
    expect(screen.getByTestId("energy-card-target").props.children).toBe(fmtInt(e.targetCalories));
    expect(screen.getByTestId("energy-card-bmr")).toBeTruthy();
    expect(screen.getByTestId("energy-card-maintenance")).toBeTruthy();
    expect(screen.getByTestId("energy-card-delta")).toBeTruthy();
    expect(screen.getByText("Günlük açık")).toBeTruthy();
  });

  test("says why it is that number, and offers no fix when there is nothing to fix", async () => {
    stubEnergy();
    await render();
    await waitFor(() => expect(screen.getByTestId("energy-card-source")).toBeTruthy());
    expect(screen.getByText("Hedefinden")).toBeTruthy();
    expect(screen.queryByTestId("energy-card-action")).toBeNull();
  });

  test("without a goal it explains the number and offers the goal as the way forward", async () => {
    stubEnergy({ derivedFrom: "maintenance", targetCalories: 2666, dailyDeficit: 0 });
    await render();
    await waitFor(() => expect(screen.getByText("Ölçümünden")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("energy-card-action"));
    expect(noop).toHaveBeenCalled();
  });

  test("a failed read is a card with a way out, not a blank", async () => {
    setApi({
      me: {
        energy: jest.fn(async () => {
          throw new Error("offline");
        }),
      },
    } as unknown as ApiClient);
    await render();
    await waitFor(() => expect(screen.getByTestId("energy-card-error")).toBeTruthy());
    expect(screen.getByTestId("energy-card-retry")).toBeTruthy();
  });

  test("the real fake API answers it, so the demo build shows real numbers", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    setApi(api);
    await render();
    await waitFor(() => expect(screen.getByTestId("energy-card")).toBeTruthy());
    const energy = await api.me.energy();
    expect(screen.getByTestId("energy-card-target").props.children).toBe(fmtInt(energy.targetCalories));
  });
});

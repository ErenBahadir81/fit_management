import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { QueryClient } from "@tanstack/react-query";
import { renderUI } from "../../../../__tests__/helpers";
import { mockRouter } from "../../../../__tests__/mocks/expo-router";
import { useSession } from "../../auth/session";
import { setApi } from "../../../lib/api";
import { todayKey } from "../../../lib/dates";
import { createNutritionFakeApi, type NutritionFakeOptions } from "../../../lib/fake/nutritionFake";
import { MIN_ANALYZE_MS, STATUS_STEP_MS } from "../model/scanMachine";
import { ScanScreen } from "./ScanScreen";

jest.mock("expo-router", () => require("../../../../__tests__/mocks/expo-router"));

jest.mock("expo-camera", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  const CameraView = React2.forwardRef(function CameraView(props: Record<string, unknown>, ref: React.Ref<unknown>) {
    React2.useImperativeHandle(ref, () => ({
      takePictureAsync: async () => ({ uri: "file://photo.jpg", width: 800, height: 600, format: "jpg" }),
    }));
    return React2.createElement(View, { testID: "camera-view", ...props });
  });
  return { CameraView, useCameraPermissions: () => [{ granted: true, canAskAgain: true, status: "granted" }, jest.fn(async () => ({ granted: true }))] };
});

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: "file://gallery.jpg", width: 800, height: 600 }] })),
}));

jest.mock("expo-image", () => {
  const React2 = require("react");
  const { View } = require("react-native");
  return { Image: (props: Record<string, unknown>) => React2.createElement(View, props) };
});

/**
 * React Native's FormData takes `{uri,name,type}` file objects; the jsdom one insists on a Blob.
 * Stand in for the RN implementation so `api.nutrition.scan()` behaves the way it does on device.
 */
class RNFormData {
  readonly parts: Array<[string, unknown, string | undefined]> = [];
  append(name: string, value: unknown, filename?: string) {
    this.parts.push([name, value, filename]);
  }
}
const globals = globalThis as unknown as { FormData: unknown };
const RealFormData = globals.FormData;
beforeAll(() => {
  globals.FormData = RNFormData;
});
afterAll(() => {
  globals.FormData = RealFormData;
});

const today = todayKey();

/**
 * Like the shared `makeQueryClient` but mutations are garbage-collected at once: react-query's
 * default 5-minute mutation GC timer keeps the jest event loop alive after the suite finishes.
 */
function testClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
}

async function setup(opts: NutritionFakeOptions = {}) {
  const api = createNutritionFakeApi({ latencyMs: 0, signedIn: true, ...opts });
  setApi(api);
  useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  return api;
}

/** Take a photo and let the request (but not the theatre) finish. */
async function capture() {
  await fireEvent.press(screen.getByTestId("scan-shutter"));
  await act(async () => {
    await Promise.resolve();
  });
}

describe("ScanScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  test("the AI theatre runs for at least 1.8 s even when the API answers instantly", async () => {
    await setup();
    await renderUI(<ScanScreen />, { queryClient: testClient() });
    expect(screen.getByTestId("scan-camera")).toBeTruthy();

    await capture();
    expect(screen.getByTestId("ai-thinking")).toBeTruthy();
    expect(screen.getByTestId("scan-status")).toHaveTextContent("Görüntü analiz ediliyor…");
    expect(screen.queryByTestId("scan-results")).toBeNull();

    await act(async () => void jest.advanceTimersByTime(STATUS_STEP_MS + 50));
    expect(screen.getByTestId("scan-status")).toHaveTextContent("Yemekler tanınıyor…");
    expect(screen.queryByTestId("scan-results")).toBeNull();

    await act(async () => void jest.advanceTimersByTime(MIN_ANALYZE_MS));
    await waitFor(() => expect(screen.getByTestId("scan-results")).toBeTruthy());
    expect(screen.getByText("Tavuk göğsü (ızgara)")).toBeTruthy();
    expect(screen.getByTestId("scan-mock-chip")).toBeTruthy(); // demo answer → "Demo modu"
  });

  test("grams edits update the live total and removing a card drops it", async () => {
    await setup({ scanScenario: "single" });
    await renderUI(<ScanScreen />, { queryClient: testClient() });
    await capture();
    await act(async () => void jest.advanceTimersByTime(MIN_ANALYZE_MS + 50));
    await waitFor(() => expect(screen.getByTestId("scan-results")).toBeTruthy());

    expect(screen.getByTestId("scan-total-kcal")).toHaveTextContent(/580 kcal/); // 250 g × 232 kcal/100 g
    await fireEvent.press(screen.getAllByLabelText("Artır")[0]);
    expect(screen.getByTestId("scan-total-kcal")).toHaveTextContent(/603 kcal/); // 260 g

    await fireEvent.press(screen.getAllByLabelText(/kaldır$/)[0]);
    expect(screen.getByTestId("scan-total-kcal")).toHaveTextContent(/^0 kcal$/);
  });

  test("saving writes one entry per detection with source 'scan' and returns to the day", async () => {
    const api = await setup({ scanScenario: "single" });
    const addEntry = jest.spyOn(api.nutrition, "addEntry");
    await renderUI(<ScanScreen />, { queryClient: testClient() });
    await capture();
    await act(async () => void jest.advanceTimersByTime(MIN_ANALYZE_MS + 50));
    await waitFor(() => expect(screen.getByTestId("scan-results")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("scan-meal-dinner"));
    await fireEvent.press(screen.getByTestId("scan-save"));

    await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(1));
    expect(addEntry).toHaveBeenCalledWith(expect.objectContaining({ meal: "dinner", source: "scan", dateKey: today, grams: 250, scanId: expect.stringContaining("scan_fake") }));

    await waitFor(() => expect(screen.getByTestId("scan-done")).toBeTruthy());
    await act(async () => void jest.advanceTimersByTime(1200));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test("a photo with no food gets a friendly message, not an error", async () => {
    await setup({ scanScenario: "notFood" });
    await renderUI(<ScanScreen />, { queryClient: testClient() });
    await capture();
    await act(async () => void jest.advanceTimersByTime(MIN_ANALYZE_MS + 50));

    await waitFor(() => expect(screen.getByTestId("scan-not-food")).toBeTruthy());
    expect(screen.getByText("Burada yemek göremedim")).toBeTruthy();
    expect(screen.getByText("Yemek ara")).toBeTruthy();
    expect(screen.getByTestId("scan-retake")).toBeTruthy();
  });

  test("a vision outage explains itself and offers search instead of crashing", async () => {
    await setup({ scanFails: "unavailable" });
    await renderUI(<ScanScreen />, { queryClient: testClient() });
    await capture();
    await act(async () => void jest.advanceTimersByTime(MIN_ANALYZE_MS + 50));

    await waitFor(() => expect(screen.getByText("Tanıyamadım")).toBeTruthy());
    expect(screen.getByText(/Tanıma servisi şu an meşgul/)).toBeTruthy();
    expect(screen.getByTestId("scan-error-retake")).toBeTruthy();

    // …and searching a food by hand brings the results sheet back with something to save.
    await fireEvent.press(screen.getByText("Yemek ara"));
    await fireEvent.changeText(screen.getByTestId("food-search-input"), "muz");
    await act(async () => void jest.advanceTimersByTime(400));
    await waitFor(() => expect(screen.getByTestId("food-f_muz")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("quick-f_muz-120"));
    await waitFor(() => expect(screen.getByTestId("scan-results")).toBeTruthy());
    expect(screen.getByTestId("scan-total-kcal")).toHaveTextContent(/107 kcal/);
  });

  test("the gallery route works without ever touching the camera", async () => {
    await setup({ scanScenario: "single" });
    await renderUI(<ScanScreen />, { queryClient: testClient() });
    await fireEvent.press(screen.getByTestId("scan-gallery"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("ai-thinking")).toBeTruthy();
    await act(async () => void jest.advanceTimersByTime(MIN_ANALYZE_MS + 50));
    await waitFor(() => expect(screen.getByTestId("scan-results")).toBeTruthy());
  });
});

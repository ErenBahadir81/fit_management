import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { makeQueryClient, renderUI } from "../../../../__tests__/helpers";
import { mockRouter } from "../../../../__tests__/mocks/expo-router";
import { useSession } from "../../auth/session";
import { setApi } from "../../../lib/api";
import { todayKey } from "../../../lib/dates";
import { createNutritionFakeApi, type NutritionFakeOptions } from "../../../lib/fake/nutritionFake";
import { SCAN_LOOKING_LABEL } from "./AiThinking";
import { ScanScreen } from "./ScanScreen";

jest.mock("expo-router", () => jest.requireActual("../../../../__tests__/mocks/expo-router"));

jest.mock("expo-camera", () => {
  const React2 = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  const CameraView = React2.forwardRef(function CameraView(props: Record<string, unknown>, ref: React.Ref<unknown>) {
    React2.useImperativeHandle(ref, () => ({
      takePictureAsync: async () => ({ uri: "file://photo.jpg", width: 800, height: 600, format: "jpg" }),
    }));
    return React2.createElement(View, { testID: "camera-view", ...props });
  });
  return { CameraView, useCameraPermissions: () => [{ granted: true, canAskAgain: true, status: "granted" }, jest.fn(async () => ({ granted: true }))] };
});

/** gorhom's jest mock never dismisses on its own; remember each sheet's onDismiss so a test can "swipe". */
jest.mock("@gorhom/bottom-sheet", () => {
  const actual = jest.requireActual("@gorhom/bottom-sheet/mock");
  const dismissals: (() => void)[] = [];
  class BottomSheetModal extends actual.BottomSheetModal {
    render() {
      const onDismiss = (this as unknown as { props: { onDismiss?: () => void } }).props.onDismiss;
      if (onDismiss) dismissals.push(onDismiss);
      return super.render();
    }
  }
  return { ...actual, BottomSheetModal, __dismissals: dismissals };
});

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: "file://gallery.jpg", width: 800, height: 600 }] })),
}));

jest.mock("expo-image", () => {
  const React2 = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return { Image: (props: Record<string, unknown>) => React2.createElement(View, props) };
});

/**
 * React Native's FormData takes `{uri,name,type}` file objects; the jsdom one insists on a Blob.
 * Stand in for the RN implementation so `api.nutrition.scan()` behaves the way it does on device.
 */
class RNFormData {
  readonly parts: [string, unknown, string | undefined][] = [];
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

async function setup(opts: NutritionFakeOptions = {}) {
  const api = createNutritionFakeApi({ latencyMs: 0, signedIn: true, ...opts });
  setApi(api);
  useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  return api;
}

/** Let pending promises (upload, fake request, state updates) settle — no timers are advanced. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}

/** Take a photo and let the request finish. */
async function capture() {
  await fireEvent.press(screen.getByTestId("scan-shutter"));
  await flush();
}

/** The onDismiss of the sheet rendered last (the results sheet, right after a capture). */
function resultsSheetDismiss(): () => void {
  const { __dismissals } = jest.requireMock("@gorhom/bottom-sheet") as { __dismissals: (() => void)[] };
  return __dismissals[__dismissals.length - 1]!;
}

describe("ScanScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers(); // the scan line's loops must not outlive the test
    jest.useRealTimers();
  });

  test("the results show the moment the API answers — no minimum wait, no scripted steps", async () => {
    const api = await setup();
    const real = api.nutrition.scan.bind(api.nutrition);
    let answer: (() => void) | null = null;
    jest.spyOn(api.nutrition, "scan").mockImplementation((image, signal) => new Promise((resolve, reject) => (answer = () => real(image, signal).then(resolve, reject))));
    await renderUI(<ScanScreen />, { queryClient: makeQueryClient() });
    expect(screen.getByTestId("scan-camera")).toBeTruthy();

    await capture();
    // While the request is in flight: the photo, the scan line, one honest label.
    expect(screen.getByTestId("ai-thinking")).toBeTruthy();
    expect(screen.getByTestId("scan-status")).toHaveTextContent(SCAN_LOOKING_LABEL);
    expect(screen.queryByTestId("scan-results")).toBeNull();
    await act(async () => answer!());
    await flush(); // no timer is advanced: nothing holds the answer back
    expect(screen.queryByTestId("ai-thinking")).toBeNull();
    expect(screen.getByTestId("scan-results")).toBeTruthy();
    expect(screen.getByText("Tavuk göğsü (ızgara)")).toBeTruthy();
    expect(screen.getByTestId("scan-mock-chip")).toBeTruthy(); // demo answer → "Demo modu"
  });

  test("portion presets and the gram keypad update the live total; removing a card drops it", async () => {
    await setup({ scanScenario: "single" });
    await renderUI(<ScanScreen />, { queryClient: makeQueryClient() });
    await capture();
    const card = screen.getAllByTestId(/^detection-portion-.*-grams$/)[0];
    const key = card.props.testID.slice("detection-portion-".length, -"-grams".length);

    expect(screen.getByTestId("scan-total-kcal")).toHaveTextContent(/580 kcal/); // 250 g × 232 kcal/100 g
    expect(screen.getByTestId(`detection-portion-${key}-preset-serving`).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId(`detection-portion-${key}-preset-100g`));
    expect(screen.getByTestId("scan-total-kcal")).toHaveTextContent(/232 kcal/);
    await fireEvent.press(screen.getByTestId(`detection-portion-${key}-preset-half`)); // ½ porsiyon = 125 g
    expect(screen.getByTestId("scan-total-kcal")).toHaveTextContent(/290 kcal/);

    // Keypad: the first digit replaces the amount, the rest append, Tamam closes it.
    await fireEvent.press(card);
    for (const k of ["3", "2", "0"]) await fireEvent.press(screen.getByTestId(`detection-portion-${key}-keypad-${k}`));
    expect(screen.getByTestId(`detection-portion-${key}-grams-value`)).toHaveTextContent("320 g");
    expect(screen.getByTestId("scan-total-kcal")).toHaveTextContent(/742 kcal/);
    await fireEvent.press(screen.getByTestId(`detection-portion-${key}-keypad-back`));
    expect(screen.getByTestId("scan-total-kcal")).toHaveTextContent(/74 kcal/); // 32 g
    await fireEvent.press(screen.getByTestId(`detection-portion-${key}-keypad-done`));
    expect(screen.queryByTestId(`detection-portion-${key}-keypad`)).toBeNull();

    await fireEvent.press(screen.getAllByLabelText(/kaldır$/)[0]);
    expect(screen.getByTestId("scan-total-kcal")).toHaveTextContent(/^0 kcal$/);
  });

  test("a low-confidence item asks “Bunu mu demek istedin?”; picking an alternative swaps the food", async () => {
    await setup(); // plate: chicken 86 %, rice 63 %, cacık 41 % (with alternatives)
    await renderUI(<ScanScreen />, { queryClient: makeQueryClient() });
    await capture();
    const prompts = screen.getAllByTestId(/^detection-unsure-/);
    expect(prompts).toHaveLength(1); // only the unsure one asks
    const key = prompts[0].props.testID.slice("detection-unsure-".length);
    expect(screen.getByTestId(`detection-name-${key}`)).toHaveTextContent("Cacık");
    expect(screen.getByText("Bunu mu demek istedin?")).toBeTruthy();
    expect(screen.getByTestId(`detection-alt-${key}-0`)).toHaveTextContent("Yoğurt (yarım yağlı)");
    const before = screen.getByTestId("scan-total-kcal").props.children;

    await fireEvent.press(screen.getByTestId(`detection-alt-${key}-0`));
    expect(screen.getByTestId(`detection-name-${key}`)).toHaveTextContent("Yoğurt (yarım yağlı)");
    expect(screen.queryByTestId(`detection-unsure-${key}`)).toBeNull();
    expect(screen.getByTestId("scan-total-kcal").props.children).not.toEqual(before);
  });

  test("“Evet, …” keeps the model's guess and stops asking", async () => {
    await setup();
    await renderUI(<ScanScreen />, { queryClient: makeQueryClient() });
    await capture();
    const key = screen.getAllByTestId(/^detection-unsure-/)[0].props.testID.slice("detection-unsure-".length);
    await fireEvent.press(screen.getByTestId(`detection-confirm-${key}`));
    expect(screen.queryByTestId(`detection-unsure-${key}`)).toBeNull();
    expect(screen.getByTestId(`detection-name-${key}`)).toHaveTextContent("Cacık");
  });

  test("swiping the results sheet down goes back to the camera and logs nothing", async () => {
    const api = await setup({ scanScenario: "single" });
    const addEntry = jest.spyOn(api.nutrition, "addEntry");
    await renderUI(<ScanScreen />, { queryClient: makeQueryClient() });
    await capture();
    expect(screen.getByTestId("scan-results")).toBeTruthy();
    await act(async () => resultsSheetDismiss()());
    expect(screen.getByTestId("scan-camera")).toBeTruthy();
    expect(screen.queryByTestId("scan-results")).toBeNull();
    expect(addEntry).not.toHaveBeenCalled();
  });

  test("swapping the results sheet for search is not a swipe: the scan survives", async () => {
    await setup({ scanScenario: "single" });
    await renderUI(<ScanScreen />, { queryClient: makeQueryClient() });
    await capture();
    const dismiss = resultsSheetDismiss();
    await fireEvent.press(screen.getByTestId("scan-add-more"));
    await act(async () => dismiss()); // gorhom reports the outgoing sheet a beat later
    expect(screen.queryByTestId("scan-camera")).toBeNull();
    expect(screen.getByTestId("food-search-input")).toBeTruthy();
  });

  test("saving writes one entry per detection with source 'scan' and returns to the day", async () => {
    const api = await setup({ scanScenario: "single" });
    const addEntry = jest.spyOn(api.nutrition, "addEntry");
    await renderUI(<ScanScreen />, { queryClient: makeQueryClient() });
    await capture();
    expect(screen.getByTestId("scan-results")).toBeTruthy();

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
    await renderUI(<ScanScreen />, { queryClient: makeQueryClient() });
    await capture();

    await waitFor(() => expect(screen.getByTestId("scan-not-food")).toBeTruthy());
    expect(screen.getByText("Burada yemek göremedim")).toBeTruthy();
    expect(screen.getByText("Yemek ara")).toBeTruthy();
    expect(screen.getByTestId("scan-retake")).toBeTruthy();
  });

  test("a vision outage explains itself and offers search instead of crashing", async () => {
    await setup({ scanFails: "unavailable" });
    await renderUI(<ScanScreen />, { queryClient: makeQueryClient() });
    await capture();

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
    await renderUI(<ScanScreen />, { queryClient: makeQueryClient() });
    await fireEvent.press(screen.getByTestId("scan-gallery"));
    await flush();
    expect(screen.getByTestId("scan-results")).toBeTruthy();
  });
});

import React from "react";
import { AppState, Text as RNText } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { ThemeProvider } from "../../src/theme";
import { ToastProvider, useToast } from "../../src/ui/Toast";
import { Pressable } from "../../src/ui/Pressable";
import { FlooCornerHost, FlooVoiceProvider, useFloo, useFlooOnce, type FlooMessage } from "../../src/mascot/voice";
import { storage } from "../../src/lib/storage";

function Harness({ enabled = true, host = true, children }: { enabled?: boolean; host?: boolean; children?: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <FlooVoiceProvider enabled={enabled}>
          {children}
          {host ? <FlooCornerHost presence="idle" /> : null}
        </FlooVoiceProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function Sayer({ msg, id = "say" }: { msg: FlooMessage | string; id?: string }) {
  const { say } = useFloo();
  return (
    <Pressable testID={id} onPress={() => say(msg)}>
      <RNText>say</RNText>
    </Pressable>
  );
}

function Toaster() {
  const toast = useToast();
  return (
    <Pressable testID="toast-error" onPress={() => toast.show({ message: "Kaydedilemedi, bağlantını kontrol et.", kind: "error" })}>
      <RNText>t</RNText>
    </Pressable>
  );
}

// The first render pays the mascot model's cold start (~5 s under a full parallel run).
jest.setTimeout(20_000);

describe("Floo voice", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    storage.clearAll();
  });
  afterEach(() => jest.useRealTimers());

  test("say() shows the bubble from the corner Floo and it leaves on its own", async () => {
    await render(
      <Harness>
        <Sayer msg="Protein hedefinin gerisindesin." />
      </Harness>
    );
    expect(screen.getByTestId("floo-corner")).toBeTruthy();
    expect(screen.queryByTestId("floo-bubble")).toBeNull();
    await fireEvent.press(screen.getByTestId("say"));
    expect(screen.getByTestId("floo-bubble").props.accessibilityLabel).toBe("Floo: Protein hedefinin gerisindesin.");
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(screen.queryByTestId("floo-bubble")).toBeNull();
  });

  test("one bubble at a time: the next line waits, the corner shows how many wait, a tap moves on", async () => {
    await render(
      <Harness>
        <Sayer msg="Birinci" id="a" />
        <Sayer msg="İkinci" id="b" />
      </Harness>
    );
    await fireEvent.press(screen.getByTestId("a"));
    await fireEvent.press(screen.getByTestId("b"));
    expect(screen.getByTestId("floo-bubble").props.accessibilityLabel).toBe("Floo: Birinci");
    expect(screen.getByLabelText("1 mesaj daha")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("floo-bubble"));
    expect(screen.getByTestId("floo-bubble").props.accessibilityLabel).toBe("Floo: İkinci");
  });

  test("warnings buzz and carry an action that runs and closes the bubble", async () => {
    const onPress = jest.fn();
    await render(
      <Harness>
        <Sayer msg={{ text: "Hedefi aştın.", priority: "high", action: { label: "Beslenmeye git", onPress } }} />
      </Harness>
    );
    await fireEvent.press(screen.getByTestId("say"));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("warning");
    await fireEvent.press(screen.getByTestId("floo-bubble-action"));
    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByTestId("floo-bubble")).toBeNull();
  });

  test("error toasts become Floo's warnings while Floo is on screen", async () => {
    await render(
      <Harness>
        <Toaster />
      </Harness>
    );
    await fireEvent.press(screen.getByTestId("toast-error"));
    expect(screen.getByTestId("floo-bubble").props.accessibilityLabel).toBe("Floo: Kaydedilemedi, bağlantını kontrol et.");
    expect(screen.queryByRole("alert", { name: undefined })).toBeTruthy();
  });

  test("with the mascot off, lines fall back to toasts and no Floo is drawn", async () => {
    await render(
      <Harness enabled={false}>
        <Sayer msg="Su içmeyi unutma." />
      </Harness>
    );
    expect(screen.queryByTestId("floo-corner")).toBeNull();
    await fireEvent.press(screen.getByTestId("say"));
    expect(screen.getByText("Su içmeyi unutma.")).toBeTruthy();
    expect(screen.queryByTestId("floo-bubble")).toBeNull();
  });

  test("with no host mounted (sign-in), error toasts stay toasts", async () => {
    await render(
      <Harness host={false}>
        <Toaster />
      </Harness>
    );
    await fireEvent.press(screen.getByTestId("toast-error"));
    expect(screen.getByText("Kaydedilemedi, bağlantını kontrol et.")).toBeTruthy();
  });

  test("useFlooOnce says a line once per key, across remounts", async () => {
    function Once() {
      useFlooOnce("home:over:2026-09-24", { text: "Bugün hedefini aştın." });
      return null;
    }
    const first = await render(
      <Harness>
        <Once />
      </Harness>
    );
    expect(screen.getByTestId("floo-bubble")).toBeTruthy();
    await first.unmount();
    await render(
      <Harness>
        <Once />
      </Harness>
    );
    expect(screen.queryByTestId("floo-bubble")).toBeNull();
  });

  test("useFlooOnce only uses up its key once the line was on screen", async () => {
    function Once() {
      useFlooOnce("home:over:2026-09-24", { text: "Bugün hedefini aştın." });
      return null;
    }
    const ui = (enabled: boolean, once: boolean) => (
      <Harness enabled={enabled}>
        <Sayer msg={{ text: "Önce bu satır.", ttlMs: null }} />
        {once ? <Once /> : null}
      </Harness>
    );
    const r = await render(ui(true, false));
    await fireEvent.press(screen.getByTestId("say"));
    // The once-line waits behind the one on screen...
    await r.rerender(ui(true, true));
    expect(screen.getByTestId("floo-bubble").props.accessibilityLabel).toBe("Floo: Önce bu satır.");
    // ...and is dropped unseen when the mascot is switched off.
    await r.rerender(ui(false, true));
    await r.rerender(ui(true, false));
    // Next visit: it was never seen, so it is said now.
    await r.rerender(ui(true, true));
    expect(screen.getByTestId("floo-bubble").props.accessibilityLabel).toBe("Floo: Bugün hedefini aştın.");
  });

  test("a line that arrives while the app is in the background waits for the foreground, beat and clock included", async () => {
    const before = Object.getOwnPropertyDescriptor(AppState, "currentState");
    Object.defineProperty(AppState, "currentState", { value: "background", configurable: true });
    const onShow = jest.fn();
    try {
      await render(
        <Harness>
          <Sayer msg={{ text: "Hedefi aştın.", priority: "high", trigger: "overTarget", ttlMs: 1000, onShow }} />
        </Harness>
      );
      await fireEvent.press(screen.getByTestId("say"));
      expect(onShow).not.toHaveBeenCalled();
      expect(Haptics.notificationAsync).not.toHaveBeenCalled();
      // Its clock does not run while nobody can read it.
      await act(async () => {
        jest.advanceTimersByTime(1500);
      });
      expect(screen.getByTestId("floo-bubble")).toBeTruthy();

      Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
      const listeners = (AppState.addEventListener as jest.Mock).mock.calls.filter(([type]) => type === "change").map(([, fn]) => fn as (s: string) => void);
      await act(async () => {
        for (const fn of listeners) fn("active");
      });
      expect(onShow).toHaveBeenCalledTimes(1);
      expect(Haptics.notificationAsync).toHaveBeenCalledWith("warning");
      await act(async () => {
        jest.advanceTimersByTime(1500);
      });
      expect(screen.queryByTestId("floo-bubble")).toBeNull();
    } finally {
      if (before) Object.defineProperty(AppState, "currentState", before);
    }
  });

  test("tapping an idle Floo brings the last line back", async () => {
    await render(
      <Harness>
        <Sayer msg="Harika gidiyorsun." />
      </Harness>
    );
    await fireEvent.press(screen.getByTestId("say"));
    await fireEvent.press(screen.getByTestId("floo-bubble"));
    expect(screen.queryByTestId("floo-bubble")).toBeNull();
    await fireEvent.press(screen.getByTestId("floo-corner"));
    expect(screen.getByTestId("floo-bubble").props.accessibilityLabel).toBe("Floo: Harika gidiyorsun.");
  });
});

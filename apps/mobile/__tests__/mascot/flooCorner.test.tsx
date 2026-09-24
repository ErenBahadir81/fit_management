import React, { useState } from "react";
import { Text as RNText } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import * as skiaWeb from "../../src/lib/skiaWeb";
import { ThemeProvider } from "../../src/theme";
import { ToastProvider } from "../../src/ui/Toast";
import { Pressable } from "../../src/ui/Pressable";
import { FLOO_CORNER_SIZE, FlooCornerHost, FlooVoiceProvider, useFloo, type FlooMessage } from "../../src/mascot/voice";

jest.mock("../../src/mascot/model/FlooModel", () => jest.requireActual("../mocks/flooModel"));

function Sayer({ msg, id }: { msg: FlooMessage; id: string }) {
  const { say } = useFloo();
  return (
    <Pressable testID={id} onPress={() => say(msg)}>
      <RNText>{id}</RNText>
    </Pressable>
  );
}

/** A modal flow: mounts the modal stack's own `auto` host on top of the tabs' `idle` one. */
function Modal() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable testID="toggle-modal" onPress={() => setOpen((o) => !o)}>
        <RNText>modal</RNText>
      </Pressable>
      {open ? <FlooCornerHost presence="auto" /> : null}
    </>
  );
}

function Harness() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <FlooVoiceProvider>
          <FlooCornerHost presence="idle" />
          <Sayer id="meal" msg={{ text: "Afiyet olsun!", mood: "happy", trigger: "mealLogged" }} />
          <Sayer id="goal" msg={{ text: "Hedef tamam!", mood: "celebrate", trigger: "goalHit" }} />
          <Modal />
        </FlooVoiceProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

/** What each host asked the model to draw. Tree order: the tabs' host first, the modal's (when open) second. */
const models = () => screen.getAllByTestId("floo-corner-model").map((m) => m.props.flooProps);

describe("FlooCornerHost", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test("draws Floo 3's badge in the corner, not the v1 adapter", async () => {
    await render(<Harness />);
    const [corner] = models();
    expect(corner).toEqual(expect.objectContaining({ lod: "badge", size: FLOO_CORNER_SIZE, mood: "happy", trigger: null }));
    expect(screen.getByTestId("floo-corner")).toBeTruthy();
  });

  test("a line's mood and gesture reach the model; the face goes back to rest when it is done; a tap boops", async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId("goal"));
    expect(models()[0].mood).toBe("celebrate");
    expect(models()[0].trigger).toEqual({ name: "goalHit", key: expect.any(Number) });
    await fireEvent.press(screen.getByTestId("floo-bubble"));
    expect(models()[0].mood).toBe("happy");
    // Idle Floo, tapped: the last line comes back without replaying its beat, and Floo boops.
    await fireEvent.press(screen.getByTestId("floo-corner"));
    expect(screen.getByTestId("floo-bubble").props.accessibilityLabel).toBe("Floo: Hedef tamam!");
    expect(models()[0].trigger?.name).toBe("tap");
  });

  test("a host never replays a beat that played before it mounted or while it was covered", async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId("meal"));
    await fireEvent.press(screen.getByTestId("floo-bubble"));

    // A modal opens: its host takes over, and does not start by replaying the meal's gesture.
    await fireEvent.press(screen.getByTestId("toggle-modal"));
    let [tabs, modal] = models();
    expect(modal.trigger).toBeNull();

    // Something happens inside the modal: only the modal's Floo plays it.
    await fireEvent.press(screen.getByTestId("goal"));
    [tabs, modal] = models();
    expect(modal.trigger?.name).toBe("goalHit");
    expect(modal.mood).toBe("celebrate");
    expect(tabs.trigger).toBeNull();
    await fireEvent.press(screen.getByTestId("floo-bubble"));

    // The modal closes: the tabs' Floo is back in charge and stays calm.
    await fireEvent.press(screen.getByTestId("toggle-modal"));
    expect(models()).toHaveLength(1);
    expect(models()[0].trigger).toBeNull();

    // And it still reacts to what comes next.
    await fireEvent.press(screen.getByTestId("meal"));
    expect(models()[0].trigger?.name).toBe("mealLogged");
  });

  test("without CanvasKit (web fallback) the corner draws the SVG Floo with the nearest face", async () => {
    jest.spyOn(skiaWeb, "isSkiaUnavailable").mockReturnValue(true);
    await render(<Harness />);
    expect(models()).toEqual([undefined]);
    await fireEvent.press(screen.getByTestId("goal"));
    expect(screen.getByTestId("floo-corner-model").props.accessibilityLabel).toBe("Floo, coşkulu");
    expect(screen.getByTestId("floo-bubble").props.accessibilityLabel).toBe("Floo: Hedef tamam!");
  });
});

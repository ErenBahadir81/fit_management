import React from "react";
import { render, screen } from "@testing-library/react-native";
import RootLayout from "../../app/_layout";
import { useSession } from "../../src/features/auth/session";

jest.mock("expo-router", () => jest.requireActual("../mocks/expo-router"));

// Stand-in bridge that reports whether it sits inside a real `FlooVoiceProvider` (outside one,
// `useFloo()` is a disabled no-op voice) and how many of it are mounted.
jest.mock("../../src/mascot/voice/FlooEventBridge", () => {
  const react = jest.requireActual("react");
  const rn = jest.requireActual("react-native");
  const { useFloo } = jest.requireActual("../../src/mascot/voice/FlooVoiceProvider");
  return {
    FlooEventBridge: () => {
      const voice = useFloo();
      return react.createElement(rn.View, { testID: "floo-event-bridge", voiceEnabled: voice.enabled });
    },
  };
});

/**
 * Events from the data layer (a meal logged, a workout done…) only reach the corner Floo if the
 * bridge is mounted inside the voice provider, once, above every navigator. This guards the wiring;
 * `__tests__/mascot/eventBridge.test.tsx` covers what the bridge does with an event.
 */
it("mounts exactly one Floo event bridge, inside the voice provider", async () => {
  useSession.setState({ status: "signedOut", user: null, boot: jest.fn(async () => {}) });
  await render(<RootLayout />);
  const bridges = screen.getAllByTestId("floo-event-bridge");
  expect(bridges).toHaveLength(1);
  expect(bridges[0]!.props.voiceEnabled).toBe(true);
});

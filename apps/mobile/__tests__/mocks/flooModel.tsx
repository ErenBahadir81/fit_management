/*
 * FlooModel stand-in: a plain host view that carries the props it was given as `flooProps`, so a
 * test can read what the character was asked to draw (mood, trigger, level of detail…). RNTL 14
 * only sees host elements, so the real component's props are not reachable otherwise.
 *
 *   jest.mock("../../src/mascot/model/FlooModel", () => jest.requireActual("../mocks/flooModel"));
 *   screen.getByTestId("floo-corner-model").props.flooProps.trigger
 */
import React from "react";
import { View } from "react-native";
import type { FlooModelProps } from "../../src/mascot/model/FlooModel";

export const FLOO_MODEL_ASPECT = 290 / 200;

export function FlooModel(props: FlooModelProps) {
  return React.createElement(View, { testID: props.testID, flooProps: props } as React.ComponentProps<typeof View>);
}

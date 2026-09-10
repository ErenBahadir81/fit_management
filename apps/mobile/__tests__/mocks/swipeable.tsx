/* Pass-through ReanimatedSwipeable for screen tests (RNGH's real one logs worklet warnings under Jest). */
import React, { forwardRef, useImperativeHandle } from "react";
import { View } from "react-native";

const Swipeable = forwardRef<{ close: () => void; openLeft: () => void; openRight: () => void; reset: () => void }, { children?: React.ReactNode }>(function Swipeable({ children }, ref) {
  useImperativeHandle(ref, () => ({ close: () => {}, openLeft: () => {}, openRight: () => {}, reset: () => {} }), []);
  return <View>{children}</View>;
});

module.exports = { __esModule: true, default: Swipeable };

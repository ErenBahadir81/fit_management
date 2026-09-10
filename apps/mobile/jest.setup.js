require("react-native-gesture-handler/jestSetup");
require("react-native-reanimated").setUpTests();

// react-native-mmkv v4 is a Nitro module — no JS fallback under Jest.
jest.mock("react-native-mmkv", () => {
  const store = new Map();
  const instance = {
    set: (k, v) => store.set(k, v),
    getString: (k) => store.get(k),
    getNumber: (k) => store.get(k),
    getBoolean: (k) => store.get(k),
    contains: (k) => store.has(k),
    delete: (k) => store.delete(k),
    remove: (k) => store.delete(k),
    clearAll: () => store.clear(),
    getAllKeys: () => [...store.keys()],
  };
  return { createMMKV: () => instance, existsMMKV: () => true, deleteMMKV: () => {} };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Soft: "soft", Rigid: "rigid" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    isAvailableAsync: jest.fn(async () => true),
    getItemAsync: jest.fn(async (k) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k, v) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k) => void store.delete(k)),
  };
});

// Native-only libraries → their official jest mocks.
jest.mock("@gorhom/bottom-sheet", () => require("@gorhom/bottom-sheet/mock"));
jest.mock("react-native-keyboard-controller", () => require("react-native-keyboard-controller/jest"));
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

// Skia + victory-native need CanvasKit under Jest; the chart *math* is tested directly (src/charts/chartMath.ts),
// the Skia canvas is replaced by plain views so screens that embed charts still render.
jest.mock("@shopify/react-native-skia", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Stub = (props) => React.createElement(View, { testID: props.testID }, props.children);
  return new Proxy(
    { Canvas: Stub, Path: Stub, Circle: Stub, Group: Stub, DashPathEffect: Stub, Rect: Stub, Line: Stub, Text: Stub, LinearGradient: Stub, vec: (x, y) => ({ x, y }), Skia: {} },
    { get: (t, k) => (k in t ? t[k] : Stub) }
  );
});
jest.mock("victory-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Stub = (props) => React.createElement(View, { testID: props.testID }, typeof props.children === "function" ? null : props.children);
  const { makeMutable } = require("react-native-reanimated");
  return {
    CartesianChart: Stub,
    Line: Stub,
    Scatter: Stub,
    Bar: Stub,
    Area: Stub,
    useChartPressState: (init) => ({
      state: {
        isActive: makeMutable(false),
        matchedIndex: makeMutable(-1),
        x: { value: makeMutable(init.x), position: makeMutable(0) },
        y: Object.fromEntries(Object.entries(init.y).map(([k, v]) => [k, { value: makeMutable(v), position: makeMutable(0) }])),
        yIndex: makeMutable(-1),
      },
      isActive: false,
    }),
  };
});

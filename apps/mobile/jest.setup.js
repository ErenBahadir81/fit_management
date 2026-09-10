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

// FlashList v2 has no layout engine under Jest: it measures a 0×0 parent, renders nothing, and
// re-measures forever the moment the data shrinks ("Maximum update depth exceeded"). Every screen
// test renders the same tree without virtualization instead — header, rows, empty/footer slots and
// the refresh control all behave like the real list, just eagerly.
jest.mock("@shopify/flash-list", () => {
  const React = require("react");
  const { RefreshControl, ScrollView, View } = require("react-native");
  const actual = jest.requireActual("@shopify/flash-list");
  const node = (C) => (React.isValidElement(C) ? C : typeof C === "function" ? React.createElement(C) : null);
  const FlashList = React.forwardRef(function FlashListMock(props, ref) {
    const {
      data = [],
      renderItem,
      keyExtractor,
      ListHeaderComponent,
      ListEmptyComponent,
      ListFooterComponent,
      contentContainerStyle,
      testID,
      refreshing,
      onRefresh,
      refreshControl,
      renderScrollComponent,
      horizontal,
      keyboardShouldPersistTaps,
      showsVerticalScrollIndicator,
      showsHorizontalScrollIndicator,
    } = props;
    React.useImperativeHandle(ref, () => ({ scrollToOffset: () => {}, scrollToIndex: () => {}, scrollToEnd: () => {}, scrollToTop: () => {} }), []);
    const Scroller = renderScrollComponent ?? ScrollView;
    return React.createElement(
      Scroller,
      {
        testID,
        horizontal,
        keyboardShouldPersistTaps,
        showsVerticalScrollIndicator,
        showsHorizontalScrollIndicator,
        contentContainerStyle,
        refreshControl: refreshControl ?? (onRefresh ? React.createElement(RefreshControl, { refreshing: Boolean(refreshing), onRefresh }) : undefined),
      },
      node(ListHeaderComponent),
      data.length === 0 ? node(ListEmptyComponent) : data.map((item, index) => React.createElement(View, { key: keyExtractor ? keyExtractor(item, index) : String(index) }, renderItem({ item, index, target: "Cell", extraData: props.extraData }))),
      node(ListFooterComponent)
    );
  });
  return { ...actual, FlashList, AnimatedFlashList: FlashList };
});

// expo-camera is native; screens mount it only on device. Tests that need to drive a scan replace
// this stub with their own (a test-file `jest.mock` wins over this one).
jest.mock("expo-camera", () => {
  const React = require("react");
  const { View } = require("react-native");
  const CameraView = React.forwardRef(function CameraViewMock(props, ref) {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: async () => ({ uri: "file://photo.jpg", width: 800, height: 600, format: "jpg" }) }), []);
    return React.createElement(View, { testID: props.testID ?? "camera-view" });
  });
  return {
    CameraView,
    useCameraPermissions: () => [{ granted: true, canAskAgain: true, status: "granted" }, jest.fn(async () => ({ granted: true, canAskAgain: true, status: "granted" }))],
  };
});

// expo-image needs its native view; a plain View keeps `source`/`testID` for assertions.
jest.mock("expo-image", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { Image: (props) => React.createElement(View, { testID: props.testID, accessibilityLabel: props.accessibilityLabel, style: props.style }) };
});

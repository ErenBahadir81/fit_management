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
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Soft: "soft", Rigid: "rigid" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (k) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k, v) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k) => void store.delete(k)),
  };
});

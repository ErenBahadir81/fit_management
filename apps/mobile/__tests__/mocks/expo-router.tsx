/* Minimal expo-router mock for screen tests: `jest.mock("expo-router", () => require("../mocks/expo-router"))`. */
import React from "react";
import { View } from "react-native";

export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  dismiss: jest.fn(),
  canGoBack: jest.fn(() => false),
  setParams: jest.fn(),
};
export const router = mockRouter;
export const useRouter = () => mockRouter;
export const useFocusEffect = (cb: () => void | (() => void)) => React.useEffect(cb, []);
export const useLocalSearchParams = () => ({});
export const useGlobalSearchParams = () => ({});
export const useSegments = () => [];
export const usePathname = () => "/";
export const useNavigation = () => ({ setOptions: jest.fn() });
export const Link = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
export const Redirect = () => null;
const Nav = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
export const Stack = Object.assign(Nav, { Screen: () => null, Protected: Nav });
export const Tabs = Object.assign(Nav, { Screen: () => null, Protected: Nav });
export const SplashScreen = { hideAsync: jest.fn(async () => {}), preventAutoHideAsync: jest.fn(async () => {}) };

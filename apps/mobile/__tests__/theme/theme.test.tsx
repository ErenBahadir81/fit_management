import React from "react";
import { Text } from "react-native";
import { render, renderHook, act, screen } from "@testing-library/react-native";
import { ThemeProvider, useTheme } from "../../src/theme";
import { light, dark } from "../../src/theme/tokens";
import { storage } from "../../src/lib/storage";

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

describe("useTheme", () => {
  beforeEach(() => storage.clearAll());

  test("defaults to following the system (light in tests)", async () => {
    const { result } = await renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe("system");
    expect(result.current.scheme).toBe("light");
    expect(result.current.colors.primary).toBe("#6D5DF6");
    expect(result.current.colors.bg).toBe(light.bg);
  });

  test("manual override switches tokens and persists to MMKV", async () => {
    const { result } = await renderHook(() => useTheme(), { wrapper });
    await act(async () => result.current.setMode("dark"));
    expect(result.current.scheme).toBe("dark");
    expect(result.current.colors.bg).toBe(dark.bg);
    expect(storage.getString("theme.mode")).toBe("dark");
  });

  test("restores a persisted override on mount", async () => {
    storage.set("theme.mode", "dark");
    const { result } = await renderHook(() => useTheme(), { wrapper });
    expect(result.current.scheme).toBe("dark");
  });

  test("exposes spacing, radii, type scale and shadows", async () => {
    const { result } = await renderHook(() => useTheme(), { wrapper });
    expect(result.current.spacing.gutter).toBe(20);
    expect(result.current.radii.card).toBe(24);
    expect(result.current.radii.control).toBe(14);
    expect(result.current.type.hero.fontSize).toBe(40);
    expect(result.current.shadows.card).toBeDefined();
  });

  test("throws a helpful error outside the provider", async () => {
    const Bad = () => {
      useTheme();
      return <Text>x</Text>;
    };
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(render(<Bad />)).rejects.toThrow(/ThemeProvider/);
    spy.mockRestore();
  });

  test("provider renders children", async () => {
    await render(
      <ThemeProvider>
        <Text>child</Text>
      </ThemeProvider>
    );
    expect(screen.getByText("child")).toBeTruthy();
  });
});

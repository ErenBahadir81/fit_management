import React from "react";
import { waitFor } from "@testing-library/react-native";
import { renderHookUI } from "../helpers";
import { useMascot } from "../../src/mascot/useMascot";
import { setApi } from "../../src/lib/api";
import { createFakeApi } from "../../src/lib/fake";

describe("useMascot", () => {
  beforeEach(() => {
    setApi(createFakeApi({ latencyMs: 0, signedIn: true }));
  });

  test("returns the seeded message immediately when one is provided (home composite)", async () => {
    const { result } = await renderHookUI(() => useMascot("home", { mood: "cheer", text: "Harika gidiyorsun!", key: "home.morning" }));
    expect(result.current.mood).toBe("cheer");
    expect(result.current.text).toBe("Harika gidiyorsun!");
  });

  test("fetches /mascot/message for a context and resolves to a mood + text", async () => {
    const { result } = await renderHookUI(() => useMascot("body"));
    expect(result.current.isLoading).toBe(true);
    expect(["happy", "think", "sleepy", "cheer", "flex", "worried"]).toContain(result.current.mood);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.text.length).toBeGreaterThan(3);
  });

  test("falls back to a calm default when the request fails", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    api.mascot.message = (async () => {
      throw new Error("boom");
    }) as typeof api.mascot.message;
    setApi(api);
    const { result } = await renderHookUI(() => useMascot("goal"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.text.length).toBeGreaterThan(0);
    expect(result.current.mood).toBe("happy");
  });
});

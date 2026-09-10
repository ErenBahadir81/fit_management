import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { QueryClient } from "@tanstack/react-query";
import { Providers, makeQueryClient } from "../../../__tests__/helpers";
import { setApi } from "../../lib/api";
import { createFakeApi } from "../../lib/fake";
import { useDebouncedValue } from "./useDebouncedValue";
import { SEARCH_DEBOUNCE_MS, useFoodSearch } from "./useNutrition";

const wrap = (queryClient?: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <Providers queryClient={queryClient}>{children}</Providers>;
  };

describe("useDebouncedValue", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("holds the value until typing stops for 300 ms", async () => {
    const { result, rerender } = await renderHook(({ v }: { v: string }) => useDebouncedValue(v, SEARCH_DEBOUNCE_MS), { initialProps: { v: "t" } });
    expect(result.current).toBe("t");

    await rerender({ v: "ta" });
    await rerender({ v: "tav" });
    await act(async () => void jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(result.current).toBe("t"); // every keystroke restarted the timer

    await act(async () => void jest.advanceTimersByTime(1));
    expect(result.current).toBe("tav");
  });

  test("clearing the box is applied immediately (recents come straight back)", async () => {
    const { result, rerender } = await renderHook(({ v }: { v: string }) => useDebouncedValue(v, SEARCH_DEBOUNCE_MS), { initialProps: { v: "tavuk" } });
    await rerender({ v: "" });
    expect(result.current).toBe("");
  });
});

describe("useFoodSearch", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("stays quiet under two characters and fires exactly one request per pause", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    const search = jest.spyOn(api.nutrition, "search");
    setApi(api);

    const { result, rerender } = await renderHook(({ v }: { v: string }) => useFoodSearch(v), { initialProps: { v: "t" }, wrapper: wrap(makeQueryClient()) });
    await act(async () => void jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(search).not.toHaveBeenCalled();
    expect(result.current.foods).toEqual([]);

    await rerender({ v: "ta" });
    await rerender({ v: "tav" });
    await rerender({ v: "tavu" });
    await act(async () => void jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    await waitFor(() => expect(result.current.foods.length).toBeGreaterThan(0));
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("tavu", { remote: false });
    expect(result.current.foods[0].name).toMatch(/Tavuk/);
    expect(result.current.isTyping).toBe(false);
  });

  test("the remote toggle asks the API for Open Food Facts results too", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    const search = jest.spyOn(api.nutrition, "search");
    setApi(api);

    const { result } = await renderHook(() => useFoodSearch("yumurta", { remote: true }), { wrapper: wrap(makeQueryClient()) });
    await act(async () => void jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    await waitFor(() => expect(result.current.foods.length).toBeGreaterThan(0));
    expect(search).toHaveBeenCalledWith("yumurta", { remote: true });
  });
});

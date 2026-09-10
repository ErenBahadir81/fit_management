/**
 * Nutrition data layer: one query per screen area, optimistic writes with rollback, and a single
 * place that invalidates the home composite after anything changes.
 *
 * Query keys (contract with the rest of the app):
 *   ["nutrition-day", dateKey] · ["nutrition-week", weekKey] · ["foods", q] · ["nutrition-target"] · ["nutrition-recent"]
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  shiftKey,
  weekKeyFor,
  type DietTargetDTO,
  type FoodDTO,
  type FoodSearchResponse,
  type Meal,
  type MealEntryDTO,
  type NutritionDayView,
  type Per100g,
  type WeekNutrition,
  type Weekday,
} from "@fitfloow/core";
import { useSession } from "../auth/session";
import { useInvalidateHome } from "../home/useHome";
import { REPORT_KEYS } from "../reports/useReport";
import { getApi } from "../../lib/api";
import { todayKey } from "../../lib/dates";
import { FAKE_API } from "../../lib/env";
import { describeError } from "../../lib/errors";
import { useToast } from "../../ui/Toast";
import { addEntryToDay, makeOptimisticEntry, removeEntryFromDay, replaceEntryInDay, updateEntryInDay, type DraftEntry } from "./model/day";
import { useDebouncedValue } from "./useDebouncedValue";

export const nutritionDayKey = (dateKey: string) => ["nutrition-day", dateKey] as const;
export const nutritionWeekKey = (weekKey: string) => ["nutrition-week", weekKey] as const;
export const foodsQueryKey = (q: string, remote = false) => (remote ? (["foods", q, "remote"] as const) : (["foods", q] as const));
export const NUTRITION_TARGET_KEY = ["nutrition-target"] as const;
export const NUTRITION_RECENT_KEY = ["nutrition-recent"] as const;

/** Minimum characters before the search actually hits the API. */
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Demo mode only: seed the extra nutrition foods/barcodes into the in-memory fake so search,
 * recents and the barcode reader have something to show. Required lazily so the fixtures never
 * reach a production bundle (same pattern as `lib/api.ts`).
 */
let demoSeeded = false;
type NutritionFakeModule = typeof import("../../lib/fake/nutritionFake");
type FakeStateOf = Parameters<NutritionFakeModule["findByBarcode"]>[0];

function nutritionFake(): { mod: NutritionFakeModule; state: FakeStateOf } | null {
  if (!FAKE_API) return null;
  const state = (getApi() as { fake?: FakeStateOf }).fake;
  if (!state) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return { mod: require("../../lib/fake/nutritionFake") as NutritionFakeModule, state };
}
function ensureDemoFixtures(): void {
  if (demoSeeded) return;
  const fake = nutritionFake();
  if (!fake) return;
  demoSeeded = true;
  fake.mod.installNutritionFixtures(fake.state);
}

export function useNutritionDay(dateKey: string) {
  ensureDemoFixtures();
  return useQuery<NutritionDayView>({ queryKey: nutritionDayKey(dateKey), queryFn: () => getApi().nutrition.day(dateKey) });
}

/** The measurement day decides where the user's week starts (Türkiye time, never `getDay()`). */
export function useWeekStart(): Weekday {
  const user = useSession((s) => s.user);
  return (user?.measurementDay ?? 1) as Weekday;
}

export function useNutritionWeek(dateKey: string, enabled = true) {
  const startWeekday = useWeekStart();
  const weekKey = weekKeyFor(dateKey, startWeekday);
  const q = useQuery<WeekNutrition>({ queryKey: nutritionWeekKey(weekKey), queryFn: () => getApi().nutrition.week(weekKey), enabled });
  return { ...q, weekKey };
}

export function useNutritionTarget() {
  return useQuery<DietTargetDTO>({ queryKey: NUTRITION_TARGET_KEY, queryFn: () => getApi().nutrition.target(), staleTime: 5 * 60_000 });
}

export function useRecentFoods() {
  return useQuery<FoodDTO[]>({ queryKey: NUTRITION_RECENT_KEY, queryFn: async () => (await getApi().nutrition.recent()).foods, staleTime: 60_000 });
}

export interface FoodSearch {
  /** Debounced text actually sent to the API. */
  query: string;
  foods: FoodDTO[];
  remote: FoodDTO[];
  isPending: boolean;
  isError: boolean;
  /** True while the user is still typing ahead of the debounce. */
  isTyping: boolean;
}

/** Local (and optionally Open Food Facts) search, debounced by 300 ms. */
export function useFoodSearch(input: string, opts: { remote?: boolean } = {}): FoodSearch {
  const remote = Boolean(opts.remote);
  const debounced = useDebouncedValue(input, SEARCH_DEBOUNCE_MS);
  const q = debounced.trim();
  const enabled = q.length >= SEARCH_MIN_CHARS;
  const query = useQuery<FoodSearchResponse>({
    queryKey: foodsQueryKey(q, remote),
    queryFn: () => getApi().nutrition.search(q, { remote }),
    enabled,
    staleTime: 5 * 60_000,
  });
  return {
    query: q,
    foods: query.data?.foods ?? [],
    remote: query.data?.remote ?? [],
    isPending: enabled && query.isPending,
    isError: query.isError,
    isTyping: input.trim() !== q,
  };
}

/* ------------------------------- mutations ------------------------------- */

export interface AddEntryInput {
  meal: Meal;
  grams: number;
  /** Either a catalog food… */
  food?: FoodDTO | null;
  /** …or a hand-typed one (also the local preview when only `foodId` is known, e.g. undo). */
  custom?: { name: string; per100g: Per100g } | null;
  /** Catalog id without the full food (undo of a deleted entry, scan results). */
  foodId?: string | null;
  source?: MealEntryDTO["source"];
  scanId?: string | null;
}

/** The API accepts `foodId` XOR `custom`; a linked food always wins. */
function entryPayload(input: AddEntryInput, dateKey: string) {
  const foodId = input.food?.id ?? input.foodId ?? undefined;
  return {
    dateKey,
    meal: input.meal,
    grams: input.grams,
    foodId,
    custom: foodId ? undefined : input.custom ?? undefined,
    source: input.source ?? (foodId ? "search" : "manual"),
    scanId: input.scanId ?? undefined,
  } as const;
}

function draftOf(input: AddEntryInput, dateKey: string): DraftEntry {
  const per100g = input.food?.per100g ?? input.custom?.per100g;
  if (!per100g) throw new Error("food veya custom gerekli");
  return {
    dateKey,
    meal: input.meal,
    name: input.food?.name ?? input.custom?.name ?? "Yiyecek",
    grams: input.grams,
    per100g,
    foodId: input.food?.id ?? input.foodId ?? null,
    source: input.source ?? (input.food ?? input.foodId ? "search" : "manual"),
    scanId: input.scanId ?? null,
  };
}

/** Day cache patch that also keeps `["nutrition-day", <today>]` honest when a write targets today. */
function patchDay(qc: QueryClient, dateKey: string, fn: (day: NutritionDayView) => NutritionDayView): NutritionDayView | undefined {
  const key = nutritionDayKey(dateKey);
  const prev = qc.getQueryData<NutritionDayView>(key);
  if (prev) qc.setQueryData(key, fn(prev));
  return prev;
}

function useAfterWrite(dateKey: string) {
  const qc = useQueryClient();
  const invalidateHome = useInvalidateHome();
  const startWeekday = useWeekStart();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: nutritionDayKey(dateKey) });
    void qc.invalidateQueries({ queryKey: nutritionWeekKey(weekKeyFor(dateKey, startWeekday)) });
    void qc.invalidateQueries({ queryKey: NUTRITION_RECENT_KEY });
    void qc.invalidateQueries({ queryKey: REPORT_KEYS.all }); // deficit bars, score, highlights
    void invalidateHome();
  }, [dateKey, invalidateHome, qc, startWeekday]);
}

/** Add a meal entry. The day view updates before the request leaves the device. */
export function useAddEntry(dateKey: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const afterWrite = useAfterWrite(dateKey);

  return useMutation({
    mutationFn: async (input: AddEntryInput) => (await getApi().nutrition.addEntry(entryPayload(input, dateKey))).entry,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: nutritionDayKey(dateKey) });
      const optimistic = makeOptimisticEntry(draftOf(input, dateKey));
      const prev = patchDay(qc, dateKey, (day) => addEntryToDay(day, optimistic));
      return { prev, optimisticId: optimistic.id };
    },
    onError: (e, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(nutritionDayKey(dateKey), ctx.prev);
      toast.show({ message: describeError(e, "Ekleyemedim, tekrar dener misin?"), kind: "error" });
    },
    onSuccess: (entry, _input, ctx) => {
      if (ctx?.optimisticId) patchDay(qc, dateKey, (day) => replaceEntryInDay(day, ctx.optimisticId, entry));
    },
    onSettled: afterWrite,
  });
}

/** Add several entries in one go (the scan sheet). Rolls back everything if any of them fails. */
export function useAddEntries(dateKey: string) {
  const qc = useQueryClient();
  const afterWrite = useAfterWrite(dateKey);

  return useMutation({
    mutationFn: async (inputs: AddEntryInput[]) => {
      const api = getApi();
      const entries: MealEntryDTO[] = [];
      for (const input of inputs) {
        const res = await api.nutrition.addEntry({ ...entryPayload(input, dateKey), source: input.source ?? "scan" });
        entries.push(res.entry);
      }
      return entries;
    },
    onMutate: async (inputs) => {
      await qc.cancelQueries({ queryKey: nutritionDayKey(dateKey) });
      const prev = patchDay(qc, dateKey, (day) => inputs.reduce((acc, input) => addEntryToDay(acc, makeOptimisticEntry(draftOf(input, dateKey))), day));
      return { prev };
    },
    onError: (_e, _inputs, ctx) => {
      if (ctx?.prev) qc.setQueryData(nutritionDayKey(dateKey), ctx.prev);
    },
    onSettled: afterWrite,
  });
}

export function useUpdateEntry(dateKey: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const afterWrite = useAfterWrite(dateKey);

  return useMutation({
    mutationFn: async (input: { id: string; grams?: number; meal?: Meal }) => (await getApi().nutrition.updateEntry(input.id, { grams: input.grams, meal: input.meal })).entry,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: nutritionDayKey(dateKey) });
      const prev = patchDay(qc, dateKey, (day) => updateEntryInDay(day, input.id, { grams: input.grams, meal: input.meal }));
      return { prev };
    },
    onError: (e, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(nutritionDayKey(dateKey), ctx.prev);
      toast.show({ message: describeError(e, "Güncelleyemedim, tekrar dener misin?"), kind: "error" });
    },
    onSettled: afterWrite,
  });
}

export function useDeleteEntry(dateKey: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const afterWrite = useAfterWrite(dateKey);

  return useMutation({
    mutationFn: (id: string) => getApi().nutrition.deleteEntry(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: nutritionDayKey(dateKey) });
      const prev = patchDay(qc, dateKey, (day) => removeEntryFromDay(day, id));
      return { prev };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(nutritionDayKey(dateKey), ctx.prev);
      toast.show({ message: describeError(e, "Silemedim, tekrar dener misin?"), kind: "error" });
    },
    onSettled: afterWrite,
  });
}

export function useSetTarget() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidateHome = useInvalidateHome();

  return useMutation({
    mutationFn: (input: { mode: "auto" | "manual"; calories?: number; protein?: number; carbs?: number; fat?: number }) => getApi().nutrition.setTarget(input),
    onSuccess: (target) => {
      qc.setQueryData(NUTRITION_TARGET_KEY, target);
      void qc.invalidateQueries({ queryKey: ["nutrition-day"] });
      void qc.invalidateQueries({ queryKey: ["nutrition-week"] });
      void qc.invalidateQueries({ queryKey: REPORT_KEYS.all });
      void invalidateHome();
    },
    onError: (e) => toast.show({ message: describeError(e, "Hedefi kaydedemedim."), kind: "error" }),
  });
}

/** Custom food creation (the "Elle gir" form can save it to the user's own catalog). */
export function useCreateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; per100g: Per100g; defaultServingG?: number }) =>
      getApi().nutrition.createFood({ name: input.name, per100g: input.per100g, defaultServingG: input.defaultServingG ?? 100, aliases: [], category: "diğer", servings: [], verified: false }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["foods"] }),
  });
}

/** Barcode lookup — returns null when neither the local catalog nor OFF knows the code. */
export function useBarcodeLookup() {
  return useMutation({
    mutationFn: async (code: string) => {
      const food = (await getApi().nutrition.barcode(code)).food;
      if (food) return food;
      // Demo mode: the base fake answers null for every code — resolve from the seeded fixtures.
      const fake = nutritionFake();
      return fake ? fake.mod.findByBarcode(fake.state, code) : null;
    },
  });
}

/** The dates the day pager renders: `back` days behind today through `ahead` days after. */
export function useDayRange(selected: string, back = 30, ahead = 0): string[] {
  return useMemo(() => {
    const today = todayKey();
    const keys: string[] = [];
    for (let i = -back; i <= ahead; i++) keys.push(shiftKey(today, i));
    if (!keys.includes(selected)) keys.push(selected);
    return keys.sort();
  }, [ahead, back, selected]);
}

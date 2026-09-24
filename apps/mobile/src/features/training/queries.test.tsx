import { act, waitFor } from "@testing-library/react-native";
import type { ProgramView } from "@fitfloow/core";
import { makeQueryClient, renderHookUI } from "../../../__tests__/helpers";
import { setApi } from "../../lib/api";
import { createFakeApi } from "../../lib/fake";
import { trainingState, withCompletedToday, withRestDay, withSkippedToday } from "../../lib/fake/training";
import {
  trainingKeys,
  useCompleteWorkout,
  useDeleteWorkout,
  useExerciseCatalog,
  useJumpTo,
  useLastPerformances,
  useLogDay,
  useProgram,
  useRecovery,
  useSkipDay,
  useTrainingStats,
  useUndoLast,
  useUpdateProgram,
  useWorkouts,
} from "./queries";

jest.mock("expo-router", () => jest.requireActual("../../../__tests__/mocks/expo-router"));

function api() {
  const client = createFakeApi({ latencyMs: 0, signedIn: true });
  setApi(client);
  return client;
}

describe("training query keys", () => {
  test("follow the agreed convention", () => {
    expect(trainingKeys.program).toEqual(["program"]);
    expect(trainingKeys.recovery).toEqual(["recovery"]);
    expect(trainingKeys.workouts({ limit: 30 })).toEqual(["workouts", { limit: 30 }]);
    expect(trainingKeys.stats(8)).toEqual(["training-stats", 8]);
    expect(trainingKeys.lastPerformance("Bench Press")).toEqual(["last-performance", "Bench Press"]);
  });
});

describe("training queries", () => {
  beforeEach(() => {
    api();
  });

  test("useProgram loads the composite program view", async () => {
    const { result } = await renderHookUI(() => useProgram(), { queryClient: makeQueryClient() });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const view = result.current.data as ProgramView;
    expect(view.program.days.length).toBeGreaterThan(0);
    expect(view.schedule).toHaveLength(7);
    expect(view.current.day.title).toBe("Üst Vücut A");
    expect(view.weeklyVolume.length).toBeGreaterThan(0);
  });

  test("useRecovery, useWorkouts, useTrainingStats and useExerciseCatalog load their slices", async () => {
    const qc = makeQueryClient();
    const rec = await renderHookUI(() => useRecovery(), { queryClient: qc });
    await waitFor(() => expect(rec.result.current.data?.muscles.length).toBeGreaterThan(0));
    expect(rec.result.current.data?.overall.status).toBeTruthy();

    const logs = await renderHookUI(() => useWorkouts({ limit: 20 }), { queryClient: qc });
    await waitFor(() => expect(logs.result.current.data?.length).toBeGreaterThan(0));

    const stats = await renderHookUI(() => useTrainingStats(4), { queryClient: qc });
    await waitFor(() => expect(stats.result.current.data?.weeks).toHaveLength(4));

    const cat = await renderHookUI(() => useExerciseCatalog("bench"), { queryClient: qc });
    await waitFor(() => expect(cat.result.current.data?.[0]?.name).toBe("Bench Press"));
  });

  test("useLastPerformances reads what was logged last time, per exercise name", async () => {
    const { result } = await renderHookUI(() => useLastPerformances(["Bench Press", "Bir Daha Yapılmamış Hareket"]), { queryClient: makeQueryClient() });
    await waitFor(() => expect(result.current("Bench Press")).toBeTruthy());

    const bench = result.current("Bench Press")!;
    expect(bench.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(bench.sets.length).toBeGreaterThan(0);
    expect(typeof bench.sets[0].reps).toBe("number");

    // Never done before, and never asked for: both answer "nothing", never throw.
    await waitFor(() => expect(result.current("Bir Daha Yapılmamış Hareket")).toEqual({ dateKey: null, sets: [] }));
    expect(result.current("Sorulmayan Hareket")).toBeNull();
  });
});

describe("training mutations", () => {
  /** Mount `useProgram` on a fresh cache over the fake API (optionally in a given state). */
  async function setup(state?: ReturnType<typeof trainingState>) {
    const client = createFakeApi({ latencyMs: 0, signedIn: true, state });
    setApi(client);
    const qc = makeQueryClient();
    const program = await renderHookUI(() => useProgram(), { queryClient: qc });
    await waitFor(() => expect(program.result.current.data).toBeTruthy());
    const read = () => qc.getQueryData<ProgramView>(trainingKeys.program)!;
    return { client, qc, read };
  }
  /** What the strip says about today and the next days — enough to compare cache and server. */
  const strip = (v: ProgramView) => v.schedule.map((e) => `${e.status}:${e.day?.id ?? "-"}`);

  test("skip on a training day is a break: today is marked, the pointer does not move (B2)", async () => {
    const { client, qc, read } = await setup();
    const before = read();
    expect(before.current.day.kind).toBe("strength");

    const skip = await renderHookUI(() => useSkipDay(), { queryClient: qc });
    await act(async () => {
      skip.result.current.mutate("Yorgunum");
    });

    const optimistic = read();
    expect(optimistic.todayLog?.isBreak).toBe(true);
    expect(optimistic.todayLog?.isOffDay).toBe(true);
    expect(optimistic.todayLog?.dayId).toBeNull();
    expect(optimistic.program.currentDayId).toBe(before.program.currentDayId);
    expect(optimistic.program.currentIndex).toBe(before.program.currentIndex);
    expect(optimistic.current.day.id).toBe(before.current.day.id); // still next
    expect(optimistic.schedule.find((s) => s.isToday)?.status).toBe("skipped");

    await waitFor(() => expect(skip.result.current.isSuccess).toBe(true));
    const server = await client.training.program();
    expect(server.todayLog?.isBreak).toBe(true);
    expect(server.program.currentDayId).toBe(before.program.currentDayId);
    expect(strip(server)).toEqual(strip(optimistic));
  });

  test("skip on a rest day does the rest day and the pointer advances (B1)", async () => {
    const { client, qc, read } = await setup(withRestDay(trainingState()));
    const before = read();
    expect(before.current.day.kind).toBe("rest");
    const next = before.program.days[(before.program.currentIndex + 1) % before.program.days.length];

    const skip = await renderHookUI(() => useSkipDay(), { queryClient: qc });
    await act(async () => {
      skip.result.current.mutate(undefined);
    });

    const optimistic = read();
    expect(optimistic.todayLog?.isBreak).toBe(false);
    expect(optimistic.todayLog?.dayId).toBe(before.current.day.id);
    expect(optimistic.todayLog?.kind).toBe("rest");
    expect(optimistic.program.currentDayId).toBe(next.id);
    expect(optimistic.current.day.id).toBe(next.id);
    expect(optimistic.schedule.find((s) => s.isToday)?.status).toBe("done");

    await waitFor(() => expect(skip.result.current.isSuccess).toBe(true));
    const server = await client.training.program();
    expect(server.program.currentDayId).toBe(next.id);
    expect(server.todayLog?.isBreak).toBe(false);
    expect(strip(server)).toEqual(strip(optimistic));
  });

  test("a failing skip rolls the cache back", async () => {
    const { client, qc, read } = await setup();
    const before = read();
    jest.spyOn(client.training, "skip").mockRejectedValueOnce(new Error("boom"));

    const skip = await renderHookUI(() => useSkipDay(), { queryClient: qc });
    await act(async () => {
      skip.result.current.mutate(undefined);
    });
    await waitFor(() => expect(skip.result.current.isError).toBe(true));
    expect(read().program.currentIndex).toBe(before.program.currentIndex);
    expect(read().todayLog).toBeNull();
  });

  test("jump moves the pointer to the chosen day, by id", async () => {
    const { client, qc, read } = await setup();
    const run = read().program.days.find((d) => d.kind === "run")!;

    const jump = await renderHookUI(() => useJumpTo(), { queryClient: qc });
    await act(async () => {
      jump.result.current.mutate(run.id);
    });
    const view = read();
    expect(view.program.currentDayId).toBe(run.id);
    expect(view.program.currentIndex).toBe(view.program.days.indexOf(run));
    expect(view.current.day.title).toBe("Koşu");
    expect(view.schedule.find((s) => s.isToday)?.day?.id).toBe(run.id);
    await waitFor(() => expect(jump.result.current.isSuccess).toBe(true));
    const server = await client.training.program();
    expect(server.program.currentDayId).toBe(run.id);
    expect(strip(server)).toEqual(strip(view));
  });

  test("complete writes today's log optimistically and invalidates home + recovery", async () => {
    const { qc, read } = await setup();
    const invalidate = jest.spyOn(qc, "invalidateQueries");

    const complete = await renderHookUI(() => useCompleteWorkout(), { queryClient: qc });
    await act(async () => {
      complete.result.current.mutate({
        strength: [{ name: "Bench Press", muscles: [{ key: "chest", load: 1 }], sets: [{ reps: 8, rir: 2, weightKg: 60 }] }],
        run: null,
        swim: null,
        durationMin: 48,
        notes: null,
        rpe: 8,
      });
    });
    const optimistic = read();
    expect(optimistic.todayLog?.isOffDay).toBe(false);
    expect(optimistic.todayLog?.isBreak).toBe(false);
    expect(optimistic.todayLog?.dayId).toBe("d1");
    expect(optimistic.todayLog?.durationMin).toBe(48);
    expect(optimistic.schedule.find((s) => s.isToday)?.status).toBe("done");

    await waitFor(() => expect(complete.result.current.isSuccess).toBe(true));
    const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toEqual(expect.arrayContaining([JSON.stringify(["home"]), JSON.stringify(["recovery"]), JSON.stringify(["program"])]));
  });

  test("completing twice on the same day never advances the pointer twice (B3)", async () => {
    const { client, qc, read } = await setup();
    const input = { strength: [], run: null, swim: null, durationMin: 40, notes: null, rpe: 7 };
    const complete = await renderHookUI(() => useCompleteWorkout(), { queryClient: qc });

    await act(async () => {
      complete.result.current.mutate(input);
    });
    expect(read().program.currentDayId).toBe("d2");
    await waitFor(() => expect(complete.result.current.isSuccess).toBe(true));
    await waitFor(async () => expect((await client.training.program()).program.currentDayId).toBe("d2"));
    await waitFor(() => expect(read().todayLog?.id).not.toMatch(/^optimistic/));

    await act(async () => {
      complete.result.current.mutate({ ...input, durationMin: 55 });
    });
    const again = read();
    expect(again.program.currentDayId).toBe("d2");
    expect(again.todayLog?.dayId).toBe("d1");
    expect(again.todayLog?.durationMin).toBe(55);
    await waitFor(() => expect(complete.result.current.isSuccess).toBe(true));
    const server = await client.training.program();
    expect(server.program.currentDayId).toBe("d2");
    expect(server.todayLog?.durationMin).toBe(55);
    expect((await client.training.workouts({ limit: 50 })).logs.filter((l) => l.dateKey === server.todayLog?.dateKey)).toHaveLength(1);
  });

  test("logDay: another day than planned — the cycle continues after it, or with resumePlanned stays", async () => {
    const { client, qc, read } = await setup();
    const log = await renderHookUI(() => useLogDay(), { queryClient: qc });

    await act(async () => {
      log.result.current.mutate({ dayId: "d3" });
    });
    expect(read().todayLog?.dayId).toBe("d3");
    expect(read().program.currentDayId).toBe("d4");
    await waitFor(() => expect(log.result.current.isSuccess).toBe(true));
    expect((await client.training.program()).program.currentDayId).toBe("d4");

    // Same state, other answer: resumePlanned keeps the planned day next.
    const second = await setup();
    const log2 = await renderHookUI(() => useLogDay(), { queryClient: second.qc });
    await act(async () => {
      log2.result.current.mutate({ dayId: "d3", resumePlanned: true });
    });
    expect(second.read().program.currentDayId).toBe("d1");
    await waitFor(() => expect(log2.result.current.isSuccess).toBe(true));
    const server = await second.client.training.program();
    expect(server.program.currentDayId).toBe("d1");
    expect(strip(server)).toEqual(strip(second.read()));
  });

  test("updateProgram keeps the day ids, so a reorder keeps the pointer on the same day (B5)", async () => {
    const { client, qc, read } = await setup();
    const days = read().program.days;
    const pointer = read().program.currentDayId;
    const swapped = [days[1], days[0], ...days.slice(2)].map((d, i) => ({ ...d, order: i + 1 }));
    const renamed = swapped.map((d) => (d.id === "d3" ? { ...d, title: "Yeni Gün" } : d));

    const update = await renderHookUI(() => useUpdateProgram(), { queryClient: qc });
    await act(async () => {
      update.result.current.mutate({ days: renamed });
    });
    const optimistic = read();
    expect(optimistic.program.days.map((d) => d.id)).toEqual(renamed.map((d) => d.id));
    expect(optimistic.program.days.find((d) => d.id === "d3")?.title).toBe("Yeni Gün");
    expect(optimistic.program.currentDayId).toBe(pointer);
    expect(optimistic.program.currentIndex).toBe(1);
    expect(optimistic.current.day.id).toBe(pointer);
    await waitFor(() => expect(update.result.current.isSuccess).toBe(true));

    const server = await client.training.program();
    expect(server.program.days.map((d) => d.id)).toEqual(renamed.map((d) => d.id));
    expect(server.program.currentDayId).toBe(pointer);
    expect(server.program.currentIndex).toBe(1);
  });

  test("updateProgram: a new day without an id gets the same fresh id the server gives it", async () => {
    const { client, qc, read } = await setup();
    const days = read().program.days;
    const { id: _none, ...fresh } = { ...days[0], title: "Ekstra" };
    const update = await renderHookUI(() => useUpdateProgram(), { queryClient: qc });
    await act(async () => {
      update.result.current.mutate({ days: [...days, { ...fresh, order: days.length + 1 }] });
    });
    const optimisticIds = read().program.days.map((d) => d.id);
    expect(optimisticIds).toHaveLength(days.length + 1);
    await waitFor(() => expect(update.result.current.isSuccess).toBe(true));
    expect((await client.training.program()).program.days.map((d) => d.id)).toEqual(optimisticIds);
  });

  test("undo takes today's break back and the server agrees", async () => {
    const { client, qc, read } = await setup(withSkippedToday(trainingState()));
    const before = read();
    expect(before.todayLog?.isBreak).toBe(true);

    const undo = await renderHookUI(() => useUndoLast(), { queryClient: qc });
    await act(async () => {
      undo.result.current.mutate();
    });
    expect(read().todayLog).toBeNull();
    expect(read().schedule.find((s) => s.isToday)?.status).toBe("today");
    expect(read().program.currentDayId).toBe(before.program.currentDayId);
    await waitFor(() => expect(undo.result.current.isSuccess).toBe(true));
    const server = await client.training.program();
    expect(server.todayLog).toBeNull();
    expect(server.program.currentDayId).toBe(before.program.currentDayId);
  });

  test("undo of a completed day puts the pointer back (server-side), then the cache follows", async () => {
    const { client, qc, read } = await setup(withCompletedToday(trainingState()));
    expect(read().program.currentDayId).toBe("d2");
    const undo = await renderHookUI(() => useUndoLast(), { queryClient: qc });
    await act(async () => {
      undo.result.current.mutate();
    });
    await waitFor(() => expect(undo.result.current.isSuccess).toBe(true));
    expect((await client.training.program()).program.currentDayId).toBe("d1");
    await waitFor(() => expect(read().program.currentDayId).toBe("d1"));
    expect(read().todayLog).toBeNull();
  });

  test("delete removes the log from every cached workout list", async () => {
    const client = api();
    const qc = makeQueryClient();
    const list = await renderHookUI(() => useWorkouts({ limit: 50 }), { queryClient: qc });
    await waitFor(() => expect(list.result.current.data?.length).toBeGreaterThan(0));
    const victim = list.result.current.data![0];

    const del = await renderHookUI(() => useDeleteWorkout(), { queryClient: qc });
    await act(async () => {
      del.result.current.mutate(victim.id);
    });
    expect(qc.getQueryData<typeof victim[]>(trainingKeys.workouts({ limit: 50 }))!.some((l) => l.id === victim.id)).toBe(false);
    await waitFor(() => expect(del.result.current.isSuccess).toBe(true));
    expect((await client.training.workouts({ limit: 50 })).logs.some((l) => l.id === victim.id)).toBe(false);
  });
});

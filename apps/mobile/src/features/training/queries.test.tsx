import { act, waitFor } from "@testing-library/react-native";
import type { ProgramView } from "@fitfloow/core";
import { makeQueryClient, renderHookUI } from "../../../__tests__/helpers";
import { setApi } from "../../lib/api";
import { createFakeApi } from "../../lib/fake";
import {
  trainingKeys,
  useCompleteWorkout,
  useDeleteWorkout,
  useExerciseCatalog,
  useJumpTo,
  useProgram,
  useRecovery,
  useSkipDay,
  useTrainingStats,
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
});

describe("training mutations", () => {
  test("skip advances the pointer optimistically before the server answers", async () => {
    const client = api();
    const qc = makeQueryClient();
    const program = await renderHookUI(() => useProgram(), { queryClient: qc });
    await waitFor(() => expect(program.result.current.data).toBeTruthy());
    const startIndex = program.result.current.data!.program.currentIndex;

    const skip = await renderHookUI(() => useSkipDay(), { queryClient: qc });
    await act(async () => {
      skip.result.current.mutate("Yorgunum");
    });

    const optimistic = qc.getQueryData<ProgramView>(trainingKeys.program)!;
    expect(optimistic.todayLog?.isOffDay).toBe(true);
    expect(optimistic.program.currentIndex).toBe((startIndex + 1) % optimistic.program.days.length);
    expect(optimistic.schedule.find((s) => s.isToday)?.status).toBe("skipped");
    await waitFor(() => expect(skip.result.current.isSuccess).toBe(true));
    expect((await client.training.program()).todayLog?.isOffDay).toBe(true);
  });

  test("a failing skip rolls the cache back", async () => {
    const client = api();
    const qc = makeQueryClient();
    const program = await renderHookUI(() => useProgram(), { queryClient: qc });
    await waitFor(() => expect(program.result.current.data).toBeTruthy());
    const before = qc.getQueryData<ProgramView>(trainingKeys.program)!;
    jest.spyOn(client.training, "skip").mockRejectedValueOnce(new Error("boom"));

    const skip = await renderHookUI(() => useSkipDay(), { queryClient: qc });
    await act(async () => {
      skip.result.current.mutate(undefined);
    });
    await waitFor(() => expect(skip.result.current.isError).toBe(true));
    expect(qc.getQueryData<ProgramView>(trainingKeys.program)!.program.currentIndex).toBe(before.program.currentIndex);
    expect(qc.getQueryData<ProgramView>(trainingKeys.program)!.todayLog).toBeNull();
  });

  test("jump moves the pointer to the chosen cycle day", async () => {
    api();
    const qc = makeQueryClient();
    const program = await renderHookUI(() => useProgram(), { queryClient: qc });
    await waitFor(() => expect(program.result.current.data).toBeTruthy());

    const jump = await renderHookUI(() => useJumpTo(), { queryClient: qc });
    await act(async () => {
      jump.result.current.mutate(2);
    });
    const view = qc.getQueryData<ProgramView>(trainingKeys.program)!;
    expect(view.program.currentIndex).toBe(2);
    expect(view.current.day.title).toBe("Koşu");
    await waitFor(() => expect(jump.result.current.isSuccess).toBe(true));
  });

  test("complete writes today's log optimistically and invalidates home + recovery", async () => {
    api();
    const qc = makeQueryClient();
    const program = await renderHookUI(() => useProgram(), { queryClient: qc });
    await waitFor(() => expect(program.result.current.data).toBeTruthy());
    const invalidate = jest.spyOn(qc, "invalidateQueries");

    const complete = await renderHookUI(() => useCompleteWorkout(), { queryClient: qc });
    await act(async () => {
      complete.result.current.mutate({
        strength: [{ name: "Bench Press", muscles: [{ key: "chest", load: 1 }], sets: [{ reps: 8, rir: 2 }] }],
        run: null,
        swim: null,
        durationMin: 48,
        notes: null,
        rpe: 8,
      });
    });
    const optimistic = qc.getQueryData<ProgramView>(trainingKeys.program)!;
    expect(optimistic.todayLog?.isOffDay).toBe(false);
    expect(optimistic.todayLog?.durationMin).toBe(48);
    expect(optimistic.schedule.find((s) => s.isToday)?.status).toBe("done");

    await waitFor(() => expect(complete.result.current.isSuccess).toBe(true));
    const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toEqual(expect.arrayContaining([JSON.stringify(["home"]), JSON.stringify(["recovery"]), JSON.stringify(["program"])]));
  });

  test("updateProgram replaces the days in the cache before the round trip", async () => {
    api();
    const qc = makeQueryClient();
    const program = await renderHookUI(() => useProgram(), { queryClient: qc });
    await waitFor(() => expect(program.result.current.data).toBeTruthy());
    const days = program.result.current.data!.program.days;
    const renamed = days.map((d, i) => (i === 0 ? { ...d, title: "Yeni Gün" } : d));

    const update = await renderHookUI(() => useUpdateProgram(), { queryClient: qc });
    await act(async () => {
      update.result.current.mutate({ days: renamed });
    });
    expect(qc.getQueryData<ProgramView>(trainingKeys.program)!.program.days[0].title).toBe("Yeni Gün");
    await waitFor(() => expect(update.result.current.isSuccess).toBe(true));
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

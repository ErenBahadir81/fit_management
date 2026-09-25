import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { makeQueryClient, renderUI } from "../../../../__tests__/helpers";
import { mockRouter } from "../../../../__tests__/mocks/expo-router";
import { useSession } from "../../auth/session";
import { setApi } from "../../../lib/api";
import { createFakeApi } from "../../../lib/fake";
import { trainingState, withoutProgram } from "../../../lib/fake/training";
import { storage } from "../../../lib/storage";
import type { ProgramView } from "@fitfloow/core";
import { trainingKeys } from "../queries";
import { ProgramEditorScreen } from "./ProgramEditorScreen";

jest.mock("expo-router", () => jest.requireActual("../../../../__tests__/mocks/expo-router"));

const mockSay = jest.fn(() => "id");
jest.mock("../../../mascot/voice", () => {
  const actual = jest.requireActual("../../../mascot/voice");
  return { ...actual, useFloo: () => ({ ...actual.useFloo(), say: mockSay }) };
});

async function mount(state?: ReturnType<typeof trainingState>) {
  const api = createFakeApi({ latencyMs: 0, signedIn: true, state });
  setApi(api);
  useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  const qc = makeQueryClient();
  await renderUI(<ProgramEditorScreen />, { queryClient: qc });
  await waitFor(() => expect(screen.getByTestId("editor-days")).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId("editor-bars")).toBeTruthy());
  return { api, qc };
}

const value = (key: string) => String(screen.getByTestId(`volume-${key}-value`).props.children?.join?.("") ?? "");
const setsOf = (key: string) => {
  const text = screen.getByTestId(`volume-${key}-value`);
  const raw = (Array.isArray(text.props.children) ? text.props.children.join("") : String(text.props.children)) as string;
  return Number(raw.split(" set")[0].replace(",", "."));
};

describe("ProgramEditorScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.clearAll();
  });

  test("opens on the program: name, mode, the days and the live weekly volume; nothing to save yet", async () => {
    await mount();
    expect(screen.getByTestId("editor-name").props.value ?? screen.getByDisplayValue("Üst / Alt + Koşu")).toBeTruthy();
    expect(screen.getAllByTestId(/^editor-day-\d+$/)).toHaveLength(6);
    expect(within(screen.getByTestId("editor-day-0")).getByText("1. gün")).toBeTruthy();
    expect(screen.getByTestId("volume-chest")).toBeTruthy();
    expect(value("chest")).toMatch(/set · /);
    expect(screen.getByTestId("editor-save")).toBeDisabled();
  });

  test("days are reordered and the PUT sends every id back, so the pointer follows its day (B5)", async () => {
    const { api, qc } = await mount();
    const update = jest.spyOn(api.training, "updateProgram");
    await fireEvent(screen.getByTestId("editor-day-1"), "accessibilityAction", { nativeEvent: { actionName: "moveUp" } });
    expect(screen.getByTestId("editor-save")).not.toBeDisabled();
    await fireEvent.press(screen.getByTestId("editor-save"));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0].days.map((d) => d.id)).toEqual(["d2", "d1", "d3", "d4", "d5", "d6"]);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    const server = await api.training.program();
    expect(server.program.days.map((d) => d.id).slice(0, 2)).toEqual(["d2", "d1"]);
    expect(server.program.currentDayId).toBe("d1");
    expect(server.program.currentIndex).toBe(1);
    expect(qc.getQueryData<ProgramView>(trainingKeys.program)?.program.days[0].id).toBe("d2");
  });

  test("the day editor edits targets and the volume bars follow each set, live", async () => {
    await mount();
    const before = setsOf("chest");
    await fireEvent.press(screen.getByTestId("editor-day-0"));
    expect(screen.getByTestId("editor-exercise-0")).toBeTruthy();
    expect(screen.getByTestId("editor-day-volume")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("editor-sets-0-inc")); // Bench Press 4 → 5 sets
    // One more bench set in a 6-day cycle is 7/6 more chest sets a week.
    // (Weekly figures are rounded to one decimal, so allow that rounding.)
    await waitFor(() => expect(Math.abs(setsOf("chest") - (before + 7 / 6))).toBeLessThanOrEqual(0.1));
  });

  test("a catalog exercise is added to the day; exercises can be reordered and removed", async () => {
    await mount();
    await fireEvent.press(screen.getByTestId("editor-day-0"));
    const names = () => screen.getAllByTestId(/^editor-exercise-\d+$/).map((e) => within(e).getAllByText(/./)[0].props.children);
    const start = names();
    await fireEvent.press(screen.getByTestId("editor-add-exercise"));
    await waitFor(() => expect(screen.getByTestId("picker-item-ex_squat")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("picker-item-ex_squat"));
    await waitFor(() => expect(names()).toEqual([...start, "Squat"]));

    await fireEvent.press(screen.getByTestId(`editor-ex-up-${start.length}`));
    expect(names()).toEqual([...start.slice(0, -1), "Squat", start[start.length - 1]]);
    expect(screen.getByTestId("editor-ex-up-0")).toBeDisabled();
    await fireEvent.press(screen.getByTestId(`editor-remove-${start.length - 1}`));
    expect(names()).toEqual(start);
  });

  test("an exercise the catalog does not have is added with the muscles picked by hand", async () => {
    const { api } = await mount();
    const update = jest.spyOn(api.training, "updateProgram");
    await fireEvent.press(screen.getByTestId("editor-day-0"));
    await fireEvent.press(screen.getByTestId("editor-add-exercise"));
    await fireEvent.changeText(screen.getByTestId("picker-search"), "Landmine Press");
    await waitFor(() => expect(screen.getByTestId("picker-adhoc")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("picker-adhoc"));
    expect(screen.getByTestId("adhoc-add")).toBeDisabled(); // no muscles yet
    await fireEvent.press(screen.getByTestId("adhoc-muscle-chest")); // ana
    await fireEvent.press(screen.getByTestId("adhoc-muscle-triceps"));
    await fireEvent.press(screen.getByTestId("adhoc-muscle-triceps")); // yardımcı
    expect(screen.getByText("Triseps · yardımcı")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("adhoc-add"));
    await waitFor(() => expect(screen.getByText("Landmine Press")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("editor-save"));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const sent = update.mock.calls[0][0].days[0].exercises.at(-1);
    expect(sent).toMatchObject({ name: "Landmine Press", muscles: [{ key: "chest", load: 1 }, { key: "triceps", load: 0.5 }] });
    await waitFor(async () => expect((await api.training.program()).program.days[0].exercises.at(-1)?.name).toBe("Landmine Press"));
  });

  test("a new day goes out without an id; a day can be renamed and deleted", async () => {
    const { api } = await mount();
    const update = jest.spyOn(api.training, "updateProgram");
    await fireEvent.press(screen.getByTestId("editor-add-day"));
    expect(screen.getAllByTestId(/^editor-day-\d+$/)).toHaveLength(7);
    await fireEvent.press(screen.getByTestId("editor-day-6"));
    await fireEvent.changeText(screen.getByTestId("editor-title"), "Kol günü");
    await fireEvent.press(screen.getByTestId("editor-back"));
    expect(within(screen.getByTestId("editor-day-6")).getByText("Kol günü")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("editor-remove-day-5")); // the old last rest day
    expect(screen.getAllByTestId(/^editor-day-\d+$/)).toHaveLength(6);

    await fireEvent.press(screen.getByTestId("editor-save"));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const days = update.mock.calls[0][0].days;
    expect(days.map((d) => d.id)).toEqual(["d1", "d2", "d3", "d4", "d5", undefined]);
    expect(days[5]).toMatchObject({ title: "Kol günü", order: 6, kind: "strength" });
    await waitFor(async () => {
      const server = (await api.training.program()).program.days;
      expect(server.at(-1)?.title).toBe("Kol günü");
      expect(server.at(-1)?.id).toMatch(/^d\d+$/);
    });
  });

  test("a day without a name blocks saving and says why", async () => {
    await mount();
    await fireEvent.press(screen.getByTestId("editor-day-1"));
    await fireEvent.changeText(screen.getByTestId("editor-title"), "  ");
    expect(screen.getByTestId("editor-issues")).toHaveTextContent(/2\. günün bir adı olmalı\./);
    expect(screen.getByTestId("editor-save")).toBeDisabled();
  });

  test("switching to weekly makes the days Monday → Sunday and saves the mode", async () => {
    const { api } = await mount();
    const update = jest.spyOn(api.training, "updateProgram");
    await fireEvent.press(screen.getByTestId("editor-mode-weekly"));
    expect(screen.getAllByTestId(/^editor-day-\d+$/)).toHaveLength(7);
    expect(within(screen.getByTestId("editor-day-0")).getByText("Pazartesi")).toBeTruthy();
    expect(within(screen.getByTestId("editor-day-6")).getByText("Pazar")).toBeTruthy();
    expect(screen.queryByTestId("editor-add-day")).toBeNull();
    expect(screen.queryByTestId("editor-remove-day-0")).toBeNull();
    await fireEvent.press(screen.getByTestId("editor-save"));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0].mode).toBe("weekly");
    await waitFor(async () => expect((await api.training.program()).program.mode).toBe("weekly"));
  });

  test("a day's kind can change: a run day gets a target, a rest day drops its exercises from the plan", async () => {
    const { api } = await mount();
    const update = jest.spyOn(api.training, "updateProgram");
    await fireEvent.press(screen.getByTestId("editor-day-0"));
    await fireEvent.press(screen.getByTestId("editor-kind-run"));
    expect(screen.getByTestId("editor-target-km")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("editor-target-km-inc"));
    await fireEvent.press(screen.getByTestId("editor-back"));
    await fireEvent.press(screen.getByTestId("editor-day-1"));
    await fireEvent.press(screen.getByTestId("editor-kind-rest"));
    await fireEvent.press(screen.getByTestId("editor-save"));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const [run, rest] = update.mock.calls[0][0].days;
    expect(run).toMatchObject({ kind: "run", run: { targetKm: 5.5, targetMin: 30 }, exercises: [] });
    expect(rest).toMatchObject({ kind: "rest", exercises: [] });
  });

  test("Floo speaks up when an edit leaves a muscle under-trained, with core's advice line, once", async () => {
    await mount();
    await fireEvent.press(screen.getByTestId("editor-day-0"));
    // Bench Press off day 1: chest drops to 3,5 and front shoulders to 4,6 sets a week — both below
    // maintenance. Floo says only the worst new one (core orders advice by severity, then sets).
    await fireEvent.press(screen.getByTestId("editor-remove-0"));
    await waitFor(() => expect(mockSay).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockSay).toHaveBeenCalledTimes(1);
    const [msg] = mockSay.mock.calls[0] as unknown as [{ text: string; mood: string; trigger: string; tone: string; dedupeKey: string }];
    expect(msg.text).toBe("Omuz haftada 4,6 set, korumak için bile az. En az 5, gelişim için 10 set hedefle.");
    expect(msg).toMatchObject({ mood: "think", trigger: "volumeWarning", tone: "warning", dedupeKey: "editor-volume:shoulders" });
    await fireEvent.press(screen.getByTestId("editor-back"));
    expect(setsOf("chest")).toBe(3.5);
  });

  test("Floo warns about too much volume, and opening the editor alone says nothing", async () => {
    await mount();
    await new Promise((r) => setTimeout(r, 900));
    expect(mockSay).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("editor-day-0"));
    for (let i = 0; i < 16; i++) await fireEvent.press(screen.getByTestId("editor-sets-0-inc")); // bench 4 → 20 sets
    await waitFor(() => expect(mockSay).toHaveBeenCalled(), { timeout: 3000 });
    const texts = (mockSay.mock.calls as unknown as [{ text: string; mood: string }][]).map(([m]) => m);
    expect(texts.some((m) => /^Göğüs haftada .* set, (sakatlık|üst sınır)/i.test(m.text) && m.mood === "worried")).toBe(true);
  });

  test("an under-trained muscle gets a catalog suggestion that lands on the day you pick", async () => {
    const state = trainingState();
    // Take the curls out: biceps falls below the growth band and the curl becomes the suggestion.
    state.program = { ...state.program, days: state.program.days.map((d) => ({ ...d, exercises: d.exercises.filter((e) => e.name !== "Dumbbell Curl") })) };
    await mount(state);
    await waitFor(() => expect(screen.getByTestId("volume-suggest-biceps")).toBeTruthy());
    expect(screen.getByText("Öneri: Dumbbell Curl")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("volume-suggest-biceps"));
    await waitFor(() => expect(screen.getByTestId("suggest-day-sheet")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("suggest-day-4")); // Üst Vücut B
    await fireEvent.press(screen.getByTestId("editor-day-4"));
    await waitFor(() => expect(within(screen.getByTestId("editor-day")).getByText("Dumbbell Curl")).toBeTruthy());
  });

  test("with no days yet, the editor starts a program from scratch", async () => {
    const { api } = await mount(withoutProgram(trainingState()));
    expect(screen.getAllByTestId(/^editor-day-\d+$/)).toHaveLength(1);
    expect(screen.getByText("Programı oluştur")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("editor-day-0"));
    await fireEvent.press(screen.getByTestId("editor-add-exercise"));
    await waitFor(() => expect(screen.getByTestId("picker-item-ex_bench")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("picker-item-ex_bench"));
    await fireEvent.press(screen.getByTestId("editor-back"));
    await fireEvent.press(screen.getByTestId("editor-add-rest"));
    await fireEvent.press(screen.getByTestId("editor-save"));
    await waitFor(async () => expect((await api.training.program()).program.days.map((d) => d.kind)).toEqual(["strength", "rest"]));
    const server = await api.training.program();
    expect(server.program.days[0].exercises[0].name).toBe("Bench Press");
    expect(server.current.day.id).toBe(server.program.days[0].id);
  });

  test("'Vazgeç' leaves without saving", async () => {
    const { api } = await mount();
    const update = jest.spyOn(api.training, "updateProgram");
    await fireEvent.press(screen.getByTestId("editor-add-day"));
    await fireEvent.press(screen.getByTestId("editor-cancel"));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

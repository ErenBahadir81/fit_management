import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/exercises",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { installFakeApi, renderWithProviders } from "@/test/utils";
import ExercisesPage from "./exercises/page";
import MascotPage from "./mascot/page";

describe("Exercises page", () => {
  async function renderPage() {
    const harness = installFakeApi();
    const view = renderWithProviders(<ExercisesPage />);
    await screen.findByText("Bench Press");
    return { ...view, ...harness };
  }

  it("shows each exercise's muscle loads as coloured chips", async () => {
    await renderPage();
    const row = screen.getByText("Bench Press").closest("tr")!;
    expect(within(row).getByTitle(/göğüs: 1,00 yük/i)).toBeInTheDocument();
    expect(within(row).getByTitle(/triceps: 0,60 yük/i)).toBeInTheDocument();
  });

  it("filters by muscle through the API", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.selectOptions(screen.getByLabelText(/kasa göre filtrele/i), "calves");
    expect(await screen.findByText("Calf Raise")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Bench Press")).not.toBeInTheDocument());
  });

  it("refuses to save a strength exercise with no muscle load", async () => {
    const user = userEvent.setup();
    const { api } = await renderPage();
    const create = vi.spyOn(api.admin, "createExercise");

    await user.click(screen.getByRole("button", { name: /yeni hareket/i }));
    const dialog = await screen.findByRole("dialog", { name: /yeni hareket/i });
    await user.type(within(dialog).getByLabelText(/hareket adı/i), "Test Hareketi");
    await user.click(within(dialog).getByRole("button", { name: /^ekle$/i }));

    expect(await within(dialog).findByText(/en az bir kasa yük vermeli/i)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("creates an exercise once a muscle load is set", async () => {
    const user = userEvent.setup();
    const { state } = await renderPage();

    await user.click(screen.getByRole("button", { name: /yeni hareket/i }));
    const dialog = await screen.findByRole("dialog", { name: /yeni hareket/i });
    await user.type(within(dialog).getByLabelText(/hareket adı/i), "Cable Crossover");
    await user.click(within(dialog).getByRole("button", { name: "Göğüs", pressed: false }));
    await user.click(within(dialog).getByRole("button", { name: /^ekle$/i }));

    await waitFor(() => {
      const created = state.exercises.find((e) => e.name === "Cable Crossover");
      expect(created?.muscles).toEqual([{ key: "chest", load: 1 }]);
    });
  });
});

describe("Exercise activation editing", () => {
  async function openEditor(name: string) {
    const user = userEvent.setup();
    const harness = installFakeApi();
    renderWithProviders(<ExercisesPage />);
    await screen.findByText(name);
    await user.click(screen.getByRole("button", { name: `${name} düzenle` }));
    const dialog = await screen.findByRole("dialog", { name: /hareketi düzenle/i });
    return { user, dialog, ...harness };
  }
  const saveButton = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: /^kaydet$/i });
  const musclesOf = (state: { exercises: Array<{ name: string; muscles: unknown }> }, name: string) =>
    state.exercises.find((e) => e.name === name)?.muscles;

  it("edits a load on the 0.05 grid and saves it", async () => {
    const { user, dialog, state } = await openEditor("Bench Press");
    const chest = within(dialog).getByRole("textbox", { name: "Göğüs yükü (sayı)" });
    expect(chest).toHaveValue("1");
    await user.clear(chest);
    await user.type(chest, "0,83");
    await user.tab(); // commit snaps to the grid
    expect(chest).toHaveValue("0,85");
    expect(within(dialog).getByRole("slider", { name: "Göğüs yükü" })).toHaveValue("0.85");

    await user.click(saveButton(dialog));
    await waitFor(() =>
      expect(musclesOf(state, "Bench Press")).toEqual([
        { key: "chest", load: 0.85 },
        { key: "frontDelt", load: 0.5 },
        { key: "triceps", load: 0.6 },
      ])
    );
  });

  it("steps with the arrow keys and keeps the previous value when the input is not a load", async () => {
    const { user, dialog } = await openEditor("Bench Press");
    const triceps = within(dialog).getByRole("textbox", { name: "Triceps yükü (sayı)" });
    await user.click(triceps);
    await user.keyboard("{ArrowUp}");
    expect(triceps).toHaveValue("0,65");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(triceps).toHaveValue("0,55");

    await user.clear(triceps);
    await user.type(triceps, "1,5");
    await user.tab();
    expect(triceps).toHaveValue("0,55");
  });

  it("adds and removes muscle pairs across all 17 keys", async () => {
    const { user, dialog, state } = await openEditor("Bench Press");
    // Every active muscle has a row; the inactive v1 catch-all does not.
    expect(within(dialog).getAllByRole("slider")).toHaveLength(state.muscles.filter((m) => m.active).length);

    await user.click(within(dialog).getByRole("button", { name: "Karın", pressed: false }));
    await user.click(within(dialog).getByRole("button", { name: "Triceps yükünü kaldır" }));
    const abs = within(dialog).getByRole("textbox", { name: "Karın yükü (sayı)" });
    await user.clear(abs);
    await user.type(abs, "0,2");
    await user.tab();

    await user.click(saveButton(dialog));
    await waitFor(() =>
      expect(musclesOf(state, "Bench Press")).toEqual([
        { key: "chest", load: 1 },
        { key: "frontDelt", load: 0.5 },
        { key: "abs", load: 0.2 },
      ])
    );
  });

  it("shows the literature value, confidence and sources read-only next to each muscle", async () => {
    const { user, dialog } = await openEditor("Bench Press");
    const chip = await within(dialog).findByRole("button", { name: /literatür değeri.*0,95.*yüksek güven/i });
    expect(chip).toHaveAttribute("aria-expanded", "false");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "true");

    const sources = within(dialog).getByRole("list", { name: "Göğüs kaynakları" });
    const links = within(sources).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("ExRx.net: Barbell Bench Press"), expect.stringContaining("StrengthLog: Bench Press")])
    );
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(within(dialog).getByText(/8 tahmin/)).toBeInTheDocument();
    // Read-only: the literature is text and links, never an input.
    expect(within(sources).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("applies one literature value, or restores them all", async () => {
    const { user, dialog, state } = await openEditor("Bench Press");
    await user.click(await within(dialog).findByRole("button", { name: /literatür değeri.*0,6/i }));
    await user.click(within(dialog).getByRole("button", { name: "Bu değeri uygula" }));
    expect(within(dialog).getByRole("textbox", { name: "Ön Omuz yükü (sayı)" })).toHaveValue("0,6");

    // Chest is 1 in the catalog but 0,95 in the literature: marked as revised.
    expect(within(dialog).getByRole("button", { name: /literatür değeri.*0,95.*literatürden farklı/i })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /literatür değerlerine dön/i }));
    expect(within(dialog).getByRole("button", { name: /literatür değerlerine dön/i })).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: /literatürden farklı/i })).not.toBeInTheDocument();
    await user.click(saveButton(dialog));
    await waitFor(() =>
      expect(musclesOf(state, "Bench Press")).toEqual([
        { key: "chest", load: 0.95 },
        { key: "frontDelt", load: 0.6 },
        { key: "biceps", load: 0.3 },
        { key: "triceps", load: 0.5 },
      ])
    );
  });

  it("says so when an exercise has no literature reference", async () => {
    const { dialog } = await openEditor("DB Fly");
    expect(await within(dialog).findByText(/literatür değeri yok/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /literatür değeri/i })).not.toBeInTheDocument();
  });
});

describe("Mascot page", () => {
  async function renderPage() {
    const harness = installFakeApi();
    const view = renderWithProviders(<MascotPage />);
    await screen.findByText(/maskot mesajları/i);
    return { ...view, ...harness };
  }

  it("groups keys by their prefix", async () => {
    await renderPage();
    expect((await screen.findAllByText("Ana ekran")).length).toBeGreaterThan(0);
    expect(screen.getByText("Haftalık rapor")).toBeInTheDocument();
    expect(screen.getByText("Toparlanma")).toBeInTheDocument();
  });

  it("renders the preview with placeholders filled in", async () => {
    await renderPage();
    // home.morning: "Günaydın {name}! …" → the sample name must be substituted.
    const preview = await screen.findByTestId("mascot-preview");
    expect(within(preview).getByText(/günaydın eren!/i)).toBeInTheDocument();
    expect(within(preview).queryByText(/\{name\}/)).not.toBeInTheDocument();
  });

  it("saves an edited variant and clears the dirty state", async () => {
    const user = userEvent.setup();
    const { state } = await renderPage();

    const first = await screen.findByLabelText("1. varyant");
    await user.clear(first);
    await user.type(first, "Günaydın, hadi başlayalım.");

    expect(await screen.findByRole("button", { name: /^kaydet$/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /^kaydet$/i }));

    await waitFor(() => {
      const msg = state.messages.find((m) => m.key === "home.morning");
      expect(msg?.variants[0]).toBe("Günaydın, hadi başlayalım.");
    });
  });

  it("switches Floo's mood with the message", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(await screen.findByLabelText(/ruh hâli/i), "worried");
    await waitFor(() => expect(screen.getAllByRole("img", { name: /floo — endişeli/i }).length).toBeGreaterThan(0));
  });
});

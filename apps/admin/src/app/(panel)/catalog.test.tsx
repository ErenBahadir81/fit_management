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

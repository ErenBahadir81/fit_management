import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/programs/tpl_ppl7",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "tpl_ppl7" }),
}));

import { installFakeApi, renderWithProviders } from "@/test/utils";
import ProgramBuilderPage from "./[id]/page";

function matrixRow(name: string): HTMLElement {
  const row = screen.getAllByRole("row").find((r) => within(r).queryByText(name));
  if (!row) throw new Error(`No matrix row for ${name}`);
  return row;
}

async function renderBuilder() {
  const harness = installFakeApi();
  const view = renderWithProviders(<ProgramBuilderPage />);
  await screen.findByText(/haftalık hacim matrisi/i);
  await waitFor(() => expect(matrixRow("Göğüs")).toBeTruthy());
  return { ...view, ...harness };
}

describe("Program builder — weekly volume matrix", () => {
  it("computes Σ targetSets × muscle load over the cycle", async () => {
    await renderBuilder();
    // Bench 4×1 + Incline 3×0.9 + DB Fly 4×0.9 + Dips 3×0.8 = 12,7 over a 7-day cycle.
    expect(within(matrixRow("Göğüs")).getByText("12,7")).toBeInTheDocument();
    expect(within(matrixRow("Göğüs")).getByText("Az")).toBeInTheDocument();
  });

  it("shows a per-day breakdown alongside the weekly total", async () => {
    await renderBuilder();
    const chest = matrixRow("Göğüs");
    // Day 1 (Bench 4 + Incline 2.7) = 6.7, day 2 (Pull A) has no chest work.
    expect(within(chest).getByText("6,7")).toBeInTheDocument();
    expect(within(chest).getAllByText("·").length).toBeGreaterThan(0);
  });

  it("recomputes live when a set count is edited and flags the target as met", async () => {
    const user = userEvent.setup();
    await renderBuilder();

    await user.click(screen.getByRole("button", { name: /bench press set sayısı: 4/i }));
    const input = screen.getByRole("spinbutton", { name: /bench press set sayısı/i });
    await user.clear(input);
    await user.type(input, "8{Enter}");

    await waitFor(() => expect(within(matrixRow("Göğüs")).getByText("16,7")).toBeInTheDocument());
    expect(within(matrixRow("Göğüs")).getByText("Hedefte")).toBeInTheDocument();
  });

  it("switches the matrix between weekly and cycle basis", async () => {
    const user = userEvent.setup();
    await renderBuilder();
    // The PPL template is a 7-day cycle, so both bases agree; Full Body would differ.
    await user.click(screen.getByRole("radio", { name: "Döngü" }));
    expect(within(matrixRow("Göğüs")).getByText("12,7")).toBeInTheDocument();
  });

  it("raises the unsaved-changes guard after an edit and clears it on save", async () => {
    const user = userEvent.setup();
    await renderBuilder();
    expect(screen.queryByText(/kaydedilmemiş değişiklikler var/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /bench press set sayısı: 4/i }));
    const input = screen.getByRole("spinbutton", { name: /bench press set sayısı/i });
    await user.clear(input);
    await user.type(input, "5{Enter}");

    expect(await screen.findByText(/kaydedilmemiş değişiklikler var/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /^kaydet$/i })[0]);
    await waitFor(() => expect(screen.queryByText(/kaydedilmemiş değişiklikler var/i)).not.toBeInTheDocument());
  });

  it("adds an exercise from the picker into the chosen day and updates the matrix", async () => {
    const user = userEvent.setup();
    await renderBuilder();

    const dayOne = screen.getByRole("region", { name: /1\. gün: push a/i });
    await user.click(within(dayOne).getByRole("button", { name: /hareket ekle/i }));

    const dialog = await screen.findByRole("dialog", { name: /hareket ekle/i });
    await user.type(within(dialog).getByLabelText(/hareket ara/i), "Shrug");
    await user.click(await within(dialog).findByRole("button", { name: /shrug/i }));

    // Shrug is 3 × traps 1.0, added on top of the template's existing trapezius work.
    await waitFor(() => expect(within(dayOne).getByText("Shrug")).toBeInTheDocument());
    expect(await screen.findByText(/kaydedilmemiş değişiklikler var/i)).toBeInTheDocument();
  });

  it("moves an exercise to the next day", async () => {
    const user = userEvent.setup();
    await renderBuilder();

    await user.click(screen.getByRole("button", { name: /bench press sonraki güne taşı/i }));

    const dayTwo = screen.getByRole("region", { name: /2\. gün: pull a/i });
    await waitFor(() => expect(within(dayTwo).getByText("Bench Press")).toBeInTheDocument());
  });
});

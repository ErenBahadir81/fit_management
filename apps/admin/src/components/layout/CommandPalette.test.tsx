import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { renderWithProviders } from "@/test/utils";
import { CommandPalette, filterCommands, fold, type Command } from "./CommandPalette";

const cmd = (over: Partial<Command>): Command => ({ id: "x", label: "X", group: "G", run: () => {}, ...over });

describe("fold / filterCommands", () => {
  it("folds Turkish characters so plain-ASCII typing matches", () => {
    expect(fold("Göğüs")).toBe("gogus");
    expect(fold("İSTANBUL")).toBe("istanbul");
    expect(fold("Şahin")).toBe("sahin");
  });

  it("matches label, group and keywords", () => {
    const commands = [
      cmd({ id: "a", label: "Kaslar", group: "Katalog", keywords: ["muscle"] }),
      cmd({ id: "b", label: "Ayarlar", group: "Sistem" }),
    ];
    expect(filterCommands(commands, "muscle").map((c) => c.id)).toEqual(["a"]);
    expect(filterCommands(commands, "katalog").map((c) => c.id)).toEqual(["a"]);
    expect(filterCommands(commands, "ayar").map((c) => c.id)).toEqual(["b"]);
    expect(filterCommands(commands, "").map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("CommandPalette", () => {
  beforeEach(() => push.mockReset());

  it("renders nothing while closed", () => {
    renderWithProviders(<CommandPalette open={false} onOpenChange={() => {}} />);
    expect(screen.queryByRole("dialog", { name: /komut paleti/i })).not.toBeInTheDocument();
  });

  it("lists every navigation target when opened", async () => {
    renderWithProviders(<CommandPalette open onOpenChange={() => {}} />);
    expect(await screen.findByRole("dialog", { name: /komut paleti/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /panel/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /kullanıcılar/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /hedef motoru/i })).toBeInTheDocument();
  });

  it("navigates to the highlighted result on Enter and closes", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText(/komut ara/i), "kas");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    await user.keyboard("{Enter}");

    expect(push).toHaveBeenCalledWith("/muscles");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("moves the selection with the arrow keys", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open onOpenChange={() => {}} />);

    await user.type(screen.getByLabelText(/komut ara/i), "l");
    const before = screen.getAllByRole("option");
    expect(before[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}");
    const after = screen.getAllByRole("option");
    expect(after[0]).toHaveAttribute("aria-selected", "false");
    expect(after[1]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  });

  it("navigates when a result is clicked", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("option", { name: /besinler/i }));
    expect(push).toHaveBeenCalledWith("/foods");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape without navigating", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText(/komut ara/i), "{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("tells the user when nothing matches", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText(/komut ara/i), "zzzz");
    expect(await screen.findByText(/eşleşen komut yok/i)).toBeInTheDocument();
  });

  it("runs extra commands supplied by the page", async () => {
    const run = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <CommandPalette open onOpenChange={() => {}} extraCommands={[cmd({ id: "z", label: "Şablon oluştur", group: "İşlem", run })]} />
    );
    await user.click(screen.getByRole("option", { name: /şablon oluştur/i }));
    expect(run).toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/users",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { installFakeApi, renderWithProviders } from "@/test/utils";
import UsersPage from "./page";

async function renderPage() {
  const harness = installFakeApi();
  const view = renderWithProviders(<UsersPage />);
  await screen.findByText("Eren Yılmaz");
  return { ...view, ...harness };
}

describe("Users page", () => {
  it("lists users with their role, goal status and last-seen", async () => {
    await renderPage();
    const row = screen.getByText("Eren Yılmaz").closest("tr")!;
    expect(within(row).getByText("Yönetici")).toBeInTheDocument();
    expect(within(row).getByText("Aktif")).toBeInTheDocument();
    expect(within(row).getByText(/dk önce|sa önce/)).toBeInTheDocument();
  });

  it("filters through the API as the search box is typed", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByLabelText(/ara/i), "inci");
    await waitFor(() => expect(screen.queryByText("Eren Yılmaz")).not.toBeInTheDocument());
    expect(await screen.findByText("İnci Demir")).toBeInTheDocument();
  });

  it("shows an empty state with a clear next step when nothing matches", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByLabelText(/ara/i), "zzzz");
    expect(await screen.findByText(/eşleşen kullanıcı yok/i)).toBeInTheDocument();
  });

  it("validates the create form with the core schema before calling the API", async () => {
    const user = userEvent.setup();
    const { api } = await renderPage();
    const createUser = vi.spyOn(api.admin, "createUser");

    await user.click(screen.getByRole("button", { name: /yeni kullanıcı/i }));
    const drawer = await screen.findByRole("dialog", { name: /yeni kullanıcı/i });

    await user.type(within(drawer).getByLabelText(/ad soyad/i), "Test Kullanıcı");
    await user.type(within(drawer).getByLabelText(/^kullanıcı adı/i), "ab");
    await user.type(within(drawer).getByLabelText(/^parola/i), "123");
    await user.click(within(drawer).getByRole("button", { name: /oluştur/i }));

    expect(await within(drawer).findByText(/kullanıcı adı geçersiz/i)).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates a user and shows it in the table", async () => {
    const user = userEvent.setup();
    const { state } = await renderPage();

    await user.click(screen.getByRole("button", { name: /yeni kullanıcı/i }));
    const drawer = await screen.findByRole("dialog", { name: /yeni kullanıcı/i });
    await user.type(within(drawer).getByLabelText(/ad soyad/i), "Deniz Kaya");
    await user.type(within(drawer).getByLabelText(/^kullanıcı adı/i), "deniz");
    await user.type(within(drawer).getByLabelText(/^parola/i), "gizli123");
    await user.click(within(drawer).getByRole("button", { name: /oluştur/i }));

    await waitFor(() => expect(state.users.some((u) => u.username === "deniz")).toBe(true));
    await waitFor(() => expect(screen.getAllByText("Deniz Kaya").length).toBeGreaterThan(0));
  });

  it("requires a confirmation before deleting and then removes the row", async () => {
    const user = userEvent.setup();
    const { state } = await renderPage();

    await user.click(screen.getByRole("button", { name: "Mert Şahin sil" }));
    const dialog = await screen.findByRole("dialog", { name: /kullanıcıyı sil/i });
    expect(within(dialog).getByText(/geri alınamaz/i)).toBeInTheDocument();

    const before = state.users.length;
    await user.click(within(dialog).getByRole("button", { name: /^sil$/i }));
    await waitFor(() => expect(state.users.length).toBe(before - 1));
  });

  it("assigns a program template from the row action", async () => {
    const user = userEvent.setup();
    const { state } = await renderPage();

    const row = screen.getByText("Selin Korkmaz").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Selin Korkmaz için program ata" }));

    const dialog = await screen.findByRole("dialog", { name: /program ata/i });
    await user.click(within(dialog).getByRole("button", { name: /^ata$/i }));

    await waitFor(() => expect(state.programByUser.usr_selin).toBeTruthy());
  });
});

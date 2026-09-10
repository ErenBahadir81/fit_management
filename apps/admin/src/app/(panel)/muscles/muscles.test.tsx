import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiClientError } from "@fitfloow/api-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/muscles",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { installFakeApi, renderWithProviders } from "@/test/utils";
import MusclesPage from "./page";

async function renderPage() {
  const harness = installFakeApi();
  const view = renderWithProviders(<MusclesPage />);
  await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(1));
  return { ...view, ...harness };
}

function orderedNames(): string[] {
  return screen.getAllByRole("listitem").map((li) => {
    const code = li.querySelector("code");
    return code?.textContent ?? "";
  });
}

describe("Muscles page", () => {
  it("renders the catalog ordered by `order`", async () => {
    await renderPage();
    const names = orderedNames();
    expect(names[0]).toBe("chest");
    expect(names[1]).toBe("frontDelt");
  });

  it("applies a reorder optimistically before the request resolves", async () => {
    const { api } = await renderPage();
    const original = api.admin.reorderMuscles;
    const gate: { release: (() => void) | undefined } = { release: undefined };
    vi.spyOn(api.admin, "reorderMuscles").mockImplementation(
      (keys: string[]) =>
        new Promise((resolve) => {
          gate.release = () => resolve(original(keys));
        })
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /göğüs aşağı taşı/i }));

    // Optimistic: the DOM has already swapped while the request is still pending.
    await waitFor(() => expect(orderedNames()[0]).toBe("frontDelt"));
    expect(orderedNames()[1]).toBe("chest");

    gate.release?.();
    await waitFor(() => expect(orderedNames()[0]).toBe("frontDelt"));
  });

  it("rolls the order back and shows an error toast when the request fails", async () => {
    const { api } = await renderPage();
    vi.spyOn(api.admin, "reorderMuscles").mockRejectedValue(new ApiClientError(500, "INTERNAL", "Sunucu hatası"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /göğüs aşağı taşı/i }));

    expect(await screen.findByText(/sıralama kaydedilemedi/i)).toBeInTheDocument();
    await waitFor(() => expect(orderedNames()[0]).toBe("chest"));
  });

  it("disables the up arrow on the first row and the down arrow on the last", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: /göğüs yukarı taşı/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /baldır aşağı taşı/i })).toBeDisabled();
  });

  it("persists an inline edit of the recovery hours optimistically", async () => {
    const { state } = await renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /göğüs tam yenilenme süresi \(saat\): 48/i }));
    const input = screen.getByRole("spinbutton", { name: /göğüs tam yenilenme süresi/i });
    await user.clear(input);
    await user.type(input, "36{Enter}");

    await waitFor(() => expect(state.muscles.find((m) => m.key === "chest")?.fullRecoveryHours).toBe(36));
    expect(await screen.findByRole("button", { name: /göğüs tam yenilenme süresi \(saat\): 36/i })).toBeInTheDocument();
  });

  it("shows the recovery curve when a row is expanded", async () => {
    await renderPage();
    const user = userEvent.setup();
    const row = screen.getAllByRole("listitem")[0];
    await user.click(within(row).getByRole("button", { name: /yenilenme eğrisini göster/i }));
    expect(await within(row).findByText(/yenilenme eğrisi/i)).toBeInTheDocument();
  });
});

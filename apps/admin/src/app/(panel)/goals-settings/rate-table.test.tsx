import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_RATE_TABLE, validateRateTable, type RateBand } from "@fitfloow/core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/goals-settings",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { installFakeApi, renderWithProviders } from "@/test/utils";
import { RateTableEditor } from "./RateTableEditor";
import GoalSettingsPage from "./page";

function Harness({ initial }: { initial: RateBand[] }) {
  const [bands, setBands] = useState<RateBand[]>(initial);
  return <RateTableEditor bands={bands} onChange={setBands} />;
}

describe("RateTableEditor", () => {
  it("reports no problems for the seeded 16-band table", () => {
    renderWithProviders(<Harness initial={structuredClone(DEFAULT_RATE_TABLE)} />);
    expect(screen.queryByText(/oran tablosu geçersiz/i)).not.toBeInTheDocument();
    expect(screen.getByText(/0–100 aralığı kesintisiz kapsanıyor/i)).toBeInTheDocument();
  });

  it("lists only the selected sex's bands and switches with the segmented control", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={structuredClone(DEFAULT_RATE_TABLE)} />);

    const maleRows = screen.getAllByRole("row").length;
    expect(maleRows).toBe(DEFAULT_RATE_TABLE.filter((b) => b.sex === "male").length + 1); // + header

    await user.click(screen.getByRole("radio", { name: "Kadın" }));
    await waitFor(() => expect(screen.getAllByRole("row").length).toBe(DEFAULT_RATE_TABLE.filter((b) => b.sex === "female").length + 1));
  });

  it("surfaces a gap when a band boundary is edited apart", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={structuredClone(DEFAULT_RATE_TABLE)} />);

    await user.click(screen.getByRole("button", { name: /erkek 1\. bant üst sınır: 8/i }));
    const input = screen.getByRole("spinbutton", { name: /erkek 1\. bant üst sınır/i });
    await user.clear(input);
    await user.type(input, "6{Enter}");

    const problems = await screen.findByTestId("rate-table-problems");
    expect(within(problems).getByText(/male: 6 ile 8 arasında boşluk\/çakışma/i)).toBeInTheDocument();
  });

  it("flags a first band that no longer starts at zero", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={structuredClone(DEFAULT_RATE_TABLE)} />);

    await user.click(screen.getByRole("button", { name: /erkek 1\. bant alt sınır: 0/i }));
    const input = screen.getByRole("spinbutton", { name: /erkek 1\. bant alt sınır/i });
    await user.clear(input);
    await user.type(input, "3{Enter}");

    const problems = await screen.findByTestId("rate-table-problems");
    expect(within(problems).getByText(/male: ilk bant 0'dan başlamalı/i)).toBeInTheDocument();
  });

  it("flags a band whose conservative rate exceeds its optimal rate", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={structuredClone(DEFAULT_RATE_TABLE)} />);

    await user.click(screen.getByRole("button", { name: /erkek 0-8 temkinli oran: 0\.2/i }));
    const input = screen.getByRole("spinbutton", { name: /erkek 0-8 temkinli oran/i });
    await user.clear(input);
    await user.type(input, "0.9{Enter}");

    const problems = await screen.findByTestId("rate-table-problems");
    expect(within(problems).getByText(/temkinli ≤ optimal ≤ agresif olmalı/i)).toBeInTheDocument();
  });

  it("leaves a hole when a middle band is deleted", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={structuredClone(DEFAULT_RATE_TABLE)} />);

    await user.click(screen.getByRole("button", { name: /erkek 8-12 bandını sil/i }));
    const problems = await screen.findByTestId("rate-table-problems");
    expect(within(problems).getByText(/male: 8 ile 12 arasında boşluk\/çakışma/i)).toBeInTheDocument();
  });

  it("adds a band that continues from the last one", async () => {
    const user = userEvent.setup();
    const bands = structuredClone(DEFAULT_RATE_TABLE).filter((b) => !(b.sex === "male" && b.bfMin === 40));
    renderWithProviders(<Harness initial={bands} />);

    expect(await screen.findByTestId("rate-table-problems")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /bant ekle/i }));
    await waitFor(() => expect(screen.queryByTestId("rate-table-problems")).not.toBeInTheDocument());
  });
});

describe("Goal settings page", () => {
  it("blocks saving while the rate table is invalid", async () => {
    installFakeApi();
    const user = userEvent.setup();
    renderWithProviders(<GoalSettingsPage />);

    await screen.findByRole("heading", { name: /hedef motoru/i });
    await user.click(await screen.findByRole("radio", { name: "Oran tablosu" }));

    await user.click(await screen.findByRole("button", { name: /erkek 1\. bant üst sınır: 8/i }));
    const input = screen.getByRole("spinbutton", { name: /erkek 1\. bant üst sınır/i });
    await user.clear(input);
    await user.type(input, "6{Enter}");

    expect(await screen.findByText(/düzeltmeden kaydedemezsin/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^kaydet$/i })).toBeDisabled();
  });

  it("keeps the simulator in step with the constants", async () => {
    installFakeApi();
    const user = userEvent.setup();
    renderWithProviders(<GoalSettingsPage />);

    await screen.findByRole("heading", { name: /plan önizleme/i });
    const before = screen.getByLabelText(/hedef yağ oranı/i) as HTMLInputElement;
    expect(before.value).toBe("7");

    await user.clear(before);
    await user.type(before, "9");

    // A shallower target means fewer weeks in the roadmap.
    await waitFor(() => expect(screen.getByText(/kaybedilecek yağ/i).closest("div")?.textContent).toMatch(/1,1[0-9]? kg/));
  });
});

describe("validateRateTable contract used by the editor", () => {
  it("agrees with the editor's expectations", () => {
    expect(validateRateTable(DEFAULT_RATE_TABLE)).toEqual([]);
    expect(validateRateTable(DEFAULT_RATE_TABLE.filter((b) => b.sex === "male"))).toContain("female: en az bir bant gerekli");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams("next=/muscles"),
  usePathname: () => "/login",
}));

const login = vi.fn();
vi.mock("@/lib/api", () => ({
  USE_FAKE_API: false,
  api: { auth: { login: (...args: unknown[]) => login(...args) } },
  getApi: () => ({ auth: { login } }),
  __setApiClient: vi.fn(),
}));

import { renderWithProviders } from "@/test/utils";
import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    login.mockReset();
  });

  it("validates with the core schema before hitting the network", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/kullanıcı adı/i), "ab");
    await user.click(screen.getByRole("button", { name: /giriş yap/i }));

    expect(await screen.findByText(/geçerli bir kullanıcı adı gir/i)).toBeInTheDocument();
    expect(screen.getByText(/parola boş olamaz/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("sends lowercased credentials and navigates to ?next on success", async () => {
    login.mockResolvedValue({ accessToken: "a", refreshToken: "r", user: { id: "1" } });
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/kullanıcı adı/i), "Eren");
    await user.type(screen.getByLabelText(/parola/i), "fitfloow");
    await user.click(screen.getByRole("button", { name: /giriş yap/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("eren", "fitfloow"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/muscles"));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the API error message and stays on the form", async () => {
    login.mockRejectedValue(new Error("Kullanıcı adı veya parola hatalı"));
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/kullanıcı adı/i), "eren");
    await user.type(screen.getByLabelText(/parola/i), "yanlis");
    await user.click(screen.getByRole("button", { name: /giriş yap/i }));

    expect(await screen.findByText(/kullanıcı adı veya parola hatalı/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /giriş yap/i })).toBeEnabled();
  });

  it("disables the submit button while the request is in flight", async () => {
    let resolve: (v: unknown) => void = () => {};
    login.mockImplementation(() => new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/kullanıcı adı/i), "eren");
    await user.type(screen.getByLabelText(/parola/i), "fitfloow");
    await user.click(screen.getByRole("button", { name: /giriş yap/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /giriş yapılıyor/i })).toBeDisabled());
    resolve({ accessToken: "a", refreshToken: "r", user: {} });
  });
});

import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { renderUI } from "../helpers";
import { mockRouter } from "../mocks/expo-router";
import { LoginScreen } from "../../src/features/auth/LoginScreen";
import { useSession } from "../../src/features/auth/session";
import { setApi } from "../../src/lib/api";
import { createFakeApi, FAKE_CREDENTIALS } from "../../src/lib/fake";
import { storage } from "../../src/lib/storage";

jest.mock("expo-router", () => jest.requireActual("../mocks/expo-router"));

describe("LoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.clearAll();
    useSession.setState({ status: "signedOut", user: null });
    setApi(createFakeApi({ latencyMs: 0 }));
  });

  test("renders Floo, the fields and one primary action", async () => {
    await renderUI(<LoginScreen />);
    expect(screen.getByTestId("login-floo")).toBeTruthy();
    expect(screen.getByLabelText("Kullanıcı adı")).toBeTruthy();
    expect(screen.getByLabelText("Şifre")).toBeTruthy();
    expect(screen.getByText("Giriş yap")).toBeTruthy();
  });

  test("validates empty fields inline without calling the API", async () => {
    await renderUI(<LoginScreen />);
    await fireEvent.press(screen.getByText("Giriş yap"));
    expect(screen.getByText(/kullanıcı adını gir/i)).toBeTruthy();
    expect(useSession.getState().status).toBe("signedOut");
  });

  test("wrong password → error line, error haptic, shake; stays signed out", async () => {
    await renderUI(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText("Kullanıcı adı"), "eren");
    await fireEvent.changeText(screen.getByLabelText("Şifre"), "yanlış");
    await fireEvent.press(screen.getByText("Giriş yap"));
    await waitFor(() => expect(screen.getByText(/kullanıcı adı veya şifre hatalı/i)).toBeTruthy());
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("error");
    expect(useSession.getState().status).toBe("signedOut");
  });

  test("correct credentials → session signed in and navigation to the tabs", async () => {
    await renderUI(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText("Kullanıcı adı"), FAKE_CREDENTIALS.username);
    await fireEvent.changeText(screen.getByLabelText("Şifre"), FAKE_CREDENTIALS.password);
    await fireEvent.press(screen.getByText("Giriş yap"));
    await waitFor(() => expect(useSession.getState().status).toBe("signedIn"));
    expect(useSession.getState().user?.username).toBe("eren");
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)");
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
  });
});

import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderUI } from "../helpers";
import { ProfileScreen } from "../../src/features/profile/ProfileScreen";
import { useSession } from "../../src/features/auth/session";
import { setApi } from "../../src/lib/api";
import { createFakeApi } from "../../src/lib/fake";
import { storage } from "../../src/lib/storage";

jest.mock("expo-router", () => jest.requireActual("../mocks/expo-router"));

describe("ProfileScreen", () => {
  let api: ReturnType<typeof createFakeApi>;
  beforeEach(async () => {
    jest.clearAllMocks();
    storage.clearAll();
    api = createFakeApi({ latencyMs: 0, signedIn: true });
    setApi(api);
    useSession.setState({ status: "signedIn", user: (await api.auth.me()).user });
  });

  test("shows identity, 7 measurement-day chips with the current one selected, and the app version", async () => {
    await renderUI(<ProfileScreen />);
    expect(screen.getByText("Eren")).toBeTruthy();
    expect(screen.getByText("@eren")).toBeTruthy();
    for (const d of ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"]) expect(screen.getByText(d)).toBeTruthy();
    expect(screen.getByTestId("mday-0").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText(/2\.0\.0/)).toBeTruthy();
  });

  test("changing the measurement day is optimistic and persists through PATCH /me", async () => {
    await renderUI(<ProfileScreen />);
    await fireEvent.press(screen.getByTestId("mday-3"));
    expect(useSession.getState().user?.measurementDay).toBe(3); // optimistic
    await waitFor(async () => expect((await api.auth.me()).user.measurementDay).toBe(3));
  });

  test("failed update rolls back and shows an error toast", async () => {
    api.me.update = (async () => {
      throw new Error("offline");
    }) as typeof api.me.update;
    await renderUI(<ProfileScreen />);
    await fireEvent.press(screen.getByTestId("mday-5"));
    await waitFor(() => expect(useSession.getState().user?.measurementDay).toBe(0));
    expect(screen.getByText(/kaydedilemedi/i)).toBeTruthy();
  });

  test("theme segmented switches the theme and persists it", async () => {
    await renderUI(<ProfileScreen />);
    await fireEvent.press(screen.getByTestId("theme-dark"));
    expect(storage.getString("theme.mode")).toBe("dark");
  });

  test("mascot toggle and height stepper call the API", async () => {
    await renderUI(<ProfileScreen />);
    await fireEvent.press(screen.getByTestId("mascot-toggle"));
    await waitFor(async () => expect((await api.auth.me()).user.mascotEnabled).toBe(false));
    await fireEvent.press(screen.getByTestId("height-inc"));
    await waitFor(async () => expect((await api.auth.me()).user.heightCm).toBe(181));
  });

  test("logout signs the session out", async () => {
    await renderUI(<ProfileScreen />);
    await fireEvent.press(screen.getByText("Çıkış yap"));
    await waitFor(() => expect(useSession.getState().status).toBe("signedOut"));
  });
});

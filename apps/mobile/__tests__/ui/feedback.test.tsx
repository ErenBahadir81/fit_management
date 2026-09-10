import React from "react";
import { act, fireEvent, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { renderUI } from "../helpers";
import { useToast } from "../../src/ui/Toast";
import { Button } from "../../src/ui/Button";
import { EmptyState } from "../../src/ui/EmptyState";
import { Header } from "../../src/ui/Header";
import { SuccessCheck } from "../../src/ui/SuccessCheck";

function Trigger({ kind }: { kind: "success" | "error" | "info" }) {
  const toast = useToast();
  return <Button label="go" onPress={() => toast.show({ message: "Kaydedildi", kind })} />;
}

describe("Toast", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  test("shows a message with a success haptic and auto-hides", async () => {
    await renderUI(<Trigger kind="success" />);
    await act(async () => {
      await fireEvent.press(screen.getByText("go"));
    });
    expect(screen.getByText("Kaydedildi")).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.queryByText("Kaydedildi")).toBeNull();
  });

  test("error toasts use the error haptic and an alert role", async () => {
    await renderUI(<Trigger kind="error" />);
    await act(async () => {
      await fireEvent.press(screen.getByText("go"));
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("error");
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("EmptyState / Header / SuccessCheck", () => {
  test("EmptyState shows title, body and an action", async () => {
    const onPress = jest.fn();
    await renderUI(<EmptyState title="Henüz veri yok" body="İlk ölçümünü ekle." action={{ label: "Ekle", onPress }} />);
    expect(screen.getByText("Henüz veri yok")).toBeTruthy();
    await fireEvent.press(screen.getByText("Ekle"));
    expect(onPress).toHaveBeenCalled();
  });
  test("Header renders title/subtitle and right action", async () => {
    const onPress = jest.fn();
    await renderUI(<Header title="Profil" subtitle="Ayarlar" right={{ icon: "settings-outline", onPress, label: "Ayarlar" }} />);
    expect(screen.getByText("Profil")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Ayarlar"));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText("Profil").props.accessibilityRole).toBe("header");
  });
  test("SuccessCheck fires a success haptic when shown", async () => {
    jest.clearAllMocks();
    await renderUI(<SuccessCheck testID="ok" />);
    expect(screen.getByTestId("ok")).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
  });
});

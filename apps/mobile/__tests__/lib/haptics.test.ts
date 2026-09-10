import * as Haptics from "expo-haptics";
import { haptic } from "../../src/lib/haptics";

describe("haptics", () => {
  beforeEach(() => jest.clearAllMocks());

  test("tap → light impact", async () => {
    await haptic.tap();
    expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
  });
  test("select → selection", async () => {
    await haptic.select();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });
  test("success / error → notification", async () => {
    await haptic.success();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
    await haptic.error();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("error");
  });
  test("never throws even if the native module rejects", async () => {
    (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error("no haptics"));
    await expect(haptic.tap()).resolves.toBeUndefined();
  });
});

import { KEYPAD_MAX_G, keypadNext } from "../../../src/features/nutrition/components/GramKeypad";

describe("gram keypad", () => {
  test("the first digit replaces the shown amount, the next ones append", () => {
    let d = keypadNext("150", "2", true);
    expect(d).toBe("2");
    d = keypadNext(d, "3", false);
    d = keypadNext(d, "7", false);
    expect(d).toBe("237");
  });

  test("backspace removes one digit, or clears a fresh amount", () => {
    expect(keypadNext("237", "back", false)).toBe("23");
    expect(keypadNext("150", "back", true)).toBe("");
    expect(keypadNext("", "back", false)).toBe("");
  });

  test("no leading zeros, at most four digits, never above the cap", () => {
    expect(keypadNext("", "0", false)).toBe("");
    expect(keypadNext("5", "0", false)).toBe("50");
    expect(keypadNext("1999", "9", false)).toBe("1999");
    expect(keypadNext("300", "0", false)).toBe(String(KEYPAD_MAX_G));
  });
});

import { storage, getJSON, setJSON, removeKey } from "../../src/lib/storage";

describe("storage (MMKV)", () => {
  test("JSON round trip and removal", () => {
    setJSON("t.obj", { a: 1, b: "x" });
    expect(getJSON<{ a: number; b: string }>("t.obj")).toEqual({ a: 1, b: "x" });
    removeKey("t.obj");
    expect(getJSON("t.obj")).toBeNull();
  });

  test("corrupt JSON returns null instead of throwing", () => {
    storage.set("t.bad", "{not json");
    expect(getJSON("t.bad")).toBeNull();
  });
});

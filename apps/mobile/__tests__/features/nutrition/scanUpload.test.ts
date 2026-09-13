import { scanUploadFrom } from "../../../src/features/nutrition/scan/camera";

jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get name(): string {
      return this.uri.split("/").pop() ?? "";
    }
    get type(): string {
      return "image/jpeg";
    }
    async bytes(): Promise<Uint8Array> {
      return new Uint8Array([0xff, 0xd8, 0xff]);
    }
  },
}));

/**
 * Expo's fetch builds the multipart body itself (expo/src/winter/fetch/convertFormData.ts) and
 * accepts a part only when it is a string, a Blob, or an object exposing `bytes()`. React Native's
 * classic `{uri,name,type}` object throws "Unsupported FormDataPart implementation" *while the body
 * is assembled* — before a socket is opened — so the upload surfaced as a bogus "no connection".
 */
function encodableByExpoFetch(part: unknown): boolean {
  return (
    typeof part === "string" ||
    part instanceof Blob ||
    (typeof part === "object" && part !== null && "bytes" in part)
  );
}

describe("scanUploadFrom", () => {
  it("returns a part Expo's fetch can encode into a multipart body", async () => {
    expect(encodableByExpoFetch(await scanUploadFrom("file:///cache/ImagePicker/abc.jpg"))).toBe(true);
  });

  it("carries a filename and an image mime type so the API sees a file part", async () => {
    const upload = (await scanUploadFrom("file:///cache/ImagePicker/abc.jpg")) as { name?: string; type?: string };
    expect(upload.name).toMatch(/\.jpg$/i);
    expect(upload.type).toMatch(/^image\//);
  });
});

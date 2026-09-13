import { Platform } from "react-native";
import { File as FsFile } from "expo-file-system";

/**
 * expo-camera is a native module: on web we bundle but never mount it, and the flows fall back to
 * the gallery picker / manual entry. Keep every camera import behind this flag.
 */
export const CAMERA_SUPPORTED = Platform.OS !== "web";

export const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e"] as const;

/** A React Native multipart file for `api.nutrition.scan()`. */
export function scanFileFrom(uri: string): { uri: string; name: string; type: string } {
  const clean = uri.split("?")[0];
  const ext = clean.slice(clean.lastIndexOf(".") + 1).toLowerCase();
  const type = ext === "png" ? "image/png" : "image/jpeg";
  return { uri, name: `scan.${type === "image/png" ? "png" : "jpg"}`, type };
}

/**
 * What actually goes into the multipart body — a part Expo's `fetch` knows how to encode.
 *
 * Expo's fetch assembles the body itself (`expo/src/winter/fetch/convertFormData.ts`) and accepts
 * only a string, a `Blob`, or an object exposing `bytes()`. React Native's classic `{uri,name,type}`
 * file object is none of those, so it throws "Unsupported FormDataPart implementation" *while the
 * body is built* — before a socket is opened, which makes a broken upload look like a dropped
 * connection. On native we therefore hand over an `expo-file-system` `File`, which carries
 * `bytes()`, `name` and `type` (the latter two keep it a *file* part, so the API's `req.file()`
 * still sees it). On web the picked `blob:`/`data:` URI is read back into a real `File`.
 */
export async function scanUploadFrom(uri: string): Promise<Blob> {
  const meta = scanFileFrom(uri);
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    return new File([blob], meta.name, { type: blob.type || meta.type });
  }
  return new FsFile(uri);
}

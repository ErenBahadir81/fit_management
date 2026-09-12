import { Platform } from "react-native";

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
 * What actually goes into the multipart body. React Native's `FormData` understands
 * `{uri,name,type}`; a browser does not — it stringifies the object to "[object Object]" and the
 * API rejects the upload. On web the picked `blob:`/`data:` URI is therefore read back into a real
 * `File` first.
 */
export async function scanUploadFrom(uri: string): Promise<{ uri: string; name: string; type: string } | File> {
  const file = scanFileFrom(uri);
  if (Platform.OS !== "web") return file;
  const blob = await (await fetch(uri)).blob();
  return new File([blob], file.name, { type: blob.type || file.type });
}

import { ApiClientError } from "@fitfloow/api-client";

/** One offline sentence for every write that could not leave the device. */
export const OFFLINE_MESSAGE = "Bağlantı yok. İnternet gelince tekrar dene.";

/**
 * Human copy for a failed request: offline gets its own line, a server message is used when it is
 * in Turkish (the API's messages are), everything else falls back to the feature's sentence.
 */
export function describeError(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) {
    if (e.isNetwork) return OFFLINE_MESSAGE;
    if (e.status === 429) return "Çok fazla istek. Biraz bekleyip tekrar dene.";
    if (e.status === 503) return "Sunucu şu an meşgul. Birazdan tekrar dene.";
  }
  return fallback;
}

export function isOffline(e: unknown): boolean {
  return e instanceof ApiClientError && e.isNetwork;
}

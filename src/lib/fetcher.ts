export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = "İstek başarısız";
    try {
      const data = await res.json();
      msg = data?.error || msg;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.json();
};

export async function apiSend<T = any>(
  url: string,
  method: "POST" | "PUT" | "DELETE" | "PATCH",
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = "İşlem başarısız";
    try {
      const data = await res.json();
      msg = data?.error || msg;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

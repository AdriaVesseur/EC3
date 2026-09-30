let token = "";
const endpoint = "http://127.0.0.1:32145/api";
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(endpoint + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-EC3-Client": "1",
      ...(token ? { "X-EC3-Token": token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(path === "/select-folder" ? 180000 : 45000),
  });
  if (!response.ok) {
    if (response.status === 401) token = "";
    const data = await response.json().catch(() => null);
    throw new Error(
      data?.message ??
        (response.status === 403
          ? "This web origin is not approved by the helper. Open the app from its Windows shortcut."
          : `Helper request failed (${response.status}). Reconnect and retry.`),
    );
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
export async function connect() {
  const session = await api<{ token: string }>("/session", {});
  token = session.token;
}
export const bytes = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(2)} GB`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)} MB`
      : n >= 1e3
        ? `${(n / 1e3).toFixed(1)} KB`
        : `${n} B`;
export const active = (state: string) =>
  !["complete", "failed", "cancelled"].includes(state);

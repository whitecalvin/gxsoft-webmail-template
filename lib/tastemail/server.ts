import "server-only";

export type MailDataMode = "mock" | "live";

export class ApiConfigurationError extends Error {}

export function mailDataMode(): MailDataMode {
  const mode = process.env.GXWEBMAIL_DATA_MODE ?? "mock";
  if (mode !== "mock" && mode !== "live") {
    throw new Error("GXWEBMAIL_DATA_MODE must be mock or live");
  }
  return mode;
}

function apiOrigin(): string {
  // This address is resolved on the Next.js host, not in the user's browser.
  const configured = process.env.TASTEMAIL_API_URL ?? "http://127.0.0.1:7531";
  let url: URL;
  try { url = new URL(configured); } catch { throw new ApiConfigurationError("TASTEMAIL_API_URL is not a URL"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash
  ) {
    throw new ApiConfigurationError("TASTEMAIL_API_URL must use HTTPS or loopback HTTP without credentials or a path");
  }
  return url.origin;
}

export function assertLiveApiConfigured(): void {
  apiOrigin();
}

export function tastemailRequest(path: string, token?: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid TASTEMAIL API path");
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(`${apiOrigin()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
}

export function serviceStatus(status: number): "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rateLimited";
  if (status === 408 || status === 425 || status >= 500) return "retryable";
  return "unavailable";
}

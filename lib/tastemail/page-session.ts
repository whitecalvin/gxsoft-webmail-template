import "server-only";
import { cache } from "react";

import { redirect } from "next/navigation";
import { tastemailRequest } from "@/lib/tastemail/server";
import { tastemailSessionToken } from "@/lib/tastemail/session";
import { validLiveJmapSession } from "@/lib/tastemail/session-contract";

export type PageSessionStatus = "ready" | "forbidden" | "rateLimited" | "retryable" | "unavailable";
export type PageSessionResult = { status: "ready"; session: unknown | null } | { status: Exclude<PageSessionStatus, "ready"> };
export type TokenPageSessionResult = PageSessionResult | { status: "unauthorized" };

// 같은 SSR 요청 안에서만 공유한다. API 인증이나 요청 간 영속 캐시에는 사용하지 않는다.
export const pageSessionForToken = cache(async (token: string): Promise<TokenPageSessionResult> => {
  let response: Response;
  try {
    response = await tastemailRequest("/.well-known/jmap", token);
  } catch {
    return { status: "retryable" };
  }
  if (response.status === 401) return { status: "unauthorized" };
  if (response.status === 403) return { status: "forbidden" };
  if (response.status === 429) return { status: "rateLimited" };
  if (!response.ok) return { status: response.status === 408 || response.status === 425 || response.status >= 500 ? "retryable" : "unavailable" };
  try {
    const body: unknown = await response.json();
    return validLiveJmapSession(body) ? { status: "ready", session: body } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
});

// Page-level guard. API routes independently authorize every data request.
export async function livePageSession(locale: string): Promise<PageSessionResult> {
  const token = await tastemailSessionToken();
  if (!token) redirect(`/${locale}/login`);
  const result = await pageSessionForToken(token);
  if (result.status === "unauthorized") redirect(`/${locale}/login?reason=session-ended`);
  return result;
}

export async function livePageSessionStatus(locale: string): Promise<PageSessionStatus> {
  return (await livePageSession(locale)).status;
}

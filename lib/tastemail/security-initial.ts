import "server-only";
import { cache } from "react";
import { tastemailSessionToken } from "./session";
import { loadLiveSecurity, SecurityServiceError, type InitialLiveSecurity } from "./security";

// 요청 안에서만 재사용하며 토큰을 Client Component props에 포함하지 않습니다.
export const initialLiveSecurity = cache(async (): Promise<InitialLiveSecurity> => {
  const token = await tastemailSessionToken();
  if (!token) return { status: "unauthorized", snapshot: null };
  try {
    return { status: "ready", snapshot: await loadLiveSecurity(token) };
  } catch (error) {
    const status = error instanceof SecurityServiceError &&
      ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"].includes(error.status)
      ? error.status as Exclude<InitialLiveSecurity["status"], "ready"> : "retryable";
    return { status, snapshot: null };
  }
});

import "server-only";
import { linkedOperationId, linkedOperationRequest, type LinkedOperationInput } from "../linked-operations";

export type MailDataMode = "live";

export class ApiConfigurationError extends Error {}

export function mailDataMode(): MailDataMode {
  return "live";
}

export function validateApiOrigin(configured: string): string {
  // This address is resolved on the Next.js host, not in the user's browser.
  let url: URL;
  try { url = new URL(configured); } catch { throw new ApiConfigurationError("TASTEMAIL_API_URL is not a URL"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  // 사설망 주소도 전송 암호화를 보장하지 않는다. 원격 API는 HTTPS,
  // 평문 HTTP는 같은 호스트 또는 검증된 로컬 SSH 터널에서만 사용한다.
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash
  ) {
    throw new ApiConfigurationError("TASTEMAIL_API_URL must use HTTPS or loopback HTTP without credentials or a path");
  }
  return url.origin;
}

function apiOrigin(): string {
  return validateApiOrigin(process.env.TASTEMAIL_API_URL ?? "http://127.0.0.1:6711");
}

export function assertLiveApiConfigured(): void {
  apiOrigin();
}

export function tastemailRequest(path: string, token?: string, init: RequestInit = {}): Promise<Response> {
  return requestWithDeadline(path, token, init, init.signal ? 15_000 : 10_000);
}

// 최대 60초인 외부 IMAP 인증에만 긴 제한을 부여합니다. 다른 요청의
// 제한이나 취소 처리는 바꾸지 않으며 임의 경로/무제한 timeout은 받지 않습니다.
export function tastemailVerifyLinkedAccount(id: string, token: string, expectedRevision: number): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("Invalid linked verification");
  return requestWithDeadline(`/api/user/linked-accounts/${id}/verify`, token, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision }),
  }, 65_000);
}

// 폴더 LIST도 외부 연결의 60초 제한을 사용합니다. 일반 GET 제한은 유지합니다.
export function tastemailLinkedFolders(id: string, token: string, expectedRevision: number): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || expectedRevision >= Number.MAX_SAFE_INTEGER) throw new Error("Invalid linked folders");
  return requestWithDeadline(`/api/user/linked-accounts/${id}/folders`, token, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision }),
  }, 65_000);
}

export function tastemailLinkedSync(id: string, token: string, input: { expectedRevision: number; folder: string }): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 || input.expectedRevision >= Number.MAX_SAFE_INTEGER || typeof input.folder !== "string" || !input.folder || new TextEncoder().encode(input.folder).length > 1024 || /\p{Cc}/u.test(input.folder)) throw new Error("Invalid linked sync");
  return requestWithDeadline(`/api/user/linked-accounts/${id}/sync`, token, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: input.expectedRevision, folder: input.folder }),
  }, 65_000);
}

// 전체 예약은 외부 LIST를 포함한다. 고정 경로에만 65초 예산을 허용한다.
export function tastemailLinkedQueueAll(id: string, token: string, expectedRevision: number): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || expectedRevision >= Number.MAX_SAFE_INTEGER) throw new Error("Invalid linked all queue");
  return requestWithDeadline(`/api/user/linked-accounts/${id}/sync/all`, token, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision }),
  }, 65_000);
}

// 영속 작업만 고정 POST 경로에 긴 예산을 사용합니다. 조회는 일반 GET 예산이며 자동 POST 재시도는 없습니다.
export function tastemailLinkedOperation(id: string, token: string, input: LinkedOperationInput): Promise<Response> {
  const parsed = linkedOperationRequest(id, input);
  if (!parsed) throw new Error("Invalid linked operation");
  return requestWithDeadline(`/api/user/linked-accounts/${id}/operations`, token, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed),
  }, 70_000);
}
export function tastemailLinkedOperationRecovery(id: string, token: string, operationId: string): Promise<Response> {
  if (!linkedOperationId(id) || !linkedOperationId(operationId)) throw new Error("Invalid linked operation recovery");
  return tastemailRequest(`/api/user/linked-accounts/${id}/operations/${operationId}`, token, { method: "GET" });
}

function requestWithDeadline(path: string, token: string | undefined, init: RequestInit, deadline: number): Promise<Response> {
  // WHATWG URL treats backslashes as slashes: /\\host could otherwise send
  // an authenticated request to another origin. Reject before constructing headers.
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\x00-\x20\x7f]/u.test(path)) throw new Error("Invalid TASTEMAIL API path");
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(`${apiOrigin()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "error",
    // Caller cancellation and its shorter deadline remain effective; even an
    // unbounded caller signal cannot disable the upstream deadline. Existing
    // MFA/folder/theme writes have explicit 15-second budgets, preserved here.
    signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(deadline)]) : AbortSignal.timeout(deadline),
  });
}

// Google 코드 교환 + IMAP 주소 검증의 서버 제한은 60초입니다.
// 범용 클라이언트 제한은 유지하고 이 고정 경로에만 65초를 허용합니다.
export function tastemailCompleteLinkedOAuth(id: string, token: string, input: { state: string; code: string }): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      !input || Object.keys(input).length !== 2 || typeof input.state !== "string" || !input.state || new TextEncoder().encode(input.state).length > 256 ||
      typeof input.code !== "string" || !input.code || new TextEncoder().encode(input.code).length > 4096 || /\p{Cc}/u.test(input.state + input.code)) throw new Error("Invalid linked OAuth callback");
  return requestWithDeadline(`/api/user/linked-accounts/${id}/oauth/callback`, token, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: input.state, code: input.code }),
  }, 65_000);
}

export function serviceStatus(status: number): "unauthorized" | "forbidden" | "rateLimited" | "retryable" | "unavailable" {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rateLimited";
  if (status === 408 || status === 425 || status >= 500) return "retryable";
  return "unavailable";
}

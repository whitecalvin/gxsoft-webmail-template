import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sameOrigin } from "./contact-route";
import { tastemailSessionToken } from "./session";
import { assertLiveApiConfigured } from "./server";
import { linkedOAuthCallback, linkedOAuthRedirect, linkedOAuthRevision } from "../linked-oauth";
import { LinkedAuthError } from "./linked-authentication";
import { startLinkedOAuth, completeLinkedOAuth } from "./linked-oauth";
import { LINKED_OAUTH_COOKIE, LINKED_OAUTH_LOCALE_COOKIE, LINKED_OAUTH_COOKIE_OPTIONS, LINKED_OAUTH_LOCALES, sealLinkedOAuthProof, openLinkedOAuthProof, linkedOAuthStateMatches } from "./linked-oauth-proof";
import { parseLinkedOAuthReturn } from "../linked-oauth-return";

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
function failure(e: unknown) {
  const status = e instanceof LinkedAuthError ? e.status : "mutation_uncertain", uncertain = !(e instanceof LinkedAuthError) || e.uncertain;
  return json({ status, uncertain }, status === "unauthorized" ? 401 : status === "forbidden" ? 403 : status === "invalid_request" || status === "insecure_connection" ? 400 : status === "not_found" ? 404 : ["conflict", "reauth_required"].includes(status) ? 409 : status === "rateLimited" ? 429 : 502);
}
async function context(request: Request) {
  if (request.method !== "POST" || !sameOrigin(request)) throw new LinkedAuthError("forbidden");
  const origin = request.headers.get("origin")!;
  try { linkedOAuthRedirect(origin); } catch { throw new LinkedAuthError("insecure_connection"); }
  try { assertLiveApiConfigured(); } catch { throw new LinkedAuthError("auth_unavailable"); }
  const token = await tastemailSessionToken();
  if (!token) throw new LinkedAuthError("unauthorized");
  return { origin, token, jar: await cookies() };
}
async function body(request: Request): Promise<unknown> {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error();
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 32768) throw new Error();
    return JSON.parse(raw);
  } catch { throw new LinkedAuthError("invalid_request"); }
}
export async function linkedOAuthStartRoute(request: Request, id: string) {
  try {
    const { origin, token, jar } = await context(request), value = await body(request);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new LinkedAuthError("invalid_request");
    const r = value as Record<string, unknown>, input = linkedOAuthRevision(id, { expectedRevision: r.expectedRevision });
    if (Object.keys(r).length !== 2 || !input || typeof r.locale !== "string" || !LINKED_OAUTH_LOCALES.some(l => l === r.locale)) throw new LinkedAuthError("invalid_request");
    const previous = jar.get(LINKED_OAUTH_COOKIE)?.value;
    if (previous && openLinkedOAuthProof(token, origin, previous)) throw new LinkedAuthError("conflict");
    const started = await startLinkedOAuth(token, id, input, origin);
    const proof = sealLinkedOAuthProof(token, origin, started.before, started.state, r.locale);
    const response = json({ authorizationUrl: started.authorizationUrl, expiresIn: started.expiresIn });
    response.cookies.set(LINKED_OAUTH_COOKIE, proof, LINKED_OAUTH_COOKIE_OPTIONS);
    // Google 복귀 GET에는 Strict 증명을 보내지 않습니다. 언어만 Lax로 전달합니다.
    response.cookies.set(LINKED_OAUTH_LOCALE_COOKIE, r.locale, { ...LINKED_OAUTH_COOKIE_OPTIONS, sameSite: "lax" });
    return response;
  } catch (e) { return failure(e); }
}
export async function linkedOAuthFinishRoute(request: Request) {
  let consume = false;
  try {
    const { origin, token, jar } = await context(request), input = linkedOAuthCallback(await body(request));
    if (!input) throw new LinkedAuthError("invalid_request");
    const encoded = jar.get(LINKED_OAUTH_COOKIE)?.value, proof = encoded ? openLinkedOAuthProof(token, origin, encoded) : null;
    if (!proof || !linkedOAuthStateMatches(proof, input.state)) throw new LinkedAuthError("conflict");
    consume = true;
    const account = await completeLinkedOAuth(token, proof.before, input);
    const response = json({ account, locale: proof.locale });
    response.cookies.set(LINKED_OAUTH_COOKIE, "", { ...LINKED_OAUTH_COOKIE_OPTIONS, maxAge: 0 });
    response.cookies.set(LINKED_OAUTH_LOCALE_COOKIE, "", { ...LINKED_OAUTH_COOKIE_OPTIONS, sameSite: "lax", maxAge: 0 });
    return response;
  } catch (e) {
    const response = failure(e);
    // 서버의 state는 한 번 소비됩니다. 미확정 결과도 코드를 재전송하지 않습니다.
    if (consume) response.cookies.set(LINKED_OAUTH_COOKIE, "", { ...LINKED_OAUTH_COOKIE_OPTIONS, maxAge: 0 });
    return response;
  }
}

export async function linkedOAuthCancelRoute(request: Request) {
  try {
    const { origin, token, jar } = await context(request), value = await body(request);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("state" in value) || typeof value.state !== "string") throw new LinkedAuthError("invalid_request");
    const encoded = jar.get(LINKED_OAUTH_COOKIE)?.value, proof = encoded ? openLinkedOAuthProof(token, origin, encoded) : null;
    if (!proof || !linkedOAuthStateMatches(proof, value.state)) throw new LinkedAuthError("conflict");
    const response = json({ cancelled: true, locale: proof.locale });
    response.cookies.set(LINKED_OAUTH_COOKIE, "", { ...LINKED_OAUTH_COOKIE_OPTIONS, maxAge: 0 });
    response.cookies.set(LINKED_OAUTH_LOCALE_COOKIE, "", { ...LINKED_OAUTH_COOKIE_OPTIONS, sameSite: "lax", maxAge: 0 });
    return response;
  } catch (e) { return failure(e); }
}

export async function linkedOAuthReturnRoute(request: Request) {
  let origin;
  try {
    const url = new URL(request.url), protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.slice(0, -1);
    origin = `${protocol}://${request.headers.get("host") ?? url.host}`;
    linkedOAuthRedirect(origin);
    if (request.method !== "GET") throw new Error();
  } catch { return json({ status: "insecure_connection", uncertain: false }, 400); }
  const localeCookie = (await cookies()).get(LINKED_OAUTH_LOCALE_COOKIE)?.value;
  const locale = LINKED_OAUTH_LOCALES.find(l => l === localeCookie) ?? "ko";
  const returned = parseLinkedOAuthReturn(new URL(request.url).searchParams);
  const fragment = returned ? new URLSearchParams("cancelled" in returned ? { state: returned.state, error: "denied" } : returned).toString() : "invalid=1";
  // fragment는 웹 서버/SSR 요청에 전달되지 않습니다. 도착 화면에서 즉시 제거합니다.
  // 이 GET은 세션 조회/코드 교환/쿠키 변경을 하지 않아 cross-site 복귀에도 안전합니다.
  return new NextResponse(null, { status: 303, headers: { Location: `${origin}/${locale}/oauth-return#${fragment}`, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}

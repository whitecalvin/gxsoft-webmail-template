import "server-only";
import { gmailOAuthCheck, gmailOAuthSaved, gmailOAuthSettings, gmailOAuthUpdate, gmailOAuthError } from "../admin-gmail-oauth";
import { tastemailRequest } from "./server";
export class GmailOAuthAdminError extends Error { constructor(public readonly status: string) { super(status); } }
const path = "/api/admin/linked-accounts/google-oauth";
async function call(token: string, method: "GET" | "PATCH" | "POST", body?: unknown) {
  let response: Response;
  try { response = await tastemailRequest(path + (method === "POST" ? "/check" : ""), token, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) }); }
  catch { throw new GmailOAuthAdminError(method === "PATCH" ? "mutationUncertain" : "unavailable"); }
  if (!response.ok) {
    const status = response.status;
    // 알려진 서버 코드만 반환하며 원문 오류·비밀키·상세 메시지는 브라우저에 전달하지 않는다.
    const raw = await response.json().catch(() => null);
    const known = gmailOAuthError(raw?.error);
    throw new GmailOAuthAdminError(status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 || status === 405 || status === 501 ? "unsupported" : status === 429 ? "rateLimited" : status === 409 ? "revision_conflict" : ["invalid_https_origin", "invalid_configuration", "secret_required", "encryption_unavailable", "settings_unavailable"].includes(known) ? known : method === "PATCH" ? "mutationUncertain" : "unavailable");
  }
  try { if (response.status !== 200) throw Error(); return await response.json(); }
  catch { throw new GmailOAuthAdminError(method === "PATCH" ? "mutationUncertain" : "unavailable"); }
}
export async function loadGmailOAuthSettings(token: string) { try { return gmailOAuthSettings(await call(token, "GET")); } catch (e) { if (e instanceof GmailOAuthAdminError) throw e; throw new GmailOAuthAdminError("unavailable"); } }
export async function saveGmailOAuthSettings(token: string, input: unknown) {
  let command; try { command = gmailOAuthUpdate(input); } catch { throw new GmailOAuthAdminError("invalid_configuration"); }
  try { return { revision: gmailOAuthSaved(await call(token, "PATCH", command), command.expectedRevision), saved: true }; }
  catch (e) { if (e instanceof GmailOAuthAdminError) throw e; throw new GmailOAuthAdminError("mutationUncertain"); }
}
export async function checkGmailOAuthSettings(token: string) { try { return gmailOAuthCheck(await call(token, "POST")); } catch (e) { if (e instanceof GmailOAuthAdminError) throw e; throw new GmailOAuthAdminError("unavailable"); } }

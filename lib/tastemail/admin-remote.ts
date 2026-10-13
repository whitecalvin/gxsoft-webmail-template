import "server-only";
import { adminRemoteSnapshot, adminRemoteReceipt, adminRemoteCommand } from "../admin-remote-contract";
import { serviceStatus, tastemailRequest } from "./server";
export class AdminRemoteError extends Error { constructor(public readonly status: string) { super(status); } }
async function unsupportedStatus(response: Response) {
  if (response.status !== 501) return "unsupported";
  try {
    const value = await response.json();
    return value?.code === "management_not_configured" ? "managementNotConfigured" : "unsupported";
  } catch { return "unsupported"; }
}
export async function loadAdminRemote(token: string) {
  const response = await tastemailRequest("/api/admin/management", token);
  if (!response.ok) throw new AdminRemoteError([404, 501].includes(response.status) ? await unsupportedStatus(response) : serviceStatus(response.status));
  try { return adminRemoteSnapshot(await response.json()); } catch { throw new AdminRemoteError("unavailable"); }
}
export async function loadAdminRemoteOperation(token: string, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AdminRemoteError("invalid_request");
  const response = await tastemailRequest(`/api/admin/management/operations/${id}`, token);
  if (!response.ok) throw new AdminRemoteError(response.status === 404 ? "notFound" : serviceStatus(response.status));
  try { return adminRemoteReceipt(await response.json(), id); } catch { throw new AdminRemoteError("unavailable"); }
}
export async function submitAdminRemote(token: string, input: unknown) {
  // 서버의 잠금 안에서 최신 개정·권한·멱등성을 함께 검증한다.
  // 사전 GET으로 중복 UUID의 기존 영수증 조회를 차단하지 않는다.
  const command = adminRemoteCommand(input);
  let response: Response;
  try { response = await tastemailRequest("/api/admin/management/operations", token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) }); }
  catch { throw new AdminRemoteError("mutationUncertain"); }
  if (!response.ok) throw new AdminRemoteError([404,501].includes(response.status) ? await unsupportedStatus(response) : response.status >= 500 || response.status === 408 ? "mutationUncertain" : response.status === 409 ? "conflict" : response.status === 400 ? "invalid_request" : serviceStatus(response.status));
  try { if (response.status !== 202) throw Error("Unexpected receipt"); return adminRemoteReceipt(await response.json()); } catch { throw new AdminRemoteError("mutationUncertain"); }
}

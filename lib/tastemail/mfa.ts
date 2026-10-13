import "server-only";
import { tastemailRequest, serviceStatus } from "./server";
import { activationReceipt, enrollmentReceipt, type mfaInput } from "./mfa-contract";

export class MfaServiceError extends Error {
  constructor(readonly status: string) { super(status); }
}
export async function changeLiveMfa(token: string, input: NonNullable<ReturnType<typeof mfaInput>>) {
  const begin = input.operation === "begin";
  const response = await tastemailRequest(`/api/user/security/mfa/totp/${begin ? "enrollments" : "activate"}`, token, {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify(input.operation === "begin" ? { currentPassword: input.currentPassword } : { enrollmentId: input.enrollmentId, code: input.code }),
  });
  const raw = await response.text();
  if (raw.length > 32_768) throw new MfaServiceError("unavailable");
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { payload = null; }
  if (response.status !== 200) {
    const type = payload && typeof payload === "object" && "type" in payload ? payload.type : null;
    if (!begin && response.status === 401 && type === "invalidMfaCode") throw new MfaServiceError("invalidCode");
    if (begin && response.status === 403 && payload && typeof payload === "object" && "detail" in payload && payload.detail === "current password is incorrect") {
      throw new MfaServiceError("passwordRejected");
    }
    if (response.status === 404) throw new MfaServiceError("expired");
    if (response.status === 409) throw new MfaServiceError("conflict");
    throw new MfaServiceError(serviceStatus(response.status));
  }
  try { return begin ? enrollmentReceipt(payload) : activationReceipt(payload); }
  catch { throw new MfaServiceError("unavailable"); }
}

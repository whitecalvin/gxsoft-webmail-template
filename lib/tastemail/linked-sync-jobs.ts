import "server-only";
import { linkedId, requireLinkedAccounts } from "../linked-accounts";
import { requireLinkedSyncJobs } from "../linked-sync-jobs";
import { LinkedAccountError, requestLinkedAccounts } from "./linked-accounts";
import { linkedSyncJson } from "./linked-sync";
import { tastemailRequest, serviceStatus } from "./server";

export async function requestLinkedSyncJobs(token: string, id: string, signal?: AbortSignal) {
  if (!linkedId(id)) throw new LinkedAccountError("invalid_request");
  try {
    const before = requireLinkedAccounts(await requestLinkedAccounts(token)).accounts.find(account => account.id === id);
    if (!before) throw new LinkedAccountError("not_found");
    // paused/reauthRequired 계정도 작업 목록을 볼 수 있습니다. 예약 POST는 호출하지 않습니다.
    const response = await tastemailRequest(`/api/user/linked-accounts/${id}/sync/jobs`, token, { method: "GET", signal });
    if ([401, 403, 429].includes(response.status)) {
      await response.body?.cancel();
      throw new LinkedAccountError(serviceStatus(response.status));
    }
    const body = await linkedSyncJson(response.body, 256 * 1024).catch(() => null);
    if (!response.ok) {
      const kind = body && typeof body === "object" && "type" in body ? body.type : null;
      throw new LinkedAccountError(response.status === 404 ? kind === "notFound" ? "not_found" : "not_deployed" : response.status === 400 ? "invalid_request" : response.status === 409 ? "conflict" : serviceStatus(response.status));
    }
    if (response.status !== 200) throw new Error("invalid job status");
    const jobs = requireLinkedSyncJobs(body, before);
    const after = requireLinkedAccounts(await requestLinkedAccounts(token)).accounts.find(account => account.id === id);
    if (!after || after.provider !== before.provider || after.email !== before.email || after.revision !== before.revision || after.credentialGeneration !== before.credentialGeneration) throw new LinkedAccountError("conflict");
    if (signal?.aborted) throw new Error("cancelled jobs");
    return jobs;
  } catch (error) { if (error instanceof LinkedAccountError) throw error; throw new LinkedAccountError("unavailable"); }
}

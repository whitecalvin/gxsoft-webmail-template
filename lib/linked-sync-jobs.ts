import { linkedId, type LinkedAccount } from "./linked-accounts";
import { linkedFolderLabel } from "./linked-folders";

export const LINKED_JOB_STATUSES = ["queued", "syncing", "synced", "retrying", "paused"] as const;
export const LINKED_JOB_ERRORS = ["reauthRequired", "remoteUnavailable", "syncLimit", "userPaused"] as const;
export type LinkedSyncJob = { folder: string; label: string; status: typeof LINKED_JOB_STATUSES[number]; attempts: number; lastError: typeof LINKED_JOB_ERRORS[number] | null; userPaused: boolean | null; controlRevision: number | null };
// revision/generation은 조회 당시 계정 범위이지 개별 작업의 완료 영수증이 아닙니다.
export type LinkedSyncJobs = { linkedAccountId: string; revision: number; credentialGeneration: number; jobs: LinkedSyncJob[] };
export function requireLinkedSyncJobs(value: unknown, before: LinkedAccount): LinkedSyncJobs {
  if (!linkedId(before.id) || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid jobs");
  const r = value as Record<string, unknown>;
  if (!Array.isArray(r.jobs) || r.jobs.length > 100) throw new Error("invalid jobs");
  const jobs = r.jobs.map((entry): LinkedSyncJob => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("invalid job");
    const job = entry as Record<string, unknown>;
    if (typeof job.folder !== "string" || !LINKED_JOB_STATUSES.includes(job.status as LinkedSyncJob["status"]) ||
        !Number.isSafeInteger(job.attempts) || Number(job.attempts) < 0 || Number(job.attempts) > 2_147_483_647 ||
        job.lastError !== null && !LINKED_JOB_ERRORS.includes(job.lastError as typeof LINKED_JOB_ERRORS[number])) throw new Error("invalid job");
    const legacy = job.userPaused === undefined && job.controlRevision === undefined || job.userPaused === null && job.controlRevision === null;
    if (!legacy && (typeof job.userPaused !== "boolean" || !Number.isSafeInteger(job.controlRevision) || Number(job.controlRevision) < 1 || job.userPaused && job.status !== "paused")) throw new Error("invalid job control");
    return { folder: job.folder, label: linkedFolderLabel(job.folder), status: job.status as LinkedSyncJob["status"], attempts: Number(job.attempts), lastError: job.lastError as LinkedSyncJob["lastError"], userPaused: legacy ? null : job.userPaused as boolean, controlRevision: legacy ? null : Number(job.controlRevision) };
  });
  if (new Set(jobs.map(job => job.folder)).size !== jobs.length) throw new Error("duplicate jobs");
  return { linkedAccountId: before.id, revision: before.revision, credentialGeneration: before.credentialGeneration, jobs };
}

export function linkedSyncJobsReceipt(value: unknown, before: LinkedAccount): LinkedSyncJobs {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid jobs scope");
  const r = value as Record<string, unknown>;
  if (r.linkedAccountId !== before.id || r.revision !== before.revision || r.credentialGeneration !== before.credentialGeneration) throw new Error("invalid jobs scope");
  const result = requireLinkedSyncJobs(value, before);
  if (!Array.isArray(r.jobs) || r.jobs.some((job, index) => !job || typeof job !== "object" || job.label !== result.jobs[index].label)) throw new Error("invalid job label");
  return result;
}

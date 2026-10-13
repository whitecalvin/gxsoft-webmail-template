import type { AdminSharedDetail, AdminSharedGrant } from "./tastemail/admin-shared-contract";

export type AdminSharedDraft = { detail: AdminSharedDetail; grants: AdminSharedGrant[] };
export type AdminSharedDrafts = Record<string, AdminSharedDraft>;

export function removeSharedDraft(drafts: AdminSharedDrafts, id: string): AdminSharedDrafts {
  if (!Object.hasOwn(drafts, id)) return drafts;
  const next = { ...drafts }; delete next[id]; return next;
}

export function retainSharedDraft(drafts: AdminSharedDrafts, detail: AdminSharedDetail | null, grants: AdminSharedGrant[]): AdminSharedDrafts {
  if (!detail) return drafts;
  const id = detail.mailbox.id;
  if (JSON.stringify(detail.grants) === JSON.stringify(grants)) return removeSharedDraft(drafts, id);
  // 권한과 원래 개정을 함께 유지합니다. 다른 편지함 저장으로 초안을 재기준화하지 않습니다.
  return { ...drafts, [id]: { detail, grants: grants.map(grant => ({ ...grant, rights: { ...grant.rights } })) } };
}

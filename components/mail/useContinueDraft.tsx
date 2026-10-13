"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useMail } from "@/context/mail-context";
import { useToast } from "@/context/toast-context";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { draftRequiresPlainTextConfirmation } from "@/lib/mail-draft";
import { requireLiveSearchDetail } from "@/lib/tastemail/search-page";
import { clientMailFailure } from "@/lib/tastemail/client-session-status";
import type { Email } from "@/types/mail";

export function useContinueDraft() {
  const { accountAddress, activeFolder, openCompose, pendingMutationIds, uncertainMutationIds } = useMail();
  const toast = useToast();
  const service = useTranslations("liveService");
  const reading = useTranslations("readingPane");
  const [confirmation, setConfirmation] = useState<{ email: Email; account: string; folder: typeof activeFolder } | null>(null);
  const request = useRef<AbortController | null>(null);
  const canResume = (email: Email) => Boolean(accountAddress?.trim()) && email.folder === "drafts"
    && email.from.email.trim().toLowerCase() === accountAddress?.trim().toLowerCase();
  useEffect(() => () => { request.current?.abort(); request.current = null; }, [accountAddress, activeFolder]);
  const edit = (email: Email, plain = false) => {
    if (!canResume(email)) return;
    openCompose({ fromAddress: email.from.email, to: email.to.join(", "), cc: (email.cc ?? []).join(", "), bcc: (email.bcc ?? []).join(", "),
      subject: email.subject, body: email.bodyText ?? email.body.join("\n\n"), htmlBody: plain ? null : email.htmlBody,
      inReplyTo: email.inReplyTo ?? [], references: email.references ?? [], previousDraftId: email.id,
      attachments: (email.attachments ?? []).map(({ blobId, name, type, size, disposition, cid }) => ({ blobId, name, type, size, disposition, cid })) });
  };
  const resume = async (email: Email) => {
    if (!accountAddress || !canResume(email) || request.current || pendingMutationIds.includes(email.id) || uncertainMutationIds.includes(email.id)) return;
    const controller = new AbortController();
    request.current = controller;
    try {
      // 목록의 미리보기로 작성하지 않는다. 검증된 전체 초안과 첨부를 먼저 조회한다.
      const response = await fetch(`/api/mail/messages/${encodeURIComponent(email.id)}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(clientMailFailure(response.status, payload));
      const full = requireLiveSearchDetail(payload, email.id);
      if (controller.signal.aborted) return;
      if (full.folder !== "drafts") throw new Error("unavailable");
      if (!canResume(full)) throw new Error("forbidden");
      if (full.htmlBody && draftRequiresPlainTextConfirmation(full.htmlBody, full.attachments)) setConfirmation({ email: full, account: accountAddress, folder: activeFolder });
      else edit(full);
    } catch (error) {
      if (!controller.signal.aborted) {
        const reason = error instanceof Error ? error.message : "retryable";
        toast.error(service(["unauthorized", "forbidden", "rateLimited", "retryable"].includes(reason) ? reason : "unavailable"));
      }
    } finally { if (request.current === controller) request.current = null; }
  };
  return { resume, canResume, confirmation: confirmation && canResume(confirmation.email) && confirmation.account === accountAddress && confirmation.folder === activeFolder ? <ConfirmDialog tone="warning" title={reading("editDraftAsTextTitle")} description={reading("editDraftAsTextDescription")}
    confirmLabel={reading("editDraft")} onCancel={() => setConfirmation(null)} onConfirm={() => { setConfirmation(null); if (confirmation.folder === activeFolder && confirmation.account === accountAddress) edit(confirmation.email, true); }} /> : null };
}

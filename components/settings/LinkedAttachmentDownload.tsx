"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { linkedAttachmentQuery, linkedAttachmentName } from "@/lib/linked-attachment";
import type { LinkedMailIdentity, LinkedAttachment } from "@/lib/linked-mail";
import { clientMailFailure } from "@/lib/tastemail/client-session-status";
export async function linkedAttachmentBlob(identity: LinkedMailIdentity, attachment: LinkedAttachment, signal: AbortSignal): Promise<Blob> {
  const query = new URLSearchParams({ folder: identity.folder, uidValidity: String(identity.uidValidity) });
  if (!Number.isInteger(attachment.index) || !linkedAttachmentQuery(identity.linkedAccountId, String(identity.uid), String(attachment.index), query) || !Number.isSafeInteger(attachment.size) || attachment.size < 0 || attachment.size > 25 * 1024 * 1024) throw new Error("invalid_request");
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(35_000)]);
  const response = await fetch(`/api/mail/linked-accounts/${identity.linkedAccountId}/messages/${identity.uid}/attachments/${attachment.index}?${query}`, { cache: "no-store", signal: requestSignal });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const status = body && typeof body === "object" && "status" in body ? body.status : null;
    throw new Error(["not_found", "not_deployed", "conflict", "auth_unavailable", "invalid_request"].includes(String(status)) ? String(status) : clientMailFailure(response.status, body));
  }
  if (response.status !== 200 || response.headers.get("content-type") !== "application/octet-stream" || response.headers.get("content-length") !== String(attachment.size)) { await response.body?.cancel(); throw new Error("unavailable"); }
  const reader = response.body?.getReader(); if (!reader) throw new Error("unavailable");
  const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  requestSignal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) { requestSignal.throwIfAborted(); const { done, value } = await reader.read(); requestSignal.throwIfAborted(); if (done) break; size += value.byteLength; if (size > attachment.size) throw new Error("unavailable"); chunks.push(new Uint8Array(value)); }
    requestSignal.throwIfAborted(); if (size !== attachment.size) throw new Error("unavailable");
    return new Blob(chunks, { type: "application/octet-stream" });
  } finally { requestSignal.removeEventListener("abort", cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function LinkedAttachmentDownload({ identity, attachment, disabled, failure }: { identity: LinkedMailIdentity; attachment: LinkedAttachment; disabled: boolean; failure: (status: string) => string }) {
  const t = useTranslations("linkedMail");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); }; }, []);
  const download = async () => {
    if (disabled || pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError(null);
    try {
      const blob = await linkedAttachmentBlob(identity, attachment, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = linkedAttachmentName(attachment.name, attachment.index);
      try { anchor.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (e) { if (mounted.current && !controller.signal.aborted) setError(e instanceof Error ? e.message : "unavailable"); }
    finally { pending.current = null; if (mounted.current) setBusy(false); }
  };
  return <div className="space-y-1">
    <div className="flex min-w-0 items-center gap-2"><span className="min-w-0 flex-1 break-all text-sm">{attachment.name} · {attachment.size} B</span>
      <Tooltip content={t("download")}><span className="inline-flex"><Button size="icon" variant="ghost" aria-label={`${t("download")}: ${attachment.name}`} disabled={disabled || busy} loading={busy} onClick={() => { void download(); }}><Download size={16} /></Button></span></Tooltip>
    </div>{error ? <p role="alert" className="text-xs text-(--status-danger)">{failure(error)}</p> : null}
  </div>;
}

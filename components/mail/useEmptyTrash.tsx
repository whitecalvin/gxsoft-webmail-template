"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useMail } from "@/context/mail-context";
import { useToast } from "@/context/toast-context";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { parseEmptyTrashReceipt } from "@/lib/empty-trash";

export function useEmptyTrash() {
  const t = useTranslations("emptyTrash"), service = useTranslations("liveService");
  const { accountAddress, mailboxes, refreshMailbox, pendingMutationIds, uncertainMutationIds } = useMail();
  const toast = useToast();
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const generation = useRef(0);
  useEffect(() => { generation.current += 1; return () => { generation.current += 1; }; }, [accountAddress]);
  const trash = mailboxes.find(item => item.role === "trash");
  const disabled = busy || uncertain || !accountAddress || !trash || trash.totalEmails === 0 || !!pendingMutationIds.length || !!uncertainMutationIds.length;
  async function execute() {
    if (disabled || pending.current || confirmation !== accountAddress) return;
    const started = generation.current;
    pending.current = true; setBusy(true);
    try {
      const response = await fetch("/api/mail/empty-trash", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true }), signal: AbortSignal.timeout(120_000) });
      if (generation.current !== started) return;
      if (!response.ok) {
        if (response.status >= 500) throw new Error("uncertain");
        toast.error(service(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rateLimited" : "unavailable"));
        return;
      }
      const receipt = parseEmptyTrashReceipt(await response.json());
      if (receipt.status === "uncertain") throw new Error("uncertain");
      if (receipt.status === "completed") toast.success(t("completed", { count: receipt.deleted }));
      else if (receipt.status === "partial") toast.warning(t("partial", { deleted: receipt.deleted, retained: receipt.retained }));
      else toast.error(t("failed"));
      refreshMailbox();
    } catch { if (generation.current === started) { setUncertain(true); toast.error(t("uncertain")); refreshMailbox(); } }
    finally { pending.current = false; if (generation.current === started) { setBusy(false); setConfirmation(null); } }
  }
  return { label: t("title"), disabled, open: () => { if (!disabled) setConfirmation(accountAddress); },
    dialog: confirmation && confirmation === accountAddress ? <ConfirmDialog tone="destructive" title={t("title")} description={t("confirm")}
      confirmLabel={t("title")} confirmDisabled={disabled} onConfirm={() => { void execute(); }} onCancel={() => { if (!pending.current) setConfirmation(null); }} /> : null };
}

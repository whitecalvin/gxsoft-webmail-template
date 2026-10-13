"use client";

import { useRef, useState, type Ref } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { useMail } from "@/context/mail-context";
import { useToast } from "@/context/toast-context";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { Tooltip } from "@/components/ui/Tooltip";

export function PersonalFolderDeleteButton({ mailboxId, buttonRef }: { mailboxId: string; buttonRef?: Ref<HTMLButtonElement> }) {
  const t = useTranslations("personalFolders");
  const live = useTranslations("liveService");
  const toast = useToast();
  const { mailboxes, changeFolder, folderChangePending, folderChangeUncertain } = useMail();
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false);
  const folder = mailboxes.find(item => item.id === mailboxId && item.role === null && item.name.toLowerCase() !== "inbox");
  if (!folder) return null;
  const blocked = folder.totalEmails > 0 || mailboxes.some(item => item.name.startsWith(`${folder.name}/`));
  const disabled = folderChangePending || folderChangeUncertain;
  async function remove() {
    if (disabled || inFlight.current || !folder) return;
    if (blocked) { toast.info(t("emptyOnly")); setConfirming(false); return; }
    inFlight.current = true;
    try {
      await changeFolder({ operation: "delete", mailboxId });
      setConfirming(false);
      toast.success(t("saved"));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "mutation_uncertain";
      toast.error(reason === "mutation_uncertain" ? t("uncertain")
        : ["conflict", "notFound", "not_found"].includes(reason) ? t("conflict")
        : ["unauthorized", "forbidden", "rateLimited"].includes(reason) ? live(reason) : live("unavailable"));
      setConfirming(false);
    } finally { inFlight.current = false; }
  }
  return <>
    <Tooltip content={blocked ? t("emptyOnly") : t("delete")} side="bottom" className="shrink-0">
      <button ref={buttonRef} type="button" disabled={disabled} aria-label={`${t("delete")}: ${folder.name}`}
        onClick={() => { if (blocked) toast.info(t("emptyOnly")); else setConfirming(true); }}
        className="flex size-9 items-center justify-center rounded-full text-(--text-muted) transition hover:bg-(--status-danger-bg) hover:text-(--status-danger) focus-visible:outline-2 focus-visible:outline-(--focus-ring) disabled:opacity-40">
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </Tooltip>
    {confirming ? <ConfirmDialog tone="destructive" title={t("confirm")} description={folder.name}
      confirmLabel={t("delete")} cancelLabel={t("cancel")}
      onCancel={() => { if (!inFlight.current) setConfirming(false); }} onConfirm={() => { void remove(); }} /> : null}
  </>;
}

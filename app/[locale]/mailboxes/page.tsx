"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import {
  MAIL_TEMPLATES,
  SCHEDULED_MAILS,
  SHARED_BOXES,
} from "@/lib/mock-mailboxes";
import { LoadingModal } from "@/components/overlay/LoadingModal";
import { useToast } from "@/context/toast-context";

// Shared/delegated mailboxes with scheduled-send and template utilities.
// the scheduled-send queue (with a simulated "send now" progress modal),
// and mail templates.
const STATE_TONE: Record<string, string> = {
  warning: "bg-(--status-warning-bg) text-(--status-warning)",
  info: "bg-(--color-primary)/10 text-(--color-primary-ink)",
  success: "bg-(--status-success-bg) text-(--status-success)",
};

export default function MailboxesPage() {
  const toast = useToast();
  const t = useTranslations("mailboxesPage");
  const tMock = useTranslations("mailboxesMock");
  const [mails, setMails] = useState(SCHEDULED_MAILS);
  const [sendingPct, setSendingPct] = useState<number | null>(null);

  useEffect(() => {
    if (sendingPct === null) return;
    if (sendingPct >= 100) {
      const timer = setTimeout(() => {
        setSendingPct(null);
        setMails((prev) => prev.slice(1));
        toast.success(t("sentNow"), { sub: mails[0]?.subject ?? "" });
      }, 250);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setSendingPct((p) => Math.min((p ?? 0) + 20, 100)), 180);
    return () => clearTimeout(timer);
  }, [mails, sendingPct, t, toast]);

  return (
    <WorkspaceLayout
      title={t("title")}
      headerActions={
        <>
          <button
            type="button"
            onClick={() => toast.info(t("permissionSent"))}
            className="h-11 rounded-lg border border-(--border-app) px-3.5 text-xs font-semibold lg:h-9"
          >
            {t("permissionRequest")}
          </button>
          <button
            type="button"
            onClick={() => toast.info(t("templateEditorPending"))}
            className="h-11 rounded-lg px-3.5 text-xs font-semibold text-white transition hover:brightness-110 lg:h-9"
            style={{ backgroundColor: "var(--color-primary-solid)" }}
          >
            {t("newTemplate")}
          </button>
        </>
      }
      className="overflow-y-auto bg-(--surface-muted)"
    >
      <section aria-label={t("title")} className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
        <p className="text-xs text-(--text-muted)">
          {t("summary", { mailboxes: SHARED_BOXES.length, scheduled: mails.length, templates: MAIL_TEMPLATES.length })}
        </p>

        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr_1fr]">
          <section aria-labelledby="shared-mailboxes-heading" className="rounded-xl border border-(--border-app) bg-background p-5">
            <h2 id="shared-mailboxes-heading" className="mb-3 text-sm font-bold">{t("sharedMailboxes")}</h2>
            <div className="flex flex-col gap-2">
              {SHARED_BOXES.map((b) => (
                <div key={b.addr} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--color-primary)/10 text-[10px] font-bold text-(--color-primary-ink)">
                    {tMock(`shared.${b.id}.initials`)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{tMock(`shared.${b.id}.name`)}</p>
                    <p className="truncate text-[10.5px] text-(--text-muted)">{b.addr}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold text-(--text-muted) dark:bg-white/10">
                    {tMock(`roles.${b.role}`)}
                  </span>
                  {b.unread > 0 && (
                    <span
                      className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                      style={{ backgroundColor: "var(--color-primary-solid)" }}
                    >
                      {b.unread}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-lg bg-(--color-primary)/6 px-3 py-2 text-[11px] text-(--text-muted)">
              {t("delegatedFormat", { delegate: tMock("delegateNote") })}
            </p>
          </section>

          <section aria-labelledby="scheduled-mail-heading" className="rounded-xl border border-(--border-app) bg-background p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 id="scheduled-mail-heading" className="text-sm font-bold">{t("scheduledMailbox")}</h2>
              <span className="ml-auto text-[11px] text-(--text-muted)">{t("waitingCount", { count: mails.length })}</span>
            </div>
            {mails.length === 0 ? (
              <p className="py-4 text-center text-xs text-(--text-muted)">{t("noScheduledMail")}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {mails.map((m) => (
                  <div key={m.id} className="border-b border-(--border-app) pb-2.5 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-(--text-muted)">{tMock(`scheduleWhen.${m.when}`)}</span>
                      <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold ${STATE_TONE[m.tone]}`}>
                        {tMock(`scheduleStatus.${m.status}`)}
                      </span>
                    </div>
                    <p className="truncate text-xs font-semibold">{m.subject}</p>
                    <p className="truncate text-[10.5px] text-(--text-muted)">{m.recipientCount === null ? m.recipient : t("recipientCount", { recipient: m.recipient, count: m.recipientCount })}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={mails.length === 0 || sendingPct !== null}
                onClick={() => setSendingPct(0)}
                aria-label={mails[0] ? `${t("sendNow")}: ${mails[0].subject}` : t("sendNow")}
                className="h-11 flex-1 rounded-lg text-xs font-semibold text-white disabled:opacity-40 lg:h-8"
                style={{ backgroundColor: "#17181B" }}
              >
                {t("sendNow")}
              </button>
              <button
                type="button"
                disabled={mails.length === 0}
                onClick={() => toast.info(t("scheduleChangePending"))}
                className="h-11 flex-1 rounded-lg border border-(--border-app) text-xs font-semibold disabled:opacity-40 lg:h-8"
              >
                {t("changeSchedule")}
              </button>
            </div>
          </section>

          <section aria-labelledby="mail-templates-heading" className="rounded-xl border border-(--border-app) bg-background p-5">
            <h2 id="mail-templates-heading" className="mb-3 text-sm font-bold">{t("templatesAndSnippets")}</h2>
            <div className="flex flex-col gap-2.5">
              {MAIL_TEMPLATES.map((template) => (
                <div key={template.id} className="border-b border-(--border-app) pb-2.5 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-semibold">{tMock(`templates.${template.id}`)}</p>
                    <span className="ml-auto shrink-0 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-(--text-muted) dark:bg-white/10">
                      {tMock(`templateScope.${template.scope}`)}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-(--text-muted)">
                    {t("usage", { count: template.uses, date: tMock(`templateEdited.${template.edited}`) })}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      {sendingPct !== null && (
        <LoadingModal title={t("sending")} sub={t("keepWindowOpen")} pct={sendingPct} />
      )}
    </WorkspaceLayout>
  );
}

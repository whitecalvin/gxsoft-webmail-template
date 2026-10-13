"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Switch } from "@/components/ui/Switch";
import { parseSimpleMailRule, simpleMailRuleSource, type SimpleMailRule } from "@/lib/simple-mail-rule";
import type { LiveMailbox } from "@/lib/tastemail/mail";
import { mailboxLabel } from "@/lib/mailbox-label";

export function MailRuleVisualEditor({ source, disabled = false, mailboxes = [], mailboxesReady = false, onChange }: { source: string; disabled?: boolean; mailboxes?: (Pick<LiveMailbox, "id" | "name"> & { role?: string | null })[]; mailboxesReady?: boolean; onChange: (source: string) => void }) {
  const t = useTranslations("ruleDesigner");
  const folders = useTranslations("sidebar");
  const rule = parseSimpleMailRule(source);
  if (!rule) return <p role="note" className="rounded-lg bg-(--surface-muted) p-3 text-sm text-(--text-muted)">{t("advancedNotice")}</p>;
  const update = (patch: Partial<SimpleMailRule>) => {
    const next = { ...rule, ...patch };
    if (next.action !== "move") delete next.mailbox;
    if (/[\x00-\x1f\x7f]/.test(next.sender + next.subject)) return;
    onChange(simpleMailRuleSource(next));
  };
  return <div className="space-y-5">
    <section aria-label={t("conditions")} className="space-y-3">
      <div><h3 className="text-sm font-semibold">{t("conditions")}</h3><p className="mt-1 text-xs text-(--text-muted)">{t("conditionsHelp")}</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={t("sender")} disabled={disabled} type="email" value={rule.sender} maxLength={254} autoComplete="off" onChange={event => update({ sender: event.target.value })} />
        <Input label={t("subject")} disabled={disabled} value={rule.subject} maxLength={998} onChange={event => update({ subject: event.target.value })} />
      </div>
      {!rule.sender && !rule.subject ? <p role="note" className="rounded-lg border border-(--status-warning)/30 bg-(--surface-muted) px-3 py-2 text-xs">{t("allMessages")}</p> : null}
    </section>
    <section aria-label={t("action")} className="space-y-3 border-t border-(--border-app) pt-4">
      <h3 className="text-sm font-semibold">{t("action")}</h3>
      <CustomSelect aria-label={t("action")} disabled={disabled} value={rule.action} onChange={event => {
        const action = event.target.value as SimpleMailRule["action"];
        if (action === "move") {
          if (!mailboxesReady || !mailboxes.length) return;
          update({ action, mailbox: mailboxes[0].name, stop: true });
        } else update({ action });
      }} className="app-control w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-sm">
        <option value="keep">{t("keep")}</option><option value="read">{t("read")}</option><option value="star">{t("star")}</option><option value="move" disabled={!mailboxesReady || !mailboxes.length}>{t("move")}</option>
      </CustomSelect>
      {rule.action === "move" ? <div className="space-y-2">
        <label className="grid gap-1.5 text-sm font-medium">{t("destination")}
          <CustomSelect aria-label={t("destination")} disabled={disabled || !mailboxesReady} value={rule.mailbox!} onChange={event => {
            if (mailboxesReady && mailboxes.some(mailbox => mailbox.name === event.target.value)) update({ mailbox: event.target.value });
          }} className="app-control w-full rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-sm font-normal">
            {!mailboxes.some(mailbox => mailbox.name === rule.mailbox) ? <option value={rule.mailbox} disabled>{rule.mailbox}</option> : null}
            {mailboxes.map(mailbox => <option key={mailbox.id} value={mailbox.name}>{mailboxLabel(mailbox.role ?? null, mailbox.name, folders)}</option>)}
          </CustomSelect>
        </label>
        <p className="text-xs leading-relaxed text-(--text-muted)">{t("moveHelp")}</p>
        {!mailboxesReady || !mailboxes.some(mailbox => mailbox.name === rule.mailbox) ? <p role="alert" className="text-xs text-(--status-warning)">{t("destinationUnavailable")}</p> : null}
      </div> : null}
      <div className="flex min-h-11 items-center justify-between gap-3"><span className="text-sm">{t("stop")}</span><Switch disabled={disabled} on={rule.stop} onToggle={() => update({ stop: !rule.stop })} label={t("stop")} /></div>
    </section>
  </div>;
}

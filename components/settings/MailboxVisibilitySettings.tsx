"use client";

import { useTranslations } from "next-intl";
import { useSettings } from "@/context/settings-context";
import { useMail } from "@/context/mail-context";
import { FOLDERS } from "@/lib/mail-folders";
import { SettingsPanel } from "./SettingsPrimitives";
import { GeneralSettingsStatus } from "./GeneralSettingsStatus";

export function MailboxVisibilitySettings() {
  const t = useTranslations("mailboxVisibility");
  const folders = useTranslations("sidebar");
  const live = useTranslations("liveService");
  const { draft, updateSection, hydrated, busy, uncertain } = useSettings();
  const { mailboxes, mailboxSummaryStatus, retryLoad } = useMail();
  const locked = !hydrated || busy || uncertain;
  const toggle = (field: "hiddenSystemMailboxes" | "hiddenMailboxIds", id: string, visible: boolean) => {
    const current = draft.inbox[field];
    updateSection("inbox", { [field]: visible ? current.filter(value => value !== id) : [...new Set([...current, id])].sort() });
  };
  const row = (field: "hiddenSystemMailboxes" | "hiddenMailboxIds", id: string, label: string) =>
    <label key={id} className="flex min-h-10 min-w-0 items-center gap-3 rounded-(--radius-app) px-2 hover:bg-(--surface-muted)">
      <input type="checkbox" checked={!draft.inbox[field].includes(id)} disabled={locked || (field === "hiddenMailboxIds" && !draft.inbox[field].includes(id) && draft.inbox.hiddenMailboxIds.length >= 200)} onChange={event => toggle(field, id, event.target.checked)} className="size-4 shrink-0 accent-(--color-primary)" />
      <span className="min-w-0 break-words text-sm">{label}</span>
    </label>;
  return <SettingsPanel title={t("title")} description={t("description")}>
    {!hydrated ? <GeneralSettingsStatus /> : null}
    <fieldset disabled={locked} className="grid gap-1 sm:grid-cols-2"><legend className="mb-2 text-xs font-semibold text-(--text-muted)">{t("system")}</legend>
      {FOLDERS.map(folder => row("hiddenSystemMailboxes", folder.id, folders(folder.id)))}
    </fieldset>
    <fieldset disabled={locked} className="grid gap-1 sm:grid-cols-2"><legend className="mb-2 text-xs font-semibold text-(--text-muted)">{t("personal")}</legend>
      {mailboxes.filter(mailbox => mailbox.role === null && mailbox.name.toLowerCase() !== "inbox").map(mailbox => row("hiddenMailboxIds", mailbox.id, mailbox.name))}
    </fieldset>
    {mailboxSummaryStatus !== "ready" ? <button type="button" onClick={() => { void retryLoad(); }} className="text-left text-sm text-(--color-primary-ink)">{live("retry")}</button> : null}
  </SettingsPanel>;
}

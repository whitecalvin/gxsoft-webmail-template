"use client";

import { ChevronDown } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useSettings } from "@/context/settings-context";
import type { Email } from "@/types/mail";

/** Only show metadata returned for this message; never infer hidden recipients. */
export function MailDeliveryDetails({ message }: { message: Pick<Email, "from" | "receivedAt"> & Partial<Pick<Email, "to" | "cc" | "bcc" | "replyTo">> }) {
  const t = useTranslations("readingPane");
  const formatter = useFormatter();
  const { saved } = useSettings();
  if (!saved.inbox.showDeliveryDetails) return null;
  const received = Number.isFinite(Date.parse(message.receivedAt))
    ? formatter.dateTime(new Date(message.receivedAt), { dateStyle: "full", timeStyle: "long", timeZone: saved.locale.timezone, hour12: saved.locale.timeFormat === "12" })
    : message.receivedAt;
  const rows = [
    { label: t("infoFrom"), value: message.from.name && message.from.name !== message.from.email ? `${message.from.name} <${message.from.email}>` : message.from.email },
    { label: t("infoTo"), value: message.to?.join(", ") || t("infoNoRecipients") },
    ...(message.cc?.length ? [{ label: t("infoCc"), value: message.cc.join(", ") }] : []),
    ...(message.bcc?.length ? [{ label: t("infoBcc"), value: message.bcc.join(", ") }] : []),
    ...(message.replyTo ? [{ label: t("infoReplyTo"), value: message.replyTo }] : []),
    { label: t("infoReceivedAt"), value: received },
  ];
  return <details className="group mt-1 min-w-0 text-xs">
    <summary className="inline-flex min-h-7 cursor-pointer list-none items-center gap-1 rounded px-1 text-(--color-primary-ink) hover:bg-(--surface-muted) focus-visible:outline-2 focus-visible:outline-(--focus-ring) [&::-webkit-details-marker]:hidden">
      {t("infoTitle")}<ChevronDown size={14} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
    </summary>
    <dl className="mt-2 grid min-w-0 grid-cols-1 gap-x-3 gap-y-1.5 rounded-(--radius-app) border border-(--border-app) bg-(--surface-muted) p-3 sm:grid-cols-[auto_minmax(0,1fr)]">
      {rows.map(({ label, value }) => <div key={label} className="contents">
        <dt className="font-medium text-(--text-muted)">{label}</dt>
        <dd className="min-w-0 whitespace-pre-wrap wrap-anywhere text-foreground">{value}</dd>
      </div>)}
    </dl>
  </details>;
}

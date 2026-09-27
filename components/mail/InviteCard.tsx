"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/context/toast-context";
import { useSettings } from "@/context/settings-context";
import type { MeetingInvite, RsvpChoice } from "@/types/mail";

// Calendar-invite summary shown inline when an email carries a
// MeetingInvite. RSVP state here is local to the card — accepting doesn't
// create a real calendar event.
const RSVP_OPTIONS: RsvpChoice[] = ["accept", "tentative", "decline"];

const RSVP_STYLE: Record<RsvpChoice, { bg: string; fg: string }> = {
  accept: { bg: "var(--status-success)", fg: "#fff" },
  tentative: { bg: "var(--status-warning)", fg: "#fff" },
  decline: { bg: "var(--status-danger)", fg: "#fff" },
};

export function InviteCard({ invite }: { invite: MeetingInvite }) {
  const t = useTranslations("meetingInvite");
  const locale = useLocale();
  const { saved } = useSettings();
  const toast = useToast();
  const [rsvp, setRsvp] = useState<RsvpChoice | null>(null);
  const start = new Date(invite.startsAt);
  const end = new Date(invite.endsAt);
  const { timezone, timeFormat } = saved.locale;
  const dateParts = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    weekday: "short",
  }).formatToParts(start);
  const datePart = (type: string) => dateParts.find((part) => part.type === type)?.value ?? "";
  const when = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: timeFormat === "12" ? "h12" : "h23",
    timeZoneName: "short",
  }).formatRange(start, end);

  const handleRsvp = (choice: RsvpChoice) => {
    setRsvp(choice);
    toast.success(t("responseRecorded", { choice: t(`states.${choice}`) }), { sub: when });
  };

  return (
    <div className="mb-6 rounded-2xl border border-[#C9D3FB] bg-[#F8FAFF] p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-(--color-primary-solid) py-2 text-white">
          <span className="text-[10px] font-bold uppercase">{datePart("month")}</span>
          <span className="text-xl font-bold leading-none">{datePart("day")}</span>
          <span className="text-[10px]">{datePart("weekday")}</span>
        </div>

        <div className="min-w-0 flex-1">
          <dl className="flex flex-col gap-1 text-xs">
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 text-(--text-muted)">{t("labels.dateTime")}</dt>
              <dd className="font-semibold">{when}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 text-(--text-muted)">{t("labels.location")}</dt>
              <dd>{invite.where}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 text-(--text-muted)">{t("labels.organizer")}</dt>
              <dd>{invite.organizer}</dd>
            </div>
            {invite.recurrence && (
              <div className="flex gap-2">
                <dt className="w-12 shrink-0 text-(--text-muted)">{t("labels.recurrence")}</dt>
                <dd>{invite.recurrence}</dd>
              </div>
            )}
          </dl>

          {invite.conflict && (
            <div className="mt-2.5 rounded-lg bg-[#FFF6E8] px-3 py-2 text-[11px] text-[#A9762A]">
              {t.rich("conflict", { event: invite.conflict, strong: (chunks) => <strong>{chunks}</strong> })}{" "}
              <button
                type="button"
                onClick={() => toast.info(t("viewEventNotice"), { sub: invite.conflict })}
                className="font-semibold underline"
              >
                {t("viewEvent")}
              </button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">{t("rsvpQuestion")}</span>
            <div className="flex gap-1.5">
              {RSVP_OPTIONS.map((choice) => {
                const isActive = rsvp === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => handleRsvp(choice)}
                    className="rounded-full px-3 py-1 text-xs font-semibold transition"
                    style={
                      isActive
                        ? { backgroundColor: RSVP_STYLE[choice].bg, color: RSVP_STYLE[choice].fg }
                        : { backgroundColor: "rgba(0,0,0,.04)", color: "var(--text-muted)" }
                    }
                  >
                    {t(`states.${choice}`)}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => toast.info(t("suggestTimeNotice"), { sub: invite.organizer })}
              className="ml-auto text-[11px] font-medium"
              style={{ color: "var(--color-primary-ink)" }}
            >
              {t("suggestTime")}
            </button>
            <button
              type="button"
              onClick={() => toast.info(t("leaveMemoNotice"))}
              className="text-[11px] font-medium"
              style={{ color: "var(--color-primary-ink)" }}
            >
              {t("leaveMemo")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

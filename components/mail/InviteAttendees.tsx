"use client";

import { useToast } from "@/context/toast-context";
import { useTranslations } from "next-intl";
import type { AttendeeResponse, MeetingInvite, RsvpChoice } from "@/types/mail";

// Sidebar shown next to a meeting-invite email: attendee response tally,
// per-person status, and an AI-generated meeting briefing.
const STATE_STYLE: Record<AttendeeResponse, { bg: string; fg: string }> = {
  accept: { bg: "var(--status-success-bg)", fg: "var(--status-success)" },
  tentative: { bg: "var(--status-warning-bg)", fg: "var(--status-warning)" },
  decline: { bg: "var(--status-danger-bg)", fg: "var(--status-danger)" },
  noResponse: { bg: "rgba(0,0,0,.06)", fg: "var(--text-muted)" },
};
const RESPONSES: RsvpChoice[] = ["accept", "tentative", "decline"];

export function InviteAttendees({ invite }: { invite: MeetingInvite }) {
  const t = useTranslations("meetingInvite");
  const toast = useToast();
  const tally = {
    accept: invite.attendees.filter((a) => a.state === "accept").length,
    tentative: invite.attendees.filter((a) => a.state === "tentative").length,
    decline: invite.attendees.filter((a) => a.state === "decline").length,
  };
  const responded = invite.attendees.length - invite.attendees.filter((a) => a.state === "noResponse").length;

  return (
    <aside className="hidden w-75 shrink-0 flex-col gap-4 overflow-y-auto border-l border-(--border-app) bg-[#FCFCFB] p-4 lg:flex">
      <div>
        <p className="text-xs font-bold">{t("attendeeStatus")}</p>
        <p className="mt-0.5 text-[11px] text-(--text-muted)">
          {t("attendeeSummary", { count: invite.attendees.length, responded })}
        </p>
        <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
          {RESPONSES.map((choice) => (
            <div key={choice} className="rounded-lg py-2" style={{ backgroundColor: STATE_STYLE[choice].bg }}>
              <p className="text-sm font-bold" style={{ color: STATE_STYLE[choice].fg }}>
                {tally[choice]}
              </p>
              <p className="text-[10px] text-(--text-muted)">{t(`states.${choice}`)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {invite.attendees.map((a) => (
          <div key={a.name} className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/5 text-[10px] font-bold dark:bg-white/10">
              {a.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="truncate text-[11.5px] font-semibold">{a.name}</p>
                {a.isHost && (
                  <span className="shrink-0 rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] font-bold text-(--text-muted) dark:bg-white/10">
                    {t("host")}
                  </span>
                )}
              </div>
              <p className="truncate text-[10.5px] text-(--text-muted)">{a.team}</p>
            </div>
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: STATE_STYLE[a.state].bg, color: STATE_STYLE[a.state].fg }}
            >
              {t(`states.${a.state}`)}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-(--border-app) bg-background p-3">
        <p className="text-xs font-bold">{t("briefing")}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-(--text-muted)">
          {t("briefingBody")}
        </p>
        <button
          type="button"
          onClick={() => toast.info(t("relatedMailNotice"), { sub: "GPU 노드 증설" })}
          className="mt-2 text-[11px] font-semibold"
          style={{ color: "var(--color-primary-ink)" }}
        >
          {t("viewRelatedMail")}
        </button>
      </div>
    </aside>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarPlus, Mail } from "lucide-react";
import { ORG_MEMBERS, ORG_TREE, PERSON_MAILS } from "@/lib/mock-contacts";
import { useToast } from "@/context/toast-context";

// Desktop org-chart drill-down: members of one team on the left, the
// selected person's profile/presence/recent-mail history on the right.
const PRESENCE_STYLE: Record<
  (typeof ORG_MEMBERS)[number]["presence"],
  { color: string }
> = {
  working: { color: "#2e8b5b" },
  away: { color: "#a9762a" },
  offline: { color: "#9a9ea5" },
};

export function OrgTeamView({ teamId }: { teamId: string }) {
  const toast = useToast();
  const t = useTranslations("contactsPage");
  const locale = useLocale();
  const dateFormatter = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const formatDate = (date: string) => dateFormatter.format(new Date(`${date}T12:00:00Z`));
  const team = ORG_TREE.find((n) => n.id === teamId);
  const members = useMemo(
    () => ORG_MEMBERS.filter((m) => m.teamId === teamId),
    [teamId]
  );
  const [selectedId, setSelectedId] = useState<string | null>(members[0]?.id ?? null);
  const selected = members.find((m) => m.id === selectedId) ?? members[0] ?? null;
  const parent = team ? ORG_TREE.find((n) => n.id === team.parentId) : null;

  return (
    <section aria-label={t("orgChart")} className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 overflow-y-auto border-r border-(--border-app) p-5">
        <div className="mb-4 flex flex-col gap-3 2xl:flex-row 2xl:items-center">
          <div>
            <h2 className="text-base font-bold tracking-tight">{team?.name}</h2>
            <p className="text-xs text-(--text-muted)">
              {t("teamSummary", { parent: parent?.name ?? "", team: team?.name ?? "", count: members.length })}
            </p>
          </div>
          <div className="flex gap-2 2xl:ml-auto">
            <button
              type="button"
              onClick={() => toast.info(t("openTeamCompose"), { sub: t("teamCount", { team: team?.name ?? "", count: members.length }) })}
              className="min-h-10 min-w-0 flex-1 whitespace-nowrap rounded-[9px] px-2 text-xs font-semibold text-white transition hover:brightness-110 2xl:flex-none 2xl:px-3"
              style={{ backgroundColor: "var(--color-primary-solid)" }}
            >
              {t("mailTeam")}
            </button>
            <button
              type="button"
              onClick={() => toast.success(t("vcardExported"), { sub: t("peopleCount", { count: members.length }) })}
              className="min-h-10 min-w-0 flex-1 whitespace-nowrap rounded-[9px] border border-(--border-app) px-2 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10 2xl:flex-none 2xl:px-3"
            >
              {t("exportVcard")}
            </button>
          </div>
        </div>

        {members.length === 0 && (
          <p className="mt-10 text-center text-sm text-(--text-muted)">
            {t("teamEmpty")}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">
          {members.map((m) => {
            const isSelected = m.id === selected?.id;
            const presence = PRESENCE_STYLE[m.presence];
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                className="flex flex-col items-start gap-2 rounded-[11px] border p-3.5 text-left transition"
                style={{
                  borderColor: isSelected ? "var(--color-primary)" : "var(--border-app)",
                }}
              >
                <div className="flex w-full items-center gap-2">
                  <span
                    className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{ backgroundColor: m.bg, color: m.fg }}
                  >
                    {m.initials}
                  </span>
                  <span
                    className="ml-auto h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: presence.color }}
                  />
                </div>
                <p className="truncate text-[13px] font-semibold">{m.name}</p>
                <p className="w-full truncate text-[11px] text-(--text-muted)">
                  {m.title}
                </p>
                <p className="w-full truncate text-[11px] text-(--text-muted)/80">
                  {m.email}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-y-auto bg-(--surface-muted) p-5">
        {!selected ? (
          <p className="mt-10 text-center text-sm text-(--text-muted)">
            {t("selectMember")}
          </p>
        ) : (
          <>
            <div className="flex flex-col items-center text-center">
              <span
                className="flex h-19 w-19 items-center justify-center rounded-full text-2xl font-bold"
                style={{ backgroundColor: selected.bg, color: selected.fg }}
              >
                {selected.initials}
              </span>
              <p className="mt-3 text-[17px] font-bold">{selected.name}</p>
              <p className="text-xs text-(--text-muted)">{selected.title}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: PRESENCE_STYLE[selected.presence].color }}>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: PRESENCE_STYLE[selected.presence].color }}
                />
                {t(`presence.${selected.presence}`)}
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => toast.info(t("openCompose"), { sub: selected.email })}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] text-xs font-semibold text-white transition hover:brightness-110"
                style={{ backgroundColor: "var(--color-primary-solid)" }}
              >
                <Mail size={13} />
                {t("composeMail")}
              </button>
              <button
                type="button"
                onClick={() => toast.info(t("openSchedule"), { sub: selected.name })}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-(--border-app) bg-background text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
              >
                <CalendarPlus size={13} />
                {t("scheduleMeeting")}
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              {(
                [
                  ["email", selected.email],
                  ["workPhone", selected.phone],
                  ["mobile", selected.mobile],
                  ["organization", team?.name ?? ""],
                  ["joined", formatDate(selected.joined)],
                  ["approvalLine", t(`approvalLines.${selected.approvalLine}`)],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center gap-2 rounded-[9px] border border-(--border-app) bg-background px-3 py-2"
                >
                  <span className="w-14 shrink-0 text-[11px] text-(--text-muted)">
                    {t(`profile.${label}`)}
                  </span>
                  <span className="truncate text-xs font-medium">{value}</span>
                </div>
              ))}
            </div>

            <p className="mb-2 mt-5 text-xs font-bold text-(--text-muted)">
              {t("recentMail")}
            </p>
            <div className="flex flex-col gap-1.5">
              {(PERSON_MAILS[selected.id] ?? []).length === 0 && (
                <p className="text-xs text-(--text-muted)">{t("noHistory")}</p>
              )}
              {(PERSON_MAILS[selected.id] ?? []).map((pm) => (
                <div
                  key={pm.subject}
                  className="flex items-center gap-2 rounded-[9px] border border-(--border-app) bg-background px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                    {pm.subject}
                  </span>
                  <span className="shrink-0 text-[11px] text-(--text-muted)">
                    {formatDate(pm.date)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

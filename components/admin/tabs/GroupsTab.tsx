"use client";

// Admin Console > Groups & Mailing Lists tab: distribution lists, security
// groups, and shared mailboxes, plus a moderation queue for gated sends.
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { GROUPS, MODERATION_QUEUE } from "@/lib/mock-admin";
import { AdminCard, Pill } from "../primitives";
import { useToast } from "@/context/toast-context";
import type { Tone } from "@/types/admin";

const TYPE_TONE: Record<string, Tone> = {
  distribution: "info",
  security: "violet",
  shared: "success",
};

const EXT_TONE: Record<string, Tone> = { allowed: "success", blocked: "neutral" };
const MOD_TONE: Record<string, Tone> = { required: "warning", autoReply: "teal", none: "neutral" };

export function GroupsTab() {
  const t = useTranslations("adminGroups");
  const locale = useLocale();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState(GROUPS);
  const [queue, setQueue] = useState(MODERATION_QUEUE);

  const numberFormatter = new Intl.NumberFormat(locale);
  const relativeFormatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const groupName = (group: (typeof GROUPS)[number]) => group.addr === "new-group@gxsoft.co.kr" ? t("newGroupName") : group.name;
  const filteredGroups = groups.filter((g) => {
    const q = query.trim().toLowerCase();
    return !q || g.addr.toLowerCase().includes(q) || groupName(g).toLowerCase().includes(q);
  });

  const createGroup = () => {
    setGroups((prev) => [
      { addr: "new-group@gxsoft.co.kr", name: "", type: "distribution", owner: "currentUser", members: 1, ext: "blocked", mod: "none" },
      ...prev,
    ]);
    toast.success(t("created"), { sub: "new-group@gxsoft.co.kr" });
  };

  const decideModeration = (subject: string, approve: boolean) => {
    setQueue((prev) => prev.filter((m) => m.subject !== subject));
    toast.success(approve ? t("approved") : t("rejected"), { sub: subject });
  };

  return (
    <div className="grid flex-1 grid-cols-[1fr_340px] gap-4 overflow-y-auto p-7">
      <AdminCard>
        <div className="mb-3 flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-(--text-muted)" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-8 w-64 rounded-lg bg-black/4 pl-7 pr-2.5 text-xs outline-none dark:bg-white/6"
            />
          </div>
          <span className="ml-auto text-xs text-(--text-muted)">
            {t("summary", { groups: groups.filter((g) => g.type !== "shared").length, lists: groups.filter((g) => g.type === "distribution").length })}
          </span>
        </div>
        <div className="overflow-hidden rounded-lg border border-(--border-app)">
          <div className="grid grid-cols-[2fr_1.4fr_70px_1fr_100px] gap-2 border-b border-(--border-app) bg-black/2 px-3 py-2 text-[10.5px] font-bold uppercase tracking-[.03em] text-(--text-muted) dark:bg-white/3">
            <span>{t("columns.address")}</span>
            <span>{t("columns.typeOwner")}</span>
            <span>{t("columns.members")}</span>
            <span>{t("columns.externalSenders")}</span>
            <span>{t("columns.moderation")}</span>
          </div>
          {filteredGroups.length === 0 && (
            <p className="p-6 text-center text-xs text-(--text-muted)">{t("noResults")}</p>
          )}
          {filteredGroups.map((g) => (
            <div
              key={g.addr}
              className="grid grid-cols-[2fr_1.4fr_70px_1fr_100px] items-center gap-2 border-b border-(--border-app) px-3 py-2.5 text-xs last:border-b-0 hover:bg-black/1.5 dark:hover:bg-white/2"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px] font-semibold">{g.addr}</p>
                <p className="truncate text-[10.5px] text-(--text-muted)">{groupName(g)}</p>
              </div>
              <div className="min-w-0">
                <Pill label={t(`types.${g.type}`)} tone={TYPE_TONE[g.type]} />
                <p className="mt-0.5 truncate text-[10.5px] text-(--text-muted)">{g.owner === "currentUser" ? t("currentUser") : g.owner}</p>
              </div>
              <span>{numberFormatter.format(g.members)}</span>
              <span>
                <Pill label={t(`external.${g.ext}`)} tone={EXT_TONE[g.ext]} />
              </span>
              <span>
                <Pill label={t(`moderation.${g.mod}`)} tone={MOD_TONE[g.mod]} />
              </span>
            </div>
          ))}
        </div>
      </AdminCard>

      <div className="flex flex-col gap-4">
        <AdminCard title={t("createTitle")}>
          <div className="flex flex-col gap-2.5">
            {[
              { id: "address", label: t("fields.address"), value: "new-group@gxsoft.co.kr" },
              { id: "type", label: t("fields.type"), value: t("types.distribution") },
              { id: "addMembers", label: t("fields.addMembers"), value: t("nameOrEmail") },
              { id: "externalSenders", label: t("fields.externalSenders"), value: t("external.blocked") },
            ].map((f) => (
              <div key={f.id} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-(--text-muted)">{f.label}</span>
                <div className="flex h-9 items-center rounded-lg border border-(--border-app) px-2.5 text-xs text-(--text-muted)">
                  {f.value}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={createGroup}
              className="mt-1 h-9 rounded-lg text-xs font-semibold text-white transition hover:brightness-110"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {t("create")}
            </button>
          </div>
        </AdminCard>

        <AdminCard title={t("pendingModeration")}>
          {queue.length === 0 ? (
            <p className="text-xs text-(--text-muted)">{t("noPending")}</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {queue.map((m) => (
                <div key={m.subject} className="rounded-lg border border-(--border-app) p-2.5">
                  <p className="truncate text-xs font-semibold">{m.subject}</p>
                  <p className="mt-0.5 truncate text-[10.5px] text-(--text-muted)">{t("queueMeta", { mailbox: m.mailbox, age: relativeFormatter.format(m.ageMinutes >= 60 ? -m.ageMinutes / 60 : -m.ageMinutes, m.ageMinutes >= 60 ? "hour" : "minute"), sender: m.sender })}</p>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => decideModeration(m.subject, true)}
                      className="h-7 flex-1 rounded-md text-[11px] font-semibold text-white"
                      style={{ backgroundColor: "var(--color-primary)" }}
                    >
                      {t("approve")}
                    </button>
                    <button
                      type="button"
                      onClick={() => decideModeration(m.subject, false)}
                      className="h-7 flex-1 rounded-md border border-(--border-app) text-[11px] font-semibold"
                    >
                      {t("reject")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
      </div>
    </div>
  );
}

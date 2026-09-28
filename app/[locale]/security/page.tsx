"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import {
  AUTH_METHODS,
  MFA_METHODS,
  SECURITY_EVENTS,
  SESSIONS,
} from "@/lib/mock-security-personal";
import { CURRENT_USER } from "@/lib/current-user";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { SettingsHeaderTitle } from "@/components/settings/SettingsHeaderTitle";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { useToast } from "@/context/toast-context";
import { useMail } from "@/context/mail-context";
import { LiveSecurity } from "@/components/settings/LiveSecurity";

// "계정 보안" settings page: 2FA/password status, MFA methods, signed-in
// sessions (with revoke), and a personal security event log.
const TONE_PILL: Record<string, string> = {
  success: "bg-(--status-success-bg) text-(--status-success)",
  warning: "bg-(--status-warning-bg) text-(--status-warning)",
  danger: "bg-(--status-danger-bg) text-(--status-danger)",
  info: "bg-(--color-primary)/10 text-(--color-primary-ink)",
  neutral: "bg-black/6 text-(--text-muted) dark:bg-white/8",
};

const EVENT_DOT: Record<string, string> = {
  success: "#2E8B5B",
  warning: "#B4740F",
  danger: "#C0433B",
};

type ConfirmKind = "reissue" | "logout-all" | null;

export default function SecurityPage() {
  const { mode } = useMail();
  return mode === "live" ? <LiveSecurity /> : <MockSecurityPage />;
}

function MockSecurityPage() {
  const toast = useToast();
  const locale = useLocale();
  const t = useTranslations("securityPage");
  const enrolledDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date("2025-03-11T12:00:00Z"));
  const [sessions, setSessions] = useState(SESSIONS);
  const [unusedCodes, setUnusedCodes] = useState(7);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);

  const revokeSession = (id: (typeof SESSIONS)[number]["id"], device: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    toast.success(t("sessionRevoked"), { sub: device });
  };

  return (
    <WorkspaceLayout title={<SettingsHeaderTitle title={t("title")} />} titleAsHeading={false} headerActions={<span className="rounded-full bg-(--status-warning-bg) px-3 py-1.5 text-xs font-bold text-(--status-warning)">{t("scoreSummary", { score: 72, total: 100, count: 3 })}</span>} showGlobalSearch={false} className="flex flex-col bg-(--surface-muted) lg:flex-row">
      <SettingsNav active="security" />
      <section aria-label={t("title")} className="min-h-0 w-full flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-5 sm:p-8">
        <h1 className="sr-only">{t("title")}</h1>
        <p className="text-xs text-(--text-muted)">{CURRENT_USER.name} · {CURRENT_USER.email} · {t("passwordAge", { days: 132 })}</p>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <div className="rounded-xl border border-(--border-app) bg-background p-5">
              <h2 className="mb-3 text-sm font-bold">{t("mfaHeading")}</h2>
              <div className="flex flex-col gap-3">
                {MFA_METHODS.map((m) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-semibold">{t(`mfaNames.${m.id}`)}</p>
                        {m.badge && (
                          <span className="shrink-0 rounded-full bg-(--color-primary)/10 px-1.5 py-0.5 text-[9.5px] font-bold text-(--color-primary-ink)">
                            {t(`badges.${m.badge}`)}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-(--text-muted)">{t(`mfaDescriptions.${m.id}`, { detail: m.detail ?? "", date: enrolledDate })}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_PILL[m.tone]}`}>
                      {t(`states.${m.state}`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toast.info(t("openAction", { method: t(`mfaNames.${m.id}`), action: t(`actions.${m.action}`) }))}
                      className="shrink-0 text-[11px] font-semibold"
                      style={{ color: "var(--color-primary-ink)" }}
                    >
                      {t(`actions.${m.action}`)}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-(--color-primary)/6 px-3 py-2 text-[11px] text-(--text-muted)">
                {t("backupCodeNote", { total: 10, unused: unusedCodes })}{" "}
                <button
                  type="button"
                  onClick={() => setConfirmKind("reissue")}
                  className="font-semibold"
                  style={{ color: "var(--color-primary-ink)" }}
                >
                  {t("actions.reissue")}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-(--border-app) bg-background p-5">
              <h2 className="mb-3 text-sm font-bold">{t("passwordSsoHeading")}</h2>
              <div className="flex flex-col gap-3">
                {AUTH_METHODS.map((m) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{t(`authNames.${m.id}`)}</p>
                      <p className="truncate text-[11px] text-(--text-muted)">{t(`authDescriptions.${m.id}`, { age: 132, cycle: 180, count: 2 })}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_PILL[m.tone]}`}>
                      {t(`states.${m.state}`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toast.info(t("openAction", { method: t(`authNames.${m.id}`), action: t(`actions.${m.action}`) }))}
                      className="shrink-0 text-[11px] font-semibold"
                      style={{ color: "var(--color-primary-ink)" }}
                    >
                      {t(`actions.${m.action}`)}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-[#F0DAD6] bg-[#FFFBFA] px-3 py-2 text-[11px] text-[#8E3B33]">
                {t("appPasswordNotice", { count: 2 })}{" "}
                <button
                  type="button"
                  onClick={() => toast.info(t("openAction", { method: t("authNames.appPassword"), action: t("actions.manage") }))}
                  className="font-bold underline"
                >
                  {t("actions.view")}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-(--border-app) bg-background p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-bold">{t("sessionsHeading")}</h2>
              <button
                type="button"
                onClick={() => setConfirmKind("logout-all")}
                className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-[#C0433B]"
              >
                <LogOut size={12} />
                {t("logoutAll")}
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                  style={{
                    borderColor: s.highlighted ? "#F0DAD6" : "var(--border-app)",
                    backgroundColor: s.highlighted ? "#FFFBFA" : "transparent",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{s.device}</p>
                    <p className="truncate text-[11px] text-(--text-muted)">{t(`sessions.${s.id}.meta`, { ip: s.ip ?? "" })}</p>
                  </div>
                  {s.badge && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_PILL[s.badgeTone ?? "neutral"]}`}>
                      {t(`badges.${s.badge}`)}
                    </span>
                  )}
                  <span className="shrink-0 text-[11px] text-(--text-muted)">{t(`sessions.${s.id}.when`)}</span>
                  {s.badge !== "currentDevice" ? (
                    <button
                      type="button"
                      onClick={() => revokeSession(s.id, s.device)}
                      className="shrink-0 text-[11px] font-semibold text-[#C0433B]"
                    >
                      {t("logout")}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <h3 className="mb-2 mt-4 text-xs font-bold text-(--text-muted)">{t("recentActivity")}</h3>
            <div className="flex flex-col gap-1.5">
              {SECURITY_EVENTS.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-xs">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: EVENT_DOT[e.tone] }} />
                  <span className="min-w-0 flex-1 truncate">{t(`events.${e.id}`)}</span>
                  <span className="shrink-0 text-(--text-muted)">{t(`when.${e.when}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </section>

      {confirmKind === "reissue" && (
        <ConfirmDialog
          tone="warning"
          title={t("reissueTitle")}
          description={t("reissueDescription", { count: 10 })}
          confirmLabel={t("actions.reissue")}
          onCancel={() => setConfirmKind(null)}
          onConfirm={() => {
            setConfirmKind(null);
            setUnusedCodes(10);
            toast.success(t("reissueSuccess"), { sub: t("reissueSuccessDetail", { count: 10 }) });
          }}
        />
      )}

      {confirmKind === "logout-all" && (
        <ConfirmDialog
          tone="destructive"
          title={t("logoutAllTitle")}
          description={t("logoutAllDescription")}
          confirmLabel={t("logoutAll")}
          onCancel={() => setConfirmKind(null)}
          onConfirm={() => {
            setConfirmKind(null);
            setSessions((prev) => prev.filter((s) => s.badge === "currentDevice"));
            toast.success(t("logoutAllSuccess"));
          }}
        />
      )}
    </WorkspaceLayout>
  );
}

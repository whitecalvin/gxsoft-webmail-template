"use client";

// Admin Console > Users tab: searchable/filterable account table with
// per-row and bulk actions (suspend, delete). All state is local/in-memory —
// there is no backend, so refreshing the page resets it to ADMIN_USERS.
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MoreHorizontal, Search } from "lucide-react";
import { ADMIN_USERS } from "@/lib/mock-admin";
import { AdminCard, ProgressBar } from "../primitives";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/context/toast-context";

type AdminUser = (typeof ADMIN_USERS)[number];

// Keep filter values independent of their translated labels.
const DEPT_IDS = Array.from(new Set(ADMIN_USERS.map((u) => u.deptId)));
const ROLE_IDS = Array.from(new Set(ADMIN_USERS.map((u) => u.role)));
const STATUS_IDS = Array.from(new Set(ADMIN_USERS.map((u) => u.status)));

const ROLE_STYLE: Record<string, string> = {
  superAdmin: "bg-[#FBEAE8] text-[#C0433B]",
  departmentAdmin: "bg-[#ECEFFE] text-[#2B4BF2]",
  auditor: "bg-[#EDEBF7] text-[#6B5CA8]",
  api: "bg-[#F0F0EC] text-[#5C6068]",
  member: "bg-[#F7F7F5] text-[#6B6F77]",
};

const STATUS_STYLE: Record<string, string> = {
  active: "bg-[#E9F3EC] text-[#2E8B5B]",
  overQuota: "bg-[#FDF0E4] text-[#B4740F]",
  suspended: "bg-[#F0F0EC] text-[#8E9299]",
};

export function UsersTab() {
  const t = useTranslations("adminUsers");
  const locale = useLocale();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState(ADMIN_USERS);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [deptFilter, setDeptFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const quotaLabel = (user: AdminUser) => t("quotaValue", { used: number.format(user.quotaUsedGb), limit: number.format(user.quotaLimitGb) });
  const lastSeenLabel = (minutes: number) => minutes === 0
    ? t("justNow")
    : minutes >= 1440
      ? relative.format(-Math.round(minutes / 1440), "day")
      : minutes >= 60
        ? relative.format(-Math.round(minutes / 60), "hour")
        : relative.format(-minutes, "minute");
  const deptOptions = [{ value: "all", label: t("allDepartments") }, ...DEPT_IDS.map((id) => ({ value: id, label: t(`departments.${id}`) }))];
  const roleOptions = [{ value: "all", label: t("allRoles") }, ...ROLE_IDS.map((id) => ({ value: id, label: t(`roles.${id}`) }))];
  const statusOptions = [{ value: "all", label: t("allStatuses") }, ...STATUS_IDS.map((id) => ({ value: id, label: t(`statuses.${id}`) }))];

  const filtered = users.filter(
    (u) =>
      (!query || u.name.includes(query) || u.email.toLowerCase().includes(query.toLowerCase()) || t(`departments.${u.deptId}`).toLowerCase().includes(query.toLowerCase())) &&
      (deptFilter === "all" || u.deptId === deptFilter) &&
      (roleFilter === "all" || u.role === roleFilter) &&
      (statusFilter === "all" || u.status === statusFilter)
  );

  const toggleSuspend = (u: AdminUser) => {
    const suspending = u.status !== "suspended";
    setUsers((prev) =>
      prev.map((row) => (row.email === u.email ? { ...row, status: suspending ? "suspended" : "active" } : row))
    );
    setMenuFor(null);
    toast.success(t(suspending ? "suspendedToast" : "resumedToast"), { sub: u.name });
  };

  const toggleSelect = (email: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

  // "Select all" only ever applies to the currently filtered rows, not the
  // full roster, so selections outside the active filter are preserved.
  const allFilteredSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.email));
  const toggleSelectAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((u) => next.delete(u.email));
      else filtered.forEach((u) => next.add(u.email));
      return next;
    });

  const bulkSuspend = () => {
    setUsers((prev) => prev.map((row) => (selected.has(row.email) ? { ...row, status: "suspended" } : row)));
    toast.success(t("bulkSuspendedToast", { count: selected.size }));
    setSelected(new Set());
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-7">
      <AdminCard className="flex flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-(--text-muted)" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-8 w-70 rounded-lg bg-black/4 pl-7 pr-2.5 text-xs outline-none dark:bg-white/6"
            />
          </div>
          <Dropdown value={deptFilter} label={t("departmentFilter")} options={deptOptions} onChange={setDeptFilter} />
          <Dropdown value={roleFilter} label={t("roleFilter")} options={roleOptions} onChange={setRoleFilter} />
          <Dropdown value={statusFilter} label={t("statusFilter")} options={statusOptions} onChange={setStatusFilter} />
          {selected.size > 0 ? (
            // Bulk-action bar replaces the summary text while a selection is active.
            <span className="ml-auto flex items-center gap-2 text-xs">
              <strong className="text-foreground">{t("selectedCount", { count: selected.size })}</strong>
              <button
                type="button"
                onClick={bulkSuspend}
                className="h-7 rounded-lg border border-(--border-app) px-2.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
              >
                {t("bulkSuspend")}
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="h-7 rounded-lg px-2.5 text-xs font-semibold text-(--text-muted) hover:bg-black/5 dark:hover:bg-white/10"
              >
                {t("clearSelection")}
              </button>
            </span>
          ) : (
            <span className="ml-auto text-xs text-(--text-muted)">
              {t("summary", { total: filtered.length, suspended: filtered.filter((u) => u.status === "suspended").length })}
            </span>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-(--border-app)">
          <div className="grid grid-cols-[28px_2.2fr_1.3fr_1fr_1.1fr_1fr_90px_28px] gap-2 border-b border-(--border-app) bg-black/2 px-3 py-2 text-[10.5px] font-bold uppercase tracking-[.03em] text-(--text-muted) dark:bg-white/3">
            <Checkbox checked={allFilteredSelected} onChange={toggleSelectAll} label={t("selectAll")} />
            <span>{t("columns.user")}</span>
            <span>{t("columns.department")}</span>
            <span>{t("columns.role")}</span>
            <span>{t("columns.quota")}</span>
            <span>{t("columns.lastSeen")}</span>
            <span>{t("columns.status")}</span>
            <span />
          </div>
          {filtered.map((u) => (
            <div
              key={u.email}
              className="group relative grid grid-cols-[28px_2.2fr_1.3fr_1fr_1.1fr_1fr_90px_28px] items-center gap-2 border-b border-(--border-app) px-3 py-2.5 text-xs last:border-b-0 hover:bg-black/1.5 dark:hover:bg-white/2"
            >
              <Checkbox checked={selected.has(u.email)} onChange={() => toggleSelect(u.email)} label={t("selectUser", { name: u.name })} />
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: u.bg, color: u.fg }}
                >
                  {u.initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.name}</p>
                  <p className="truncate text-[10.5px] text-(--text-muted)">{u.email}</p>
                </div>
              </div>
              <span className="truncate text-(--text-muted)">{t(`departments.${u.deptId}`)} · {t(`positions.${u.positionId}`)}</span>
              <span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ROLE_STYLE[u.role]}`}>
                  {t(`roles.${u.role}`)}
                </span>
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px]">{quotaLabel(u)}</p>
                <ProgressBar
                  pct={u.pct}
                  height={4}
                  color={u.pct > 85 ? "#C0433B" : u.pct > 60 ? "#E0AC4A" : "#2B4BF2"}
                />
              </div>
              <span className="text-(--text-muted)">{lastSeenLabel(u.lastSeenMinutes)}</span>
              <span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[u.status]}`}>
                  {t(`statuses.${u.status}`)}
                </span>
              </span>
              <div className="relative flex justify-end">
                <button
                  type="button"
                  onClick={() => setMenuFor((v) => (v === u.email ? null : u.email))}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-(--text-muted) opacity-0 transition hover:bg-black/5 group-hover:opacity-100 dark:hover:bg-white/10"
                  aria-label={t("moreActions")}
                >
                  <MoreHorizontal size={14} />
                </button>
                {menuFor === u.email && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                    <div className="absolute right-0 top-7 z-50 w-40 overflow-hidden rounded-lg border border-(--border-app) bg-background py-1 shadow-xl">
                      <button
                        type="button"
                        onClick={() => toggleSuspend(u)}
                        className="flex w-full items-center px-3 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        {t(u.status === "suspended" ? "resumeAccount" : "suspendAccount")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingUser(u);
                          setMenuFor(null);
                        }}
                        className="flex w-full items-center px-3 py-2 text-left text-xs text-[#C0433B] hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        {t("deleteAccount")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </AdminCard>

      {deletingUser && (
        <ConfirmDialog
          tone="destructive"
          title={t("deleteTitle", { name: deletingUser.name })}
          description={t("deleteDescription", { quota: quotaLabel(deletingUser) })}
          confirmLabel={t("deleteAccount")}
          requireTypedText={deletingUser.email}
          onCancel={() => setDeletingUser(null)}
          onConfirm={() => {
            setUsers((prev) => prev.filter((row) => row.email !== deletingUser.email));
            toast.success(t("deletedToast"), { sub: deletingUser.name });
            setDeletingUser(null);
          }}
        />
      )}
    </div>
  );
}

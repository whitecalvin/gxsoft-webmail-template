"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Archive,
  CalendarDays,
  ChevronLeft,
  ClipboardCheck,
  FileEdit,
  Files,
  Folder,
  Inbox,
  LogOut,
  MailPlus,
  Paperclip,
  Search,
  Send,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Star,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useMail } from "@/context/mail-context";
import { useTheme } from "@/context/theme-context";
import { useToast } from "@/context/toast-context";
import { requestLiveSignOut } from "@/lib/tastemail/client-session";
import { FOLDERS } from "@/lib/mock-mails";
import type { FolderId } from "@/types/mail";
import type { LayoutStyle } from "@/types/theme";

const FOLDER_ICONS: Record<FolderId, LucideIcon> = {
  inbox: Inbox,
  starred: Star,
  drafts: FileEdit,
  sent: Send,
  archive: Archive,
  spam: ShieldAlert,
  trash: Trash2,
  custom: Folder,
};

const STORAGE_USAGE_MIB: Record<FolderId, number> = {
  inbox: 0,
  starred: 0,
  drafts: 0,
  sent: 1.3,
  archive: 624,
  spam: 0,
  trash: 0,
  custom: 0,
};

const SIDEBAR_GROUPS = [
  {
    key: "collaborationGroup",
    items: [
      { href: "/mailboxes", icon: Files, key: "mailboxes", animationIndex: 0 },
      { href: "/calendar", icon: CalendarDays, key: "calendar", animationIndex: 1 },
      { href: "/contacts", icon: Users, key: "contacts", animationIndex: 2 },
      { href: "/approvals", icon: ClipboardCheck, key: "approvals", animationIndex: 3 },
    ],
  },
  {
    key: "mailManagementGroup",
    items: [
      { href: "/rules", icon: SlidersHorizontal, key: "rules", animationIndex: 4 },
      { href: "/files", icon: Paperclip, key: "files", animationIndex: 5 },
      { href: "/quarantine", icon: ShieldAlert, key: "quarantine", animationIndex: 6 },
    ],
  },
  {
    key: "shortcutsGroup",
    items: [
      { href: "/search", icon: Search, key: "search", animationIndex: 7 },
      { href: "/settings", icon: Settings, key: "settings", animationIndex: 8 },
    ],
  },
] as const;

const NAV_STYLE: Record<LayoutStyle, { active: string; idle: string }> = {
  classic: {
    active: "bg-(--color-primary)/10 font-semibold text-(--color-primary-ink)",
    idle: "text-(--text-muted) hover:bg-black/5 dark:hover:bg-white/5",
  },
  card: {
    active: "bg-background font-semibold text-(--color-primary-ink) shadow-sm",
    idle: "text-(--text-muted) hover:bg-background/70",
  },
  minimal: {
    active: "bg-black/3 font-semibold text-(--color-primary-ink) dark:bg-white/5",
    idle: "text-(--text-muted) hover:text-foreground",
  },
};

export interface WorkspaceSidebarProps {
  collapsed?: boolean;
  mobile?: boolean;
  onClose?: () => void;
  onToggleCollapsed?: () => void;
}

function isToolActive(pathname: string, href: string) {
  if (href === "/settings") {
    return ["/settings", "/security", "/accessibility", "/shortcuts"].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`)
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkspaceSidebar({ collapsed = false, mobile = false, onClose, onToggleCollapsed }: WorkspaceSidebarProps) {
  const locale = useLocale();
  const tFolder = useTranslations("sidebar");
  const tSidebar = useTranslations("workspaceSidebar");
  const tProfile = useTranslations("profileMenu");
  const tLive = useTranslations("liveService");
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { activeFolder, activeCustomMailboxId, setActiveFolder, setActiveCustomMailbox, unreadCounts, openCompose, mode, mailboxes, mailboxSummaryStatus, retryLoad } = useMail();
  const { draft } = useTheme();
  const compact = collapsed && !mobile;
  const navStyle = NAV_STYLE[draft.layoutStyle];
  const sidebarOnRight = draft.sidebarPosition === "right" && !mobile;
  const storageNumber = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const mailboxError = mailboxSummaryStatus === "unauthorized" || mailboxSummaryStatus === "forbidden"
    || mailboxSummaryStatus === "rateLimited" || mailboxSummaryStatus === "retryable"
    || mailboxSummaryStatus === "unavailable" ? mailboxSummaryStatus : null;

  const openFolder = (folder: FolderId) => {
    setActiveFolder(folder);
    if (pathname !== "/") router.push("/");
    onClose?.();
  };

  const openCustomMailbox = (mailboxId: string) => {
    setActiveCustomMailbox(mailboxId);
    if (pathname !== "/") router.push("/");
    onClose?.();
  };

  const logout = async () => {
    if (signingOut) return;
    if (mode === "live") {
      setSigningOut(true);
      try {
        const revoked = await requestLiveSignOut();
        if (!revoked) toast.error(tLive("signOutUnconfirmed"));
      } catch {
        toast.error(tLive("signOutFailed"));
        setSigningOut(false);
        return;
      }
      onClose?.();
      router.push("/login");
      return;
    }
    try {
      window.localStorage.removeItem("gxmail:session");
      window.sessionStorage.removeItem("gxmail:session-expires-at");
    } catch {
      // Storage can be unavailable; navigation should still continue.
    }
    onClose?.();
    router.push("/login");
  };

  return (
    <aside
      className={`relative flex h-full shrink-0 flex-col bg-background transition-[width] duration-200 motion-reduce:transition-none ${mobile ? "pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" : ""} ${
        mobile ? "w-62.5 max-w-[calc(100vw-2rem)] shadow-2xl" : compact ? "w-18" : "w-62.5"
      }`}
    >
      <div className="relative flex h-14 shrink-0 items-center px-3">
        <Link href="/" onClick={onClose} className={`flex min-w-0 items-center ${compact ? "justify-center" : "gap-3"}`} aria-label="GXWebMail">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-app) bg-(--color-primary-solid) font-bold text-white">G</span>
          {!compact ? <span className="truncate text-lg font-semibold">GXWebMail</span> : null}
        </Link>
        {mobile ? (
          <button type="button" onClick={onClose} autoFocus className="ml-auto rounded-(--radius-app) p-2 text-(--text-muted) hover:bg-black/5 dark:hover:bg-white/5" aria-label={tSidebar("closeMenu")}>
            <X size={20} />
          </button>
        ) : null}
        {!mobile ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={`absolute top-1/2 z-(--layer-sidebar-toggle) flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-(--border-app) bg-background text-(--text-muted) shadow-md transition-[color,background-color,box-shadow,transform] duration-200 hover:scale-110 hover:bg-(--surface-muted) hover:text-foreground hover:shadow-lg active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100 ${sidebarOnRight ? "-left-4" : "-right-4"}`}
            aria-label={compact ? tSidebar("expand") : tSidebar("collapse")}
            title={compact ? tSidebar("expand") : tSidebar("collapse")}
          >
            <ChevronLeft
              size={17}
              className={`transition-transform duration-200 motion-reduce:transition-none ${
                sidebarOnRight
                  ? compact ? "rotate-0" : "rotate-180"
                  : compact ? "rotate-180" : "rotate-0"
              }`}
            />
          </button>
        ) : null}
      </div>

      <div className="px-3 pb-4 pt-3">
        <button
          type="button"
          data-compose-trigger
          onClick={() => {
            openCompose();
            onClose?.();
          }}
          className={`flex w-full items-center justify-center rounded-(--radius-app) bg-(--color-primary-solid) py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "px-0" : "gap-2 px-4"}`}
          aria-label={tFolder("compose")}
          title={compact ? tFolder("compose") : undefined}
        >
          <MailPlus size={20} />
          {!compact ? <span>{tFolder("compose")}</span> : null}
        </button>
      </div>

      <nav aria-label={tSidebar("navigation")} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <section aria-labelledby={!compact ? "workspace-sidebar-mailboxes-heading" : undefined}>
          {!compact ? <h2 id="workspace-sidebar-mailboxes-heading" className="px-3 pb-2 pt-2 text-xs font-bold uppercase tracking-[0.14em] text-(--text-muted)">{tSidebar("mailboxGroup")}</h2> : null}
          {mode === "live" && pathname !== "/" && mailboxError ? compact ? (
            <button type="button" onClick={retryLoad} title={tLive(mailboxError)} aria-label={`${tLive(mailboxError)} ${tLive("retry")}`} className="mx-auto mb-2 flex size-9 items-center justify-center rounded-(--radius-app) text-(--status-danger) hover:bg-(--status-danger-bg)">
              <ShieldAlert size={18} />
            </button>
          ) : (
            <div role="alert" className="mb-2 rounded-(--radius-app) bg-(--status-danger-bg) px-3 py-2 text-xs text-(--status-danger)">
              <p>{tLive(mailboxError)}</p>
              <button type="button" onClick={retryLoad} className="mt-1 font-semibold underline underline-offset-2">{tLive("retry")}</button>
            </div>
          ) : null}
          <ul className="space-y-1">
            {FOLDERS.map((folder, index) => {
              const Icon = FOLDER_ICONS[folder.id];
              const active = pathname === "/" && activeFolder === folder.id;
              const count = unreadCounts[folder.id];
              const label = tFolder(folder.id);
              const mailboxRole = folder.id === "spam" ? "junk" : folder.id;
              const liveMailbox = mailboxes.find((item) => item.role === mailboxRole);
              const liveStorage = liveMailbox?.usedBytes !== null && liveMailbox?.usedBytes !== undefined
                && liveMailbox?.quotaBytes !== null && liveMailbox?.quotaBytes !== undefined
                && liveMailbox.quotaBytes > 0
                ? { used: liveMailbox.usedBytes / 1024 / 1024, limit: liveMailbox.quotaBytes / 1024 / 1024 / 1024 }
                : null;
              const storage = mode === "live" ? liveStorage : { used: STORAGE_USAGE_MIB[folder.id], limit: 10 };
              return (
                <li key={folder.id} className={mobile ? "workspace-menu-item-enter" : undefined} style={mobile ? { animationDelay: `${80 + index * 30}ms` } : undefined}>
                  <button
                    type="button"
                    onClick={() => openFolder(folder.id)}
                    className={`flex w-full items-center rounded-(--radius-app) py-2.5 text-sm transition ${compact ? "justify-center px-0" : "gap-3 px-3"} ${active ? navStyle.active : navStyle.idle}`}
                    style={{ paddingBlock: "calc(0.625rem * var(--density-scale))" }}
                    aria-current={active ? "page" : undefined}
                    aria-label={compact ? label : undefined}
                    title={compact ? label : undefined}
                  >
                    <Icon size={19} className="shrink-0" />
                    {!compact ? (
                      <>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate font-medium">{label}</span>
                          {storage ? <span className="block truncate text-[10px] font-normal text-(--text-muted)">{tSidebar("storageUsage", { used: storageNumber.format(storage.used), limit: storageNumber.format(storage.limit) })}</span> : null}
                        </span>
                        {count > 0 ? <span className="min-w-6 rounded-full bg-(--color-primary-solid) px-1.5 py-0.5 text-center text-xs text-white">{count}</span> : null}
                      </>
                    ) : count > 0 ? <span className="sr-only">{count}</span> : null}
                  </button>
                </li>
              );
            })}
            {mode === "live" ? mailboxes.filter((mailbox) => mailbox.role === null).map((mailbox, index) => {
              const active = pathname === "/" && activeFolder === "custom" && activeCustomMailboxId === mailbox.id;
              return (
                <li key={mailbox.id} className={mobile ? "workspace-menu-item-enter" : undefined} style={mobile ? { animationDelay: `${80 + (FOLDERS.length + index) * 30}ms` } : undefined}>
                  <button
                    type="button"
                    onClick={() => openCustomMailbox(mailbox.id)}
                    className={`flex w-full items-center rounded-(--radius-app) py-2.5 text-sm transition ${compact ? "justify-center px-0" : "gap-3 px-3"} ${active ? navStyle.active : navStyle.idle}`}
                    style={{ paddingBlock: "calc(0.625rem * var(--density-scale))" }}
                    aria-current={active ? "page" : undefined}
                    aria-label={compact ? mailbox.name : undefined}
                    title={compact ? mailbox.name : undefined}
                  >
                    <Folder size={19} className="shrink-0" />
                    {!compact ? (
                      <>
                        <span className="min-w-0 flex-1 truncate text-left font-medium">{mailbox.name}</span>
                        {mailbox.unreadEmails > 0 ? <span className="min-w-6 rounded-full bg-(--color-primary-solid) px-1.5 py-0.5 text-center text-xs text-white">{mailbox.unreadEmails}</span> : null}
                      </>
                    ) : mailbox.unreadEmails > 0 ? <span className="sr-only">{mailbox.unreadEmails}</span> : null}
                  </button>
                </li>
              );
            }) : null}
          </ul>
        </section>

        {SIDEBAR_GROUPS.map((group) => (
          <section key={group.key} aria-labelledby={!compact ? `workspace-sidebar-${group.key}-heading` : undefined}>
            {!compact ? (
              <h2 id={`workspace-sidebar-${group.key}-heading`} className="px-3 pb-2 pt-7 text-xs font-bold uppercase tracking-[0.14em] text-(--text-muted)">
                {tSidebar(group.key)}
              </h2>
            ) : (
              <div className="mx-2 my-4 border-t border-(--border-app)" />
            )}
            <ul className="space-y-1">
              {group.items.map((tool) => {
                const Icon = tool.icon;
                const active = isToolActive(pathname, tool.href);
                const label = tSidebar(tool.key);
                return (
                  <li
                    key={tool.href}
                    className={mobile ? "workspace-menu-item-enter" : undefined}
                    style={mobile ? { animationDelay: `${260 + tool.animationIndex * 30}ms` } : undefined}
                  >
                    <Link
                      href={tool.href}
                      onClick={onClose}
                      className={`flex items-center rounded-(--radius-app) py-2.5 text-sm transition ${compact ? "justify-center px-0" : "gap-3 px-3"} ${active ? navStyle.active : navStyle.idle}`}
                      style={{ paddingBlock: "calc(0.625rem * var(--density-scale))" }}
                      aria-current={active ? "page" : undefined}
                      aria-label={compact ? label : undefined}
                      title={compact ? label : undefined}
                    >
                      <Icon size={19} className="shrink-0" />
                      {!compact ? <span className="truncate">{label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      <button
        type="button"
        onClick={logout}
        disabled={signingOut}
        className={`m-3 flex items-center justify-center rounded-(--radius-app) border border-(--border-app) py-2.5 text-sm text-(--status-danger) transition hover:bg-(--status-danger-bg) active:scale-98 ${compact ? "px-0" : "gap-2 px-3"}`}
        aria-label={tProfile("logout")}
        title={compact ? tProfile("logout") : undefined}
      >
        <LogOut size={18} />
        {!compact ? <span>{tProfile("logout")}</span> : null}
      </button>
    </aside>
  );
}

"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Archive, CalendarDays, ChevronLeft, ClipboardCheck, FileEdit, Files, Folder, Inbox, LogOut, MailPlus, Paperclip, Search, Send, Settings, ShieldAlert, SlidersHorizontal, Star, Trash2, Users, X, type LucideIcon } from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useMail } from "@/context/mail-context";
import { useTheme } from "@/context/theme-context";
import { useBranding } from "@/context/branding-context";
import { BrandMark } from "./BrandMark";
import { useToast } from "@/context/toast-context";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { SidebarMenuGroup } from "./SidebarMenuGroup";
import { ScheduledSubmissions } from "@/components/mail/ScheduledSubmissions";
import { PersonalFolderManager } from "@/components/mail/PersonalFolderManager";
import { PersonalFolderTree } from "@/components/mail/PersonalFolderTree";
import { SystemMailboxIcon } from "@/components/mail/PersonalFolderIcon";
import { InboxContextMenu } from "@/components/mail/InboxContextMenu";
import { requestLiveSignOut } from "@/lib/tastemail/client-session";
import { FOLDERS } from "@/lib/mail-folders";
import { useSettings } from "@/context/settings-context"; import { allMailboxStorage } from "@/lib/all-mailbox-storage";
import type { FolderId } from "@/types/mail";
import type { LayoutStyle } from "@/types/theme";

const FOLDER_ICONS: Record<FolderId, LucideIcon> = {
  all: Files,
  inbox: Inbox,
  starred: Star,
  drafts: FileEdit,
  sent: Send,
  archive: Archive,
  spam: ShieldAlert,
  trash: Trash2,
  custom: Folder,
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
      { href: "/settings/rules", icon: SlidersHorizontal, key: "rules", animationIndex: 4 },
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
  width?: number;
  resizing?: boolean;
  collapsed?: boolean;
  mobile?: boolean;
  onClose?: (afterClose?: () => void) => void;
  onToggleCollapsed?: () => void;
}

function isToolActive(pathname: string, href: string) {
  const isRules = ["/settings/rules", "/settings/filters", "/rules"].some(
    path => pathname === path || pathname.startsWith(`${path}/`)
  );
  if (href === "/settings/rules") return isRules;
  if (href === "/settings") {
    if (isRules) return false;
    return ["/settings", "/security", "/accessibility", "/shortcuts"].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`)
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkspaceSidebar({ collapsed = false, mobile = false, onClose, onToggleCollapsed, width, resizing = false }: WorkspaceSidebarProps) {
  const locale = useLocale();
  const tFolder = useTranslations("sidebar");
  const tSidebar = useTranslations("workspaceSidebar");
  const tProfile = useTranslations("profileMenu");
  const tLive = useTranslations("liveService");
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { saved } = useSettings(); const { activeFolder, activeCustomMailboxId, setActiveFolder, setActiveCustomMailbox, unreadCounts, allMailCounts, openCompose, mailboxes, mailboxSummaryStatus, retryLoad } = useMail();
  const { draft } = useTheme();
  const branding = useBranding();
  const compact = collapsed && !mobile;
  const navStyle = NAV_STYLE[draft.layoutStyle];
  const sidebarOnRight = draft.sidebarPosition === "right" && !mobile;
  const storageNumber = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  // A tenth of a MiB hides most individual-message moves. Keep the existing
  // display mailbox usage down to roughly one KiB.
  const liveStorageNumber = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  const mailboxError = mailboxSummaryStatus === "unauthorized" || mailboxSummaryStatus === "forbidden"
    || mailboxSummaryStatus === "rateLimited" || mailboxSummaryStatus === "retryable"
    || mailboxSummaryStatus === "unavailable" ? mailboxSummaryStatus : null;

  const navigate = (href: string) => {
    if (mobile && onClose) onClose(pathname !== href ? () => router.push(href) : undefined);
    else if (pathname !== href) router.push(href);
  };

  const openFolder = (folder: FolderId) => {
    setActiveFolder(folder);
    navigate("/");
  };

  const openCustomMailbox = (mailboxId: string) => {
    setActiveCustomMailbox(mailboxId);
    navigate("/");
  };

  const logout = async () => {
    if (signingOut) return;
    {
      setSigningOut(true);
      try {
        const revoked = await requestLiveSignOut();
        if (!revoked) toast.error(tLive("signOutUnconfirmed"));
      } catch {
        toast.error(tLive("signOutFailed"));
        setSigningOut(false);
        return;
      }
      navigate("/login");
      return;
    }

  };

  return (
    <aside
      style={!mobile && !compact && width !== undefined ? { width, transitionDuration: resizing ? "0ms" : undefined } : undefined}
      className={`relative flex h-full shrink-0 flex-col bg-background transition-[width] duration-200 motion-reduce:transition-none ${mobile ? "pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" : ""} ${
        mobile ? "w-70 max-w-[calc(100vw-2rem)] shadow-2xl" : compact ? "w-18" : "w-62.5"
      }`}
    >
      <div className="relative flex h-14 shrink-0 items-center px-3">
        <Link href="/" onClick={event => { if (mobile) { event.preventDefault(); navigate("/"); } }} className={`flex min-w-0 items-center ${compact ? "justify-center" : "gap-3"}`} aria-label={branding.displayName}>
          <BrandMark className="size-9" />
          {!compact ? <span title={branding.displayName} className="truncate text-lg font-semibold">{branding.displayName}</span> : null}
        </Link>
        {mobile ? (
          <button type="button" onClick={() => onClose?.()} autoFocus className="ml-auto rounded-(--radius-app) p-2 text-(--text-muted) hover:bg-black/5 dark:hover:bg-white/5" aria-label={tSidebar("closeMenu")}>
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

      <nav aria-label={tSidebar("navigation")} className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-3 ${mobile ? "px-1 [&_[data-mailbox-row]]:px-1 [&_h2>button]:px-1" : "px-3"}`}>
        <SidebarMenuGroup groupKey="mailboxGroup" title={tSidebar("mailboxGroup")} compact={compact} first>
          {/* The persistent sidebar owns the notification; the mobile drawer
              must not add a duplicate or dismiss it when the drawer closes. */}
          {mailboxError && !mobile ? <SystemErrorNotice toastOnly message={tLive(mailboxError)} actionLabel={tLive("retry")} onAction={retryLoad} /> : null}
          <ul className="space-y-0.5">
            {FOLDERS.filter(folder => !saved.inbox.hiddenSystemMailboxes.includes(folder.id)).map((folder) => {
              const Icon = FOLDER_ICONS[folder.id];
              const active = pathname === "/" && activeFolder === folder.id;
              const count = unreadCounts[folder.id];
              const label = tFolder(folder.id);
              const mailboxRole = folder.id === "spam" ? "junk" : folder.id;
              const liveMailbox = mailboxes.find((item) => item.role === mailboxRole);
              const folderCounts = folder.id === "all" ? allMailCounts : liveMailbox ? { total: liveMailbox.totalEmails, unread: count } : null;
              const countLabel = folderCounts ? tSidebar("allMailCounts", folderCounts) : "—";
              const liveStorage = liveMailbox?.usedBytes !== null && liveMailbox?.usedBytes !== undefined
                && liveMailbox?.quotaBytes !== null && liveMailbox?.quotaBytes !== undefined
                && liveMailbox.quotaBytes > 0
                ? { used: liveMailbox.usedBytes / 1024 / 1024, limit: liveMailbox.quotaBytes / 1024 / 1024 / 1024 }
                : null;
              const storage = folder.id === "all" ? allMailboxStorage(mailboxes) : liveStorage;
              const folderButton = <div data-mailbox-row className={`flex w-full items-center text-sm ${compact ? "justify-center" : "gap-1 pl-2 pr-3"}`}>
                  {!compact ? <SystemMailboxIcon folderId={folder.id} label={label} defaultIcon={Icon} editable /> : null}
                  <button
                    type="button"
                    onClick={() => openFolder(folder.id)}
                    className={`flex min-w-0 flex-1 items-center py-2 ${compact ? "justify-center" : "gap-3 text-left"}`}
                    aria-current={active ? "page" : undefined}
                    aria-label={compact ? `${label} · ${countLabel}` : undefined}
                    title={compact ? `${label} · ${countLabel}` : undefined}
                  >
                    {compact ? <SystemMailboxIcon folderId={folder.id} label={label} defaultIcon={Icon} /> : null}
                    {!compact ? (
                      <>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate font-medium">{label}</span>
                          {saved.inbox.showMailboxCounts ? <span className="block truncate text-[10px] font-normal text-(--text-muted)" title={countLabel}>{countLabel}</span> : null}
                          {saved.inbox.showMailboxStorage && storage ? <span className="block truncate text-[10px] font-normal text-(--text-muted)">{tSidebar("storageUsage", { used: (liveStorageNumber).format(storage.used), limit: storageNumber.format(storage.limit) })}</span> : null}
                        </span>
                        {count > 0 ? <span className="min-w-6 rounded-full bg-(--color-primary-solid) px-1.5 py-0.5 text-center text-xs text-white">{count}</span> : null}
                      </>
                    ) : count > 0 ? <span className="sr-only">{count}</span> : null}
                  </button></div>;
              return (
                <li key={folder.id}>
                  <InboxContextMenu folder={folder.id} showTrigger={!compact} menuLabel={label} className={active ? navStyle.active : navStyle.idle} onOpen={() => openFolder(folder.id)}>{folderButton}</InboxContextMenu>
                </li>
              );
            })}
            {<PersonalFolderTree compact={compact} activeId={pathname === "/" && activeFolder === "custom" ? activeCustomMailboxId : null} onOpen={openCustomMailbox} activeClass={navStyle.active} idleClass={navStyle.idle} />}
          </ul>
          {!compact ? <PersonalFolderManager compact={false} /> : null}
        </SidebarMenuGroup>

        {!compact ? <ScheduledSubmissions className="px-3 pt-5" /> : null}

        {SIDEBAR_GROUPS.map((group) => (
          <SidebarMenuGroup key={group.key} groupKey={group.key} title={tSidebar(group.key)} compact={compact}>
            <ul className="space-y-0.5">
              {group.items.map((tool) => {
                const Icon = tool.icon;
                const active = isToolActive(pathname, tool.href);
                const label = tSidebar(tool.key);
                return (
                  <li
                    key={tool.href}
                  >
                    <Link
                      href={tool.href}
                      onClick={event => { if (mobile) { event.preventDefault(); navigate(tool.href); } }}
                      className={`workspace-menu-surface flex items-center text-sm transition ${compact ? "justify-center px-0" : mobile ? "min-h-11 gap-1 px-1" : "gap-3 px-3"} ${active ? navStyle.active : navStyle.idle}`}
                      style={{ paddingBlock: mobile ? 0 : "calc(0.625rem * var(--density-scale))" }}
                      aria-current={active ? "page" : undefined}
                      aria-label={compact ? label : undefined}
                      title={compact ? label : undefined}
                    >
                      {mobile ? <span className="flex size-11 shrink-0 items-center justify-center"><Icon size={19} /></span> : <Icon size={19} className="shrink-0" />}
                      {!compact ? <span className="truncate">{label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </SidebarMenuGroup>
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

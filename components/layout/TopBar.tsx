"use client";

import { Suspense, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { MailSearchAutocomplete } from "@/components/search/MailSearchAutocomplete";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getPathname, Link, usePathname, useRouter } from "@/i18n/navigation";
import { Bell, HelpCircle, Languages, LogOut, Menu, Paintbrush, Search, ShieldCheck, UserCog, X } from "lucide-react";
import { useTheme } from "@/context/theme-context";
import { useBranding } from "@/context/branding-context";
import { BrandMark } from "./BrandMark";
import { useMail } from "@/context/mail-context";
import { useToast } from "@/context/toast-context";
import { localeNames, locales, type Locale } from "@/i18n/routing";
import { LocaleFlag } from "@/components/ui/LocaleFlag";

import { NotificationPopover } from "@/components/notifications/NotificationPopover";
import { containTabFocus } from "@/components/overlay/contain-tab-focus";
import { Dropdown } from "@/components/ui/Dropdown";
import { AccountIcon } from "@/components/mail/AccountIcon";

import { requestLiveSignOut } from "@/lib/tastemail/client-session";
import type { LayoutStyle } from "@/types/theme";

type OpenMenu = "none" | "notifications" | "profile";

const HEADER_STYLE: Record<LayoutStyle, string> = {
  classic: "border-b border-(--border-app)",
  card: "shadow-sm",
  minimal: "border-b border-(--border-app)",
};

const SEARCH_STYLE: Record<LayoutStyle, string> = {
  classic: "border border-(--border-app) bg-black/2 dark:bg-white/3",
  card: "border-0 bg-(--surface-muted) shadow-inner",
  minimal: "rounded-none border-0 border-b border-(--border-app) bg-transparent",
};

function GlobalSearchForm({ initialQuery, mobile = false, onSubmitted }: { initialQuery: string; mobile?: boolean; onSubmitted?: () => void }) {
  const router = useRouter();
  const { draft } = useTheme();
  return <MailSearchAutocomplete initialQuery={initialQuery} mobile={mobile}
    inputClassName={`h-10 w-full rounded-(--radius-app) py-2 pl-9 pr-8 text-base outline-none transition focus:border-(--color-primary) md:h-9 md:text-sm ${SEARCH_STYLE[draft.layoutStyle]}`}
    onSearch={(query, messageId) => {
      router.push({ pathname: "/search", query: { q: query, ...(messageId ? { message: messageId } : {}) } });
      onSubmitted?.();
    }} />;
}

function GlobalSearch({ mobile = false, onSubmitted }: { mobile?: boolean; onSubmitted?: () => void }) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  return <GlobalSearchForm key={initialQuery} initialQuery={initialQuery} mobile={mobile} onSubmitted={onSubmitted} />;
}

export interface TopBarProps {
  title?: ReactNode;
  titleAsHeading?: boolean;
  actions?: ReactNode;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  onMenuClick?: () => void;
  menuOpen?: boolean;
  onOpenTour?: () => void;
  onToggleDelegate?: () => void;
  showGlobalSearch?: boolean;
  showMobilePageContext?: boolean | "tablet";
  showDesktopBrand?: boolean;
  adminAccess?: boolean;
}

export function TopBar({ title, titleAsHeading = true, actions, menuButtonRef, onMenuClick, menuOpen = false, onOpenTour, onToggleDelegate, showGlobalSearch = false, showMobilePageContext = true, showDesktopBrand = false, adminAccess = false }: TopBarProps) {
  const t = useTranslations("topBar");
  const tMenu = useTranslations("profileMenu");
  const tLive = useTranslations("liveService");
  const toast = useToast();
  const tLocale = useTranslations("localeSettings");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const { openCustomizer, draft, selectionAllowed } = useTheme();
  const branding = useBranding();
  const { accountAddress } = useMail();
  const [openMenu, setOpenMenu] = useState<OpenMenu>("none");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const mobileSearchTriggerRef = useRef<HTMLButtonElement>(null);
  const notificationTriggerRef = useRef<HTMLButtonElement>(null);
  const themeCustomizerTriggerRef = useRef<HTMLButtonElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const profilePanelRef = useRef<HTMLDivElement>(null);
  const notificationPanelId = useId();
  const profilePanelId = useId();
  const profileName = accountAddress?.split("@")[0] || tMenu("profile");
  const profileEmail = accountAddress;
  const closeMenus = () => setOpenMenu("none");
  const logout = async () => {
    if (signingOut) return;
    closeMenus();
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
    }
    router.push("/login");
  };
  const changeLocale = (nextLocale: string) => {
    if (!locales.includes(nextLocale as Locale) || nextLocale === locale) return;
    const suffix = `${window.location.search}${window.location.hash}`;
    closeMenus();
    const localizedPathname = getPathname({
      href: pathname,
      locale: nextLocale as Locale,
      forcePrefix: true,
    });
    window.location.replace(`${localizedPathname}${suffix}`);
  };

  useEffect(() => {
    if (!mobileSearchOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMobileSearchOpen(false);
      mobileSearchTriggerRef.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (openMenu === "none") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openMenu === "profile" && profilePanelRef.current?.querySelector('[role="listbox"]')) return;
      event.preventDefault();
      setOpenMenu("none");
      (openMenu === "notifications" ? notificationTriggerRef : profileTriggerRef).current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [openMenu]);

  useEffect(() => {
    if (openMenu === "profile") profilePanelRef.current?.querySelector<HTMLElement>('button, a[href]')?.focus();
  }, [openMenu]);

  return (
    <header className={`relative z-(--layer-header) shrink-0 bg-background ${HEADER_STYLE[draft.layoutStyle]}`}>
      <div className="flex h-14 min-w-0 items-center">
        {onMenuClick ? (
          <button ref={menuButtonRef} type="button" data-mobile-menu-trigger onClick={onMenuClick} className="ml-2 rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10 xl:hidden" aria-label={t("openMenu")} aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls={menuOpen ? "workspace-navigation-drawer" : undefined}>
            <Menu size={20} />
          </button>
        ) : null}

        <Link href="/" className="flex h-full shrink-0 items-center gap-2 px-2 xl:hidden" aria-label={branding.displayName}>
          <BrandMark />
          <span title={branding.displayName} className="max-w-36 truncate text-sm font-semibold sm:max-w-48 sm:text-base">{branding.displayName}</span>
        </Link>

        {showDesktopBrand ? (
          <Link href="/" className="hidden h-full shrink-0 items-center gap-2 border-r border-(--border-app) px-6 xl:flex" aria-label={branding.displayName}>
            <BrandMark />
            <span title={branding.displayName} className="max-w-48 truncate text-sm font-semibold">{branding.displayName}</span>
          </Link>
        ) : null}

        {title || actions ? (
          <div className={`hidden min-w-0 items-center gap-3 pl-8 pr-3 xl:flex ${showGlobalSearch ? "shrink-0" : "flex-1"}`}>
            {title ? titleAsHeading ? <h1 className="truncate text-sm font-bold">{title}</h1> : <div className="min-w-0 truncate text-sm font-bold">{title}</div> : null}
            {actions ? <div role="toolbar" className={`flex items-center gap-2 ${showGlobalSearch ? "shrink-0" : "min-w-0 flex-1"}`}>{actions}</div> : null}
          </div>
        ) : null}

        {showGlobalSearch ? (
          <div className="hidden min-w-60 max-w-xl flex-1 px-3 md:block lg:px-4">
            <Suspense fallback={<div className="h-9 rounded-(--radius-app) bg-(--surface-muted)" />}><GlobalSearch /></Suspense>
          </div>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-1 px-2 sm:px-3">
          {adminAccess ? <Link href="/admin" onClick={closeMenus} aria-label={tMenu("admin")} title={tMenu("admin")} className="flex size-9 shrink-0 items-center justify-center gap-2 rounded-(--radius-app) text-(--color-primary-ink) outline-none transition hover:bg-(--color-primary)/10 focus-visible:ring-3 focus-visible:ring-(--focus-ring) sm:w-auto sm:px-3"><ShieldCheck size={18} aria-hidden="true" /><span className="hidden text-sm font-medium sm:inline">{tMenu("admin")}</span></Link> : null}
          {showGlobalSearch ? (
            <button ref={mobileSearchTriggerRef} type="button" onClick={() => setMobileSearchOpen((open) => !open)} className="rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10 md:hidden" aria-label={t(mobileSearchOpen ? "closeSearch" : "searchPlaceholder")} aria-expanded={mobileSearchOpen}>
              {mobileSearchOpen ? <X size={18} /> : <Search size={18} />}
            </button>
          ) : null}
          {onOpenTour ? (
            <button type="button" onClick={onOpenTour} className="hidden rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10 sm:flex" aria-label={t("tour")} title={t("tour")}><HelpCircle size={18} /></button>
          ) : null}
          <div className="relative">
            <button ref={notificationTriggerRef} type="button" onClick={() => setOpenMenu((value) => value === "notifications" ? "none" : "notifications")} className="relative rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10" aria-label={t("notifications")} aria-haspopup="dialog" aria-expanded={openMenu === "notifications"} aria-controls={openMenu === "notifications" ? notificationPanelId : undefined}>
              <Bell size={18} />
            </button>
            {openMenu === "notifications" ? <NotificationPopover id={notificationPanelId} onClose={closeMenus} /> : null}
          </div>
          <button
            ref={themeCustomizerTriggerRef}
            disabled={!selectionAllowed}
            type="button"
            onClick={() => { closeMenus(); openCustomizer(); }}
            className="flex rounded-(--radius-app) p-2 transition hover:bg-black/5 active:translate-y-px dark:hover:bg-white/10"
            aria-label={tMenu("themeCustomizer")}
            title={tMenu("themeCustomizer")}
          >
            <Paintbrush size={18} style={{ color: "var(--color-accent)" }} />
          </button>
          <div className="relative">
            <button ref={profileTriggerRef} type="button" onClick={() => setOpenMenu((value) => value === "profile" ? "none" : "profile")} className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-(--focus-ring)" aria-label={tMenu("profile")} aria-haspopup="dialog" aria-expanded={openMenu === "profile"} aria-controls={openMenu === "profile" ? profilePanelId : undefined}>
              <AccountIcon name={profileName} size="sm" />
            </button>
            {openMenu === "profile" ? (
              <>
                <div aria-hidden="true" className="fixed inset-0 z-(--layer-popover-backdrop)" onClick={closeMenus} />
                <div ref={profilePanelRef} id={profilePanelId} role="dialog" aria-label={tMenu("profile")} onKeyDown={(event) => containTabFocus(event, profilePanelRef.current)} className="absolute right-0 top-full z-(--layer-popover) mt-2 max-h-[calc(100dvh-4.5rem)] w-56 overflow-y-auto rounded-(--radius-app) border border-(--border-app) bg-background shadow-xl">
                  <div className="flex min-w-0 items-center gap-3 border-b border-(--border-app) px-4 py-3">
                    <AccountIcon name={profileName} size="md" editable />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{profileName}</p>
                      {profileEmail ? <p className="truncate text-xs text-(--text-muted)">{profileEmail}</p> : null}
                    </div>
                  </div>
                  <button type="button" disabled={!selectionAllowed} onClick={() => { themeCustomizerTriggerRef.current?.focus(); closeMenus(); openCustomizer(); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"><Paintbrush size={16} style={{ color: "var(--color-accent)" }} />{tMenu("themeCustomizer")}</button>
                  <div className="flex items-start gap-2 border-t border-(--border-app) px-4 py-2.5">
                    <Languages size={16} className="mt-2.5 shrink-0 text-(--text-muted)" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="mb-1.5 text-xs font-medium text-(--text-muted)">{tLocale("displayLanguage")}</p>
                      <Dropdown
                        value={locale}
                        options={locales.map((value) => ({ value, label: localeNames[value], icon: <LocaleFlag locale={value} /> }))}
                        onChange={changeLocale}
                        variant="form"
                        overlay
                        menuMinWidth={240}
                        hideScrollbar
                        align="right"
                        label={tLocale("displayLanguage")}
                      />
                    </div>
                  </div>
                  {adminAccess ? <Link href="/admin" onClick={closeMenus} className="flex w-full items-center gap-2 border-t border-(--border-app) px-4 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"><ShieldCheck size={16} className="text-(--text-muted)" />{tMenu("admin")}</Link> : null}
                  {onToggleDelegate ? <button type="button" onClick={() => { onToggleDelegate(); closeMenus(); }} className="flex w-full items-center gap-2 border-t border-(--border-app) px-4 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"><UserCog size={16} className="text-(--text-muted)" />{tMenu("switchToDelegate")}</button> : null}
                  <button type="button" onClick={logout} disabled={signingOut} className="flex w-full items-center gap-2 border-t border-(--border-app) px-4 py-2.5 text-left text-sm text-(--status-danger) hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"><LogOut size={16} />{tMenu("logout")}</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {showMobilePageContext && (title || actions) ? <div className={`${showMobilePageContext === "tablet" ? "hidden lg:block" : "block"} xl:hidden`}>
        {title ? <div className="workspace-page-header min-w-0 border-t border-(--border-app) px-3">
          {titleAsHeading ? <h1 className="min-w-0 flex-1 truncate text-sm font-bold">{title}</h1> : <div className="min-w-0 flex-1 truncate text-sm font-bold">{title}</div>}
        </div> : null}
        {actions ? <div role="toolbar" className="flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-(--border-app) px-3 py-2">{actions}</div> : null}
      </div> : null}
      {showGlobalSearch && mobileSearchOpen ? <div className="border-t border-(--border-app) px-3 py-2 md:hidden"><Suspense fallback={<div className="h-9 rounded-(--radius-app) bg-(--surface-muted)" />}><GlobalSearch mobile onSubmitted={() => setMobileSearchOpen(false)} /></Suspense></div> : null}
    </header>
  );
}

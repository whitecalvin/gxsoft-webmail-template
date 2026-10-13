"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Menu, X, Search, Activity, Users, Shield, Server, Palette, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { adminMenuGroups, adminSectionFromPath, adminSectionHref } from "@/lib/admin-navigation";
import { useBranding } from "@/context/branding-context";
import { BrandMark } from "@/components/layout/BrandMark";
import type { AdminOverview } from "@/lib/tastemail/admin-contract";
import { AdminDraftGuard, useAdminDraftGuard, useAdminDraftProtection } from "./AdminDraftGuard";
import { Tooltip } from "@/components/ui/Tooltip";
const ShellContext = createContext<{ initial: AdminOverview; setMutationBusy: (busy: boolean) => void; actionsTarget: HTMLDivElement | null } | null>(null);
export function useAdminShell() { const value = useContext(ShellContext); if (!value) throw new Error("AdminShell required"); return value; }
export function AdminPageActions({ children }: { children: ReactNode }) { const { actionsTarget } = useAdminShell(); return actionsTarget ? createPortal(children, actionsTarget) : null; }
export function AdminShell({ initial, children }: { initial: AdminOverview; children: ReactNode }) {
  return <AdminDraftGuard><AdminShellContent initial={initial}>{children}</AdminShellContent></AdminDraftGuard>;
}
function AdminShellContent({ initial, children }: { initial: AdminOverview; children: ReactNode }) {
  const { requestAction } = useAdminDraftGuard();
  const branding = useBranding();
  const t = useTranslations("adminShell"), manage = useTranslations("adminManage"), nav = useTranslations("adminNav");
  const path = usePathname(), active = adminSectionFromPath(path);
  const router = useRouter(), common = useTranslations("nav");
  const service = useTranslations("liveService");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const currentGroup = adminMenuGroups.find(group => group.items.some(id => id === active)) ?? adminMenuGroups[0];
  const groupIcons = { operations: Activity, accounts: Users, security: Shield, system: Server, appearance: Palette, license: KeyRound };
  const remote = useTranslations("adminRemote");
  const setup = useTranslations("setup");
  const itemLabel = (id: string) => id === "onboarding" ? setup("title") : id === "system" ? remote("title") : id === "dashboard" ? nav("tabs.dash") : manage(id);
  const matches = query.trim() ? adminMenuGroups.flatMap(group => group.items.map(id => ({ id, group: group.id }))).filter(item => `${itemLabel(item.id)} ${t(`groups.${item.group}`)} ${item.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [];
  const [mutationBusy, setMutationBusy] = useState(false), [open, setOpen] = useState(false), [entered, setEntered] = useState(false);
  useAdminDraftProtection(false, mutationBusy);
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput.current?.focus(); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) { if (!element.open) element.showModal(); const frame = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(frame); }
    const timer = setTimeout(() => element.close(), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 250);
    return () => clearTimeout(timer);
  }, [open]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const close = () => { if (media.matches) { setEntered(false); setOpen(false); } };
    media.addEventListener("change", close); return () => media.removeEventListener("change", close);
  }, []);
  const closeDrawer = () => { setEntered(false); setOpen(false); };
  const label = active ? itemLabel(active) : t("title");
  const mobileItems = [
    { href: "/admin", label: nav("tabs.dash"), icon: Activity, selected: active === "dashboard" },
    { href: "/admin/users", label: t("groups.accounts"), icon: Users, selected: currentGroup.id === "accounts" },
    { href: "/admin/quarantine", label: t("groups.security"), icon: Shield, selected: currentGroup.id === "security" },
    { href: "/", label: nav("backToMail"), icon: ArrowLeft, selected: false },
  ];
  const mobileItemClass = (selected: boolean) => `relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-(--focus-ring) ${selected ? "bg-(--color-primary)/10 font-semibold text-(--color-primary-ink)" : "text-(--text-muted) hover:bg-(--control-hover)"}`;
  function navigation(mobile: boolean) {
    return <nav aria-label={t("navigation")} className="flex h-full min-h-0 w-full flex-col gap-4 bg-[#17181B] p-3 text-white">
      {mobile && <div className="flex items-center justify-between"><Link href="/" aria-disabled={mutationBusy} onClick={event => { if (mutationBusy) event.preventDefault(); else closeDrawer(); }} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs text-white/60 hover:bg-white/6 hover:text-white"><ArrowLeft size={14} />{nav("backToMail")}</Link><button data-admin-drawer-close type="button" aria-label={t("closeMenu")} onClick={closeDrawer} className="flex size-11 items-center justify-center rounded-full hover:bg-white/10"><X size={20} /></button></div>}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">{(mobile ? adminMenuGroups : [currentGroup]).map(group => <section key={group.id}><h2 className="mb-1 px-2.5 text-[10px] font-semibold tracking-wide text-white/45">{t(`groups.${group.id}`)}</h2><ul className="space-y-0.5">{group.items.map(id => <li key={id}><Link href={adminSectionHref(id)} aria-current={active === id ? "page" : undefined} aria-disabled={mutationBusy} onClick={event => { if (mutationBusy) event.preventDefault(); else closeDrawer(); }} className={`flex min-h-10 items-center gap-2.5 rounded-sm px-2.5 text-[12.5px] transition-colors ${active === id ? "bg-white/10 font-semibold text-white" : "text-white/60 hover:bg-white/6 hover:text-white"} ${mutationBusy ? "pointer-events-none opacity-50" : ""}`}><span aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${active === id ? "bg-(--color-primary-solid)" : "bg-white/30"}`} /><span className="min-w-0 flex-1">{itemLabel(id)}</span></Link></li>)}</ul></section>)}</div>
    </nav>;
  }
  return <ShellContext.Provider value={{ initial, setMutationBusy, actionsTarget }}><main className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-(--surface-muted) text-foreground">
    <header className="relative flex h-14 shrink-0 items-center border-b border-(--border-app) bg-background lg:h-auto lg:gap-x-4 lg:px-3 lg:py-2">
      <button type="button" aria-label={t("openMenu")} aria-haspopup="dialog" aria-expanded={open} aria-controls="admin-mobile-navigation" onClick={() => setOpen(true)} className="ml-2 shrink-0 rounded-(--radius-app) p-2 hover:bg-black/5 dark:hover:bg-white/10 lg:hidden"><Menu size={20} /></button>
      <Link href="/admin" aria-label={branding.displayName} aria-disabled={mutationBusy} onClick={event => { if (mutationBusy) event.preventDefault(); setQuery(""); }} className="flex h-full min-w-0 items-center gap-2 px-2 text-sm font-bold lg:shrink-0 lg:px-0"><BrandMark /><span className="max-w-36 truncate sm:max-w-48">{branding.displayName}</span> <span className="hidden text-(--text-muted) sm:inline">{t("title")}</span></Link>
      <form id="admin-header-search" role="search" aria-label={t("navigation")} className={`${searchOpen ? "block" : "hidden"} absolute inset-x-0 top-full z-50 border-b border-(--border-app) bg-background p-3 lg:relative lg:inset-auto lg:z-auto lg:ml-4 lg:block lg:w-full lg:max-w-96 lg:border-0 lg:p-0`} onSubmit={event => { event.preventDefault(); if (!mutationBusy && matches[0]) { const destination = adminSectionHref(matches[0].id); requestAction(() => { router.push(destination); setQuery(""); setSearchOpen(false); searchInput.current?.blur(); }); } }}>
        <div className="flex h-10 items-center gap-2 rounded-md border border-(--border-app) bg-(--surface-muted) px-3"><Search size={16} aria-hidden="true" /><input ref={searchInput} value={query} disabled={mutationBusy} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setQuery(""); event.currentTarget.blur(); } }} aria-label={`${t("navigation")} · ${common("search")}`} placeholder={`${t("navigation")} · ${common("search")}`} aria-controls="admin-navigation-results" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /><kbd className="hidden shrink-0 text-[10px] text-(--text-muted) sm:block">Ctrl K</kbd></div>
        {query.trim() && <ul id="admin-navigation-results" className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-(--border-app) bg-background p-1 shadow-xl">{matches.length ? matches.map(item => <li key={item.id}><Link href={adminSectionHref(item.id)} onClick={event => { if (mutationBusy) event.preventDefault(); else setQuery(""); }} className="flex min-h-11 items-center justify-between gap-2 rounded-sm px-3 text-xs hover:bg-(--surface-muted)"><span>{itemLabel(item.id)}</span><span className="text-(--text-muted)">{t(`groups.${item.group}`)}</span></Link></li>) : <li className="p-3 text-xs text-(--text-muted)">0</li>}</ul>}
      </form>
      <button type="button" aria-label={common("search")} aria-expanded={searchOpen} aria-controls="admin-header-search" onClick={() => { setSearchOpen(value => !value); if (!searchOpen) requestAnimationFrame(() => searchInput.current?.focus()); }} className="ml-auto shrink-0 rounded-(--radius-app) p-2 hover:bg-(--surface-muted) lg:hidden"><Search size={20} /></button>
      <Link href="/" aria-label={nav("backToMail")} aria-disabled={mutationBusy} onClick={event => { if (mutationBusy) event.preventDefault(); }} className="mr-2 flex min-h-11 shrink-0 items-center gap-2 rounded-md px-2 text-xs hover:bg-(--surface-muted) lg:ml-auto lg:mr-0"><ArrowLeft size={16} /><span className="hidden sm:inline">{nav("backToMail")}</span></Link>
    </header>
    <div className="flex min-h-0 flex-1">
      <aside className="hidden h-full w-62.5 shrink-0 border-r border-(--border-app) lg:flex">
        <nav aria-label={t("navigation")} className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-white/10 bg-[#17181B] py-3">{adminMenuGroups.map(group => { const Icon = groupIcons[group.id]; return <Tooltip key={group.id} content={t(`groups.${group.id}`)} side="bottom"><Link href={adminSectionHref(group.items[0])} aria-label={t(`groups.${group.id}`)} aria-current={currentGroup.id === group.id ? "true" : undefined} aria-disabled={mutationBusy} onClick={event => { if (mutationBusy) event.preventDefault(); }} className={`flex size-11 items-center justify-center rounded-sm transition-colors ${currentGroup.id === group.id ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/6 hover:text-white"}`}><Icon size={18} /></Link></Tooltip>; })}</nav>
        <div className="min-w-0 flex-1">{navigation(false)}</div>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-(--border-app) bg-background px-4 py-3"><div className="min-w-0 flex-1"><p className="mb-1 text-[10px] text-(--text-muted)">{t(`groups.${currentGroup.id}`)}</p><h1 className="text-lg font-semibold tracking-tight">{label}</h1></div><div ref={setActionsTarget} className="ml-auto flex flex-wrap items-center gap-2" /></header>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">{children}</div>
      </section>
    </div>
    <nav aria-label={t("navigation")} className="shrink-0 border-t border-(--border-app) bg-background px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:hidden"><div className="grid grid-cols-5 gap-1">
      {mobileItems.map(item => <Link key={item.href} href={item.href} aria-current={item.selected ? "page" : undefined} aria-disabled={mutationBusy} onClick={event => { if (mutationBusy) event.preventDefault(); }} className={mobileItemClass(item.selected)}><item.icon size={20} aria-hidden="true" /><span className="max-w-full truncate">{item.label}</span>{item.selected ? <span aria-hidden="true" className="absolute bottom-0 h-0.5 w-5 rounded-full bg-(--color-primary-solid)" /> : null}</Link>)}
      <button type="button" className={mobileItemClass(open)} onClick={() => setOpen(true)} aria-label={t("openMenu")} aria-haspopup="dialog" aria-expanded={open} aria-controls="admin-mobile-navigation"><Menu size={20} aria-hidden="true" /><span className="max-w-full truncate">{t("openMenu")}</span></button>
    </div></nav>
    <footer className="hidden shrink-0 flex-wrap items-center justify-between gap-2 border-t border-(--border-app) bg-background px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] text-[10px] text-(--text-muted) lg:flex"><span className="flex min-w-0 items-center gap-2"><Server size={12} aria-hidden="true" /><span className="truncate">{initial.service.hostname} · {initial.service.status}</span></span><span role="status">{mutationBusy ? service("loading") : nav("systemStatus")}</span><kbd className="hidden lg:inline">Ctrl K · {common("search")}</kbd></footer>
    <dialog id="admin-mobile-navigation" ref={dialog} aria-label={t("navigation")} onCancel={event => { event.preventDefault(); closeDrawer(); }} onClick={event => { if (event.target === event.currentTarget && event.clientX > event.currentTarget.getBoundingClientRect().right) closeDrawer(); }} className={`fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(280px,calc(100vw-48px))] max-w-none border-0 bg-[#17181B] p-0 shadow-2xl transition-transform duration-250 ease-out backdrop:bg-black/45 motion-reduce:transition-none ${entered ? "translate-x-0" : "-translate-x-full"}`}>{navigation(true)}</dialog>
  </main></ShellContext.Provider>;
}

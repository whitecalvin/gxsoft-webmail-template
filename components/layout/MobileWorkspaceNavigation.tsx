"use client";

import { CalendarDays, Inbox, Menu, Settings, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useMail } from "@/context/mail-context";

export function MobileWorkspaceNavigation({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  const t = useTranslations("workspaceSidebar");
  const tabs = useTranslations("bottomTabBar");
  const top = useTranslations("topBar");
  const pathname = usePathname();
  const { setActiveFolder } = useMail();
  const items = [
    { href: "/", label: tabs("mail"), icon: Inbox },
    { href: "/calendar", label: tabs("calendar"), icon: CalendarDays },
    { href: "/contacts", label: tabs("contacts"), icon: Users },
    { href: "/settings", label: tabs("settings"), icon: Settings },
  ];
  const itemClass = (active: boolean) => `relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-(--focus-ring) ${active ? "bg-(--color-primary)/10 font-semibold text-(--color-primary-ink)" : "text-(--text-muted) hover:bg-(--control-hover)"}`;
  return <nav aria-label={t("navigation")} className="shrink-0 border-t border-(--border-app) bg-background px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden">
    <div className="grid grid-cols-5 gap-1">
      {items.map(item => {
        const active = item.href === "/" ? pathname === "/" || pathname === "/search" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return <Link key={item.href} href={item.href} className={itemClass(active)} aria-current={active ? "page" : undefined}
          onClick={() => { if (item.href === "/") setActiveFolder("inbox"); }}>
          <item.icon size={20} aria-hidden="true" /><span className="max-w-full truncate">{item.label}</span>
          {active ? <span aria-hidden="true" className="absolute bottom-0 h-0.5 w-5 rounded-full bg-(--color-primary-solid)" /> : null}
        </Link>;
      })}
      <button type="button" onClick={onOpenMenu} className={itemClass(menuOpen)} aria-label={top("openMenu")} aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls={menuOpen ? "workspace-navigation-drawer" : undefined}>
        <Menu size={20} aria-hidden="true" /><span className="max-w-full truncate">{top("openMenu")}</span>
      </button>
    </div>
  </nav>;
}

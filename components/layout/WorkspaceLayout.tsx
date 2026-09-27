"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { TopBar } from "./TopBar";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { CustomizerPanel } from "@/components/customizer/CustomizerPanel";
import { ComposeModal } from "@/components/compose/ComposeModal";
import { useTheme } from "@/context/theme-context";
import { useWorkspaceSidebar } from "@/context/workspace-sidebar-context";
import { lockBodyScroll } from "@/lib/overlay-scroll-lock";

const DRAWER_TRANSITION_MS = 300;

export interface WorkspaceLayoutProps {
  children: ReactNode;
  title?: ReactNode;
  titleAsHeading?: boolean;
  headerActions?: ReactNode;
  onOpenTour?: () => void;
  onToggleDelegate?: () => void;
  showGlobalSearch?: boolean;
  showMobilePageContext?: boolean | "tablet";
  className?: string;
}

export function WorkspaceLayout({ children, title, titleAsHeading = true, headerActions, onOpenTour, onToggleDelegate, showGlobalSearch = false, showMobilePageContext = true, className = "" }: WorkspaceLayoutProps) {
  const tSidebar = useTranslations("workspaceSidebar");
  const { draft } = useTheme();
  const { collapsed, toggleCollapsed } = useWorkspaceSidebar();
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!drawerMounted) return;
    return lockBodyScroll();
  }, [drawerMounted]);

  useEffect(() => {
    if (!drawerMounted) return;
    const frame = window.requestAnimationFrame(() => setDrawerOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [drawerMounted]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  const openDrawer = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    if (drawerMounted) {
      setDrawerOpen(true);
    } else {
      setDrawerMounted(true);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reduceMotion === "true") {
      setDrawerMounted(false);
      if (!document.querySelector("[data-compose-dialog]")) menuButtonRef.current?.focus();
      closeTimerRef.current = null;
      return;
    }
    closeTimerRef.current = window.setTimeout(() => {
      setDrawerMounted(false);
      if (!document.querySelector("[data-compose-dialog]")) menuButtonRef.current?.focus();
      closeTimerRef.current = null;
    }, DRAWER_TRANSITION_MS);
  };

  const handleDrawerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <a href="#workspace-main" className="sr-only fixed left-3 top-3 z-(--layer-tooltip) rounded-(--radius-app) bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-(--shadow-panel) focus:not-sr-only">
        {tSidebar("skipToContent")}
      </a>
      <div className={`workspace-density flex h-dvh w-full overflow-hidden bg-background text-foreground ${draft.sidebarPosition === "right" ? "xl:flex-row-reverse" : "xl:flex-row"}`}>
        <div className={`relative hidden h-full shrink-0 xl:block ${draft.sidebarPosition === "right" ? "border-l" : "border-r"} border-(--border-app)`}>
          <WorkspaceSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TopBar title={title} titleAsHeading={titleAsHeading} actions={headerActions} menuButtonRef={menuButtonRef} onMenuClick={openDrawer} menuOpen={drawerOpen} onOpenTour={onOpenTour} onToggleDelegate={onToggleDelegate} showGlobalSearch={showGlobalSearch} showMobilePageContext={showMobilePageContext} showDesktopBrand={collapsed} />
          <main id="workspace-main" tabIndex={-1} className={`min-h-0 min-w-0 flex-1 ${className}`}>{children}</main>
        </div>
      </div>
      {drawerMounted ? (
        <div className="fixed inset-0 z-(--layer-drawer) xl:hidden">
          <button type="button" className={`absolute inset-0 bg-black/45 transition-opacity duration-300 ease-out motion-reduce:transition-none ${drawerOpen ? "opacity-100" : "opacity-0"}`} onClick={closeDrawer} aria-label={tSidebar("closeMenu")} />
          <div id="workspace-navigation-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label={tSidebar("navigation")} onKeyDown={handleDrawerKeyDown} className={`relative h-full w-fit transform-gpu transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none ${draft.sidebarPosition === "right" ? "ml-auto" : ""} ${drawerOpen ? "translate-x-0" : draft.sidebarPosition === "right" ? "translate-x-full" : "-translate-x-full"}`}>
            <WorkspaceSidebar mobile onClose={closeDrawer} />
          </div>
        </div>
      ) : null}
      <ComposeModal />
      <CustomizerPanel />
    </>
  );
}

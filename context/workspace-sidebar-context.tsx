"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { navigationCookieName, persistNavigationCookie, SIDEBAR_GROUP_KEYS, type SidebarGroups } from "@/lib/workspace-navigation";
import { WORKSPACE_SIDEBAR_COOKIE_MAX_AGE, WORKSPACE_SIDEBAR_COOKIE_NAME } from "@/lib/workspace-sidebar";

interface WorkspaceSidebarContextValue {
  collapsed: boolean;
  toggleCollapsed: () => void;
  collapsedGroups: Record<string, boolean>;
  toggleGroup: (key: string) => void;
}

const WorkspaceSidebarContext =
  createContext<WorkspaceSidebarContextValue | null>(null);

function persistCollapsedState(collapsed: boolean) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${WORKSPACE_SIDEBAR_COOKIE_NAME}=${collapsed ? "1" : "0"}; Path=/; Max-Age=${WORKSPACE_SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

export function WorkspaceSidebarProvider({
  children,
  initialCollapsed,
  initialGroups = {},
  navigationAccount,
}: {
  children: ReactNode;
  initialCollapsed: boolean;
  initialGroups?: SidebarGroups;
  navigationAccount?: string;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [collapsedGroups, setCollapsedGroups] = useState<SidebarGroups>(initialGroups);
  const groupsRef = useRef(initialGroups);
  const toggleGroup = useCallback((key: string) => {
    if (!SIDEBAR_GROUP_KEYS.some(group => group === key)) return;
    const group = key as typeof SIDEBAR_GROUP_KEYS[number];
    const next = { ...groupsRef.current, [group]: !groupsRef.current[group] };
    groupsRef.current = next;
    setCollapsedGroups(next);
    if (navigationAccount) persistNavigationCookie(navigationCookieName("groups", navigationAccount), next);
  }, [navigationAccount]);

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    persistCollapsedState(next);
  }, [collapsed]);

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, collapsedGroups, toggleGroup }),
    [collapsed, toggleCollapsed, collapsedGroups, toggleGroup]
  );

  return (
    <WorkspaceSidebarContext.Provider value={value}>
      {children}
    </WorkspaceSidebarContext.Provider>
  );
}

export function useWorkspaceSidebar() {
  const context = useContext(WorkspaceSidebarContext);
  if (!context) {
    throw new Error(
      "useWorkspaceSidebar must be used within WorkspaceSidebarProvider"
    );
  }
  return context;
}

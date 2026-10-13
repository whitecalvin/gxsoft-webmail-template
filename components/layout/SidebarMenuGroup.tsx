"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useWorkspaceSidebar } from "@/context/workspace-sidebar-context";

export function SidebarMenuGroup({ groupKey, title, compact, first = false, children }: {
  groupKey: string; title: string; compact: boolean; first?: boolean; children: ReactNode;
}) {
  const id = useId();
  const headingId = `${id}-heading`;
  const panelId = `${id}-panel`;
  const { collapsedGroups, toggleGroup } = useWorkspaceSidebar();
  const expanded = compact || !collapsedGroups[groupKey];
  return <section aria-labelledby={compact ? undefined : headingId} aria-label={compact ? title : undefined}>
    {compact ? !first ? <div className="mx-2 my-2 border-t border-(--border-app)" /> : null :
      <h2 className={first ? "mb-1" : "mb-1 mt-2"}>
        <button id={headingId} type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => toggleGroup(groupKey)}
          className="workspace-menu-surface flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-(--text-muted) outline-none transition hover:bg-(--surface-muted) focus-visible:ring-2 focus-visible:ring-(--focus-ring) md:[@media(pointer:fine)]:min-h-8">
          <span className="min-w-0 truncate">{title}</span>
          <ChevronDown size={15} aria-hidden="true" className={`shrink-0 transition-transform motion-reduce:transition-none ${expanded ? "" : "-rotate-90"}`} />
        </button>
      </h2>}
    <div id={panelId} hidden={!expanded}>{children}</div>
  </section>;
}

"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, CheckCheck, Copy, Download, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Tooltip } from "@/components/ui/Tooltip";

type Item = { key: string; name: string; kind: string; enabled: boolean };
export function MailRuleSidebar({ rules, selected, disabled, checking, importing, applicationLocked, applicationPanel, renderApplication, onSelect, onAdd, onMove, onCheck, onDuplicate, onDelete, onToggle, onImport, onExport }: {
  rules: Item[]; selected: Item | null; disabled: boolean; checking: boolean; importing: boolean;
  onSelect: (key: string) => void; onAdd: () => void; onMove: (offset: -1 | 1) => void;
  onCheck: () => void; onDuplicate: () => void; onDelete: () => void; onToggle: () => void;
  onImport: (file: File) => void; onExport: () => void;
  applicationLocked?: boolean; applicationPanel?: ReactNode; renderApplication?: (key: string) => ReactNode;
}) {
  const live = useTranslations("rulesLive"), t = useTranslations("ruleManager"), designer = useTranslations("ruleDesigner"), common = useTranslations("workspaceSidebar");
  const [query, setQuery] = useState("");
  const file = useRef<HTMLInputElement>(null);
  return <nav data-rule-sidebar aria-label={designer("list")} className="flex min-h-0 min-w-0 flex-col border-b border-(--border-app) bg-(--surface-muted) lg:border-r lg:border-b-0">
    <div className="space-y-2 p-3" inert={applicationLocked}>
      <div data-rule-search-actions className="flex items-center gap-1"><div className="min-w-0 flex-1"><Input aria-label={common("search")} placeholder={common("search")} value={query} onChange={e => setQuery(e.target.value)} /></div><Tooltip content={live("add")}><Button size="icon" variant="ghost" aria-label={live("add")} disabled={disabled || rules.length >= 50} onClick={onAdd}><Plus size={16} /></Button></Tooltip></div>
      <h3 className="text-sm font-semibold">{designer("list")} <span className="text-xs font-normal text-(--text-muted)">{rules.length}/50</span></h3>
      <p className="text-xs text-(--text-muted)">{designer("orderHelp")}</p>
      <div data-rule-tools className="flex items-center gap-1">
        <Tooltip content={live("validate")}><Button size="icon" variant="ghost" aria-label={live("validate")} disabled={disabled || !selected || checking} loading={checking} onClick={onCheck}><CheckCheck size={16} /></Button></Tooltip>
        <Tooltip content={live("moveUp")}><Button size="icon" variant="ghost" aria-label={live("moveUp")} disabled={disabled || !selected || rules[0]?.key === selected.key} onClick={() => onMove(-1)}><ArrowUp size={16} /></Button></Tooltip>
        <Tooltip content={live("moveDown")}><Button size="icon" variant="ghost" aria-label={live("moveDown")} disabled={disabled || !selected || rules.at(-1)?.key === selected.key} onClick={() => onMove(1)}><ArrowDown size={16} /></Button></Tooltip>
        <div className="ml-auto flex items-center gap-2"><span className="text-xs text-(--text-muted)">{selected?.enabled ? live("enabled") : live("disabled")}</span><Tooltip content={selected?.enabled ? t("disable") : t("enable")}><span className="inline-flex"><Switch on={selected?.enabled ?? false} disabled={disabled || !selected} onToggle={onToggle} label={t("toggle")} /></span></Tooltip></div>
      </div>
    </div>
    <ol className="flex max-h-56 min-h-0 flex-1 flex-col space-y-1 overflow-y-auto px-3 lg:max-h-[36rem]">{rules.map((rule, index) => rule.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ? <li key={rule.key} inert={applicationLocked} data-rule-list-item className={`workspace-menu-surface flex shrink-0 items-center gap-1 pr-2 hover:bg-background ${selected?.key === rule.key ? "bg-(--color-primary)/10" : ""}`}>
      <button type="button" aria-current={selected?.key === rule.key ? "true" : undefined} onClick={() => onSelect(rule.key)} className="flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-[inherit] px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"><span className="text-xs text-(--text-muted)">{index + 1}.</span><span className="min-w-0 flex-1"><span className="block break-words font-medium">{rule.name || live("newName")}</span><span className="mt-1 block text-xs text-(--text-muted)">{live(rule.kind)} · {live(rule.enabled ? "enabled" : "disabled")}</span></span></button>
      {renderApplication?.(rule.key)}
    </li> : null)}
      {applicationPanel ? <li data-rule-application-footer className="sticky bottom-0 z-10 mt-auto shrink-0 border-t border-(--border-app) bg-(--surface-muted) pb-3"><div className="max-h-[55dvh] overflow-y-auto">{applicationPanel}</div></li> : null}
    </ol>
    <div data-rule-footer inert={applicationLocked} className="mt-auto flex flex-wrap items-center gap-1 border-t border-(--border-app) px-2 py-3">
      <Button size="sm" variant="ghost" className="px-2 text-xs" disabled={disabled || !selected || rules.length >= 50} leadingIcon={<Copy size={14} />} onClick={onDuplicate}>{t("duplicate")}</Button>
      <Button size="sm" variant="ghost" className="px-2 text-xs text-(--status-danger)" disabled={disabled || !selected} leadingIcon={<Trash2 size={14} />} onClick={onDelete}>{live("remove")}</Button>
      <div className="ml-auto flex items-center gap-1">
        <Tooltip content={t("import")}><Button size="icon" variant="ghost" aria-label={t("import")} disabled={disabled || importing || rules.length >= 50} onClick={() => file.current?.click()}><Upload size={16} /></Button></Tooltip>
        <Tooltip content={t("export")}><Button size="icon" variant="ghost" aria-label={t("export")} disabled={!rules.length} onClick={onExport}><Download size={16} /></Button></Tooltip>
      </div>
      <input ref={file} type="file" accept="application/json,.json" className="hidden" aria-label={t("import")} onChange={e => { const selectedFile = e.target.files?.[0]; e.target.value = ""; if (selectedFile) onImport(selectedFile); }} />
    </div>
  </nav>;
}

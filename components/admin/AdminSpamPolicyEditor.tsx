"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { AdminListInput } from "./AdminListInput";
import { adminFieldBounds, managementFields, type AdminRow } from "@/lib/tastemail/admin-management";
import { adminFieldLabels } from "@/lib/admin-form";
import { adminSpamPolicyGroups, adminSpamThresholdIssue } from "@/lib/admin-spam-policy";

export function AdminSpamPolicyEditor({ input, disabled, showValidation, onChange }: {
  input: Record<string, unknown>;
  disabled: boolean;
  showValidation: boolean;
  onChange: (name: string, value: AdminRow[string]) => void;
}) {
  const t = useTranslations("adminSpamPolicy"), labels = useTranslations();
  const issue = showValidation ? adminSpamThresholdIssue(input) : null;
  const controlStyle = "w-full min-w-0 rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-foreground outline-none focus:ring-2 focus:ring-(--focus-ring)";
  const fieldLabel = (name: string) => labels(adminFieldLabels[name]);
  const jump = (key: string) => {
    const section = document.getElementById(`admin-policy-${key}`);
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({ block: "start" });
  };
  return <fieldset disabled={disabled} className="space-y-5">
    <nav aria-label={labels("adminManage.spam-policy")} className="flex flex-wrap gap-1">
      {adminSpamPolicyGroups.map(group => <Button key={group.key} size="sm" variant="ghost" disabled={disabled} onClick={() => jump(group.key)}>{t(group.key)}</Button>)}
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => jump("review")}>{labels("adminManage.save")}</Button>
    </nav>
    {adminSpamPolicyGroups.map(group => <section key={group.key} id={`admin-policy-${group.key}`} tabIndex={-1} aria-labelledby={`admin-policy-heading-${group.key}`} className="space-y-4 border-b border-(--border-app) pb-5 outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)">
      <header className="space-y-1"><h4 id={`admin-policy-heading-${group.key}`} className="font-semibold">{t(group.key)}</h4><p className="text-sm text-(--text-muted)">{t(`${group.key}Hint`)}</p></header>
      <div className="grid gap-4 sm:grid-cols-2">{group.fields.map(name => {
        const spec = managementFields("spam-policy", "edit").find(field => field.name === name)!;
        const id = `admin-field-${name}`, error = issue?.field === name;
        return <div key={name} className="flex min-w-0 flex-col gap-2 text-sm">
          <label htmlFor={id}>{fieldLabel(name)}</label>
          {spec.type === "boolean" ? <input id={id} type="checkbox" checked={input[name] === true} onChange={event => onChange(name, event.target.checked)} className="size-5 accent-(--color-primary)" />
            : spec.type === "list" ? <AdminListInput id={id} value={input[name] as string[]} rows={4} maxLength={65535} disabled={disabled} className={`${controlStyle} min-h-24 py-2`} onChange={value => onChange(name, value)} />
            : <input id={id} type="number" {...adminFieldBounds(name)} required={spec.type !== "nullableNumber"} value={input[name] === null ? "" : String(input[name] ?? "")} aria-invalid={error || undefined} aria-describedby={error ? `${id}-error` : undefined} onChange={event => onChange(name, event.target.value === "" && spec.type === "nullableNumber" ? null : event.target.value)} className={`${controlStyle} app-control`} />}
          {error && issue && <p id={`${id}-error`} role="alert" className="text-sm text-(--status-danger)">{t("thresholdOrder", { lower: fieldLabel(issue.lower), upper: fieldLabel(issue.upper) })}</p>}
        </div>;
      })}</div>
    </section>)}
    <p className="text-sm text-(--text-muted)">{t("reviewHint")}</p>
  </fieldset>;
}

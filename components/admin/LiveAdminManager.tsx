"use client";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AdminPageActions } from "./AdminShell";
import { Button } from "@/components/ui/Button";
import { AdminQuotaInput } from "./AdminQuotaInput";
import { AdminListInput } from "./AdminListInput";
import { AdminLicenseFilePicker } from "./AdminLicenseFilePicker";
import { AdminSpamPolicyEditor } from "./AdminSpamPolicyEditor";
import { adminSpamThresholdIssue } from "@/lib/admin-spam-policy";
import { adminInitialReadGate } from "@/lib/admin-initial-read";
import { adminDkimSuggestedSelector, type AdminDkimDomain } from "@/lib/admin-dkim-selection";
import { CopyValueButton } from "@/components/ui/CopyValueButton";
import { AdminDkimOverview } from "./AdminDkimOverview";
import { adminDkimActionAllowed } from "@/lib/tastemail/admin-management";
import { SystemErrorNotice } from "@/components/toast/SystemErrorNotice";
import { adminColumns, adminFilterKey, adminFieldBounds, adminFieldOptions, adminListOptions, allowedAdminAction, adminMutationPlan, adminQueueMutableStatus, managementFields, type AdminDataset, type AdminResource, type AdminRow } from "@/lib/tastemail/admin-management";
import { adminCommandTargetMatches, adminConfirmation, adminFieldLabels, adminValueLabel, prepareAdminCommand, type AdminCommand } from "@/lib/admin-form";
import { chosenAdminTheme, themeChoiceKey } from "@/lib/tastemail/admin-theme-catalog";
import { AdminUserDeletionReport } from "./AdminUserDeletionReport";
import { ConfirmDialog } from "@/components/overlay/ConfirmDialog";
import { useAdminDraftGuard, useAdminDraftProtection } from "./AdminDraftGuard";
import type { AdminSetupStage } from "@/lib/admin-setup-navigation";

export function LiveAdminManager({ resource, initialData, initialError, dkimDomains, onBusyChange, fixedDomain, refreshPageOnMutation, setupStage }: { resource: AdminResource; initialData?: AdminDataset; initialError?: string; dkimDomains?: AdminDkimDomain[]; onBusyChange?: (busy: boolean) => void; fixedDomain?: string; refreshPageOnMutation?: boolean; setupStage?: AdminSetupStage }) {
  const t = useTranslations("adminManage"), service = useTranslations("liveService"), pages = useTranslations("mailboxesLive");
  const labels = useTranslations(), format = useFormatter(), rules = useTranslations("rulesLive");
  const queue = useTranslations("adminQueue");
  const fieldLabel = (key: string) => adminFieldLabels[key] ? labels(adminFieldLabels[key]) : key.replace(/([a-z])([A-Z])/g, "$1 $2");
  const valueLabel = (key: string, value: string) => { if (key === "tlsMode" && value === "local_loopback") return t("localRelay"); const message = adminValueLabel(resource, key, value); return message ? labels(message) : value; };
  function fieldValue(key: string, value: AdminRow[string]) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return rules(value ? "yes" : "no");
    if (Array.isArray(value)) return value.join(", ") || "—";
    if (/Bytes$/.test(key) && /^\d+$/.test(String(value))) return `${format.number(BigInt(value), { maximumFractionDigits: 0 })} B`;
    if (typeof value === "number") return format.number(value);
    if (/(?:At|validUntil)$/.test(key) && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value))) return format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
    return valueLabel(key, value);
  }
  const router = useRouter();
  const [data, setData] = useState<AdminDataset | null>(initialData ?? null);
  const initialQuery = resource === "queue" ? "active" : resource === "dkim" ? initialData?.dkim?.domain ?? "" : "";
  const [filter, setFilter] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [actorFilter, setActorFilter] = useState(""), [actorQuery, setActorQuery] = useState("");
  const [cursor, setCursor] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Record<string, string>[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [licenseReading, setLicenseReading] = useState(false);
  const [showPolicyValidation, setShowPolicyValidation] = useState(false);
  const licenseReadInFlight = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const initialRead = useRef(adminInitialReadGate(initialData !== undefined || initialError !== undefined || dkimDomains !== undefined, JSON.stringify({ resource, query: initialQuery, actorQuery: "", cursor: {}, revision: 0 })));
  const [notice, setNotice] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [packageFile, setPackageFile] = useState<File | null>(null);
  const [command, setCommand] = useState<AdminCommand | null>(null);
  const [originalInput, setOriginalInput] = useState("");
  const { requestAction } = useAdminDraftGuard();
  useAdminDraftProtection(!!command && (JSON.stringify(command.input) !== originalInput || packageFile !== null), saving || licenseReading);
  const [details, setDetails] = useState<AdminRow | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [deletionConfirmation, setDeletionConfirmation] = useState<AdminCommand | null>(null);
  const approvedDeletion = useRef<AdminCommand | null>(null);
  const inFlight = useRef(false), writeBlocked = useRef(false), alive = useRef(true);
  const retiredCommand = useRef<AdminCommand | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => { if (details) detailRef.current?.focus(); }, [details]);
  useEffect(() => { onBusyChange?.(saving || licenseReading); }, [saving, licenseReading, onBusyChange]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (initialRead.current(JSON.stringify({ resource, query, actorQuery, cursor, revision }))) return;
    const controller = new AbortController(); let active = true;
    async function load() {
      if ((resource === "domain-theme" || resource === "dkim") && !query) { setData(null); setError(null); setLoading(false); return; }
      setLoading(true); setError(current => current === "conflict" ? current : null);
      const params = new URLSearchParams(cursor);
      const key = adminFilterKey(resource);
      if (query && key) params.set(key, query);
      if (resource === "audit" && actorQuery) params.set("actorUserId", actorQuery);
      if (resource === "users" && fixedDomain) params.set("domain", fixedDomain);
      try {
        const response = await fetch(`/api/mail/admin/manage/${resource}?${params}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (!response.ok) throw new Error(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rateLimited" : response.status === 400 ? "invalid_request" : "retryable");
        const snapshot: AdminDataset = await response.json();
        if (active) setData(snapshot);
      } catch (error) { if (active) { setData(null); setError(error instanceof Error ? error.message : "retryable"); } }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; controller.abort(); };
  }, [resource, query, actorQuery, cursor, revision, fixedDomain]);
  const formTarget = command?.row;
  useEffect(() => { if (formTarget) { formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); formRef.current?.querySelector<HTMLElement>("input:not([type=checkbox]), select, textarea")?.focus({ preventScroll: true }); } }, [formTarget]);
  function begin(action: string, row: AdminRow = {}) {
    if (loading || saving || licenseReadInFlight.current || uncertain || writeBlocked.current || (resource === "dkim" && !query) || !allowedAdminAction(resource, action)) return;
    if (resource === "queue" && !adminQueueMutableStatus(row.status)) return;
    if (resource === "dkim" && !adminDkimActionAllowed(action, row, data?.dkim, query)) return;
    requestAction(() => { const next = prepareAdminCommand(resource, action, row, query, fixedDomain); if (resource === "dkim" && action === "create") next.input.selector = adminDkimSuggestedSelector(data?.dkim?.observedAt); setOriginalInput(JSON.stringify(next.input)); setConfirmed(false); setNotice(false); setPackageFile(null); setDetails(null); setCommand(next); });
  }
  function applyFilter(event: React.FormEvent) {
    event.preventDefault();
    const destination = filter.trim();
    requestAction(() => {
      if (resource === "dkim" && setupStage) {
        router.push(`/admin/onboarding?${new URLSearchParams({ stage: setupStage, domain: destination })}`);
        return;
      }
      setCommand(null); setConfirmed(false); setDetails(null); setQuery(destination); setActorQuery(actorFilter.trim()); setCursor({}); setHistory([]); setRevision(n => n + 1);
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!command || command === retiredCommand.current || !confirmed || inFlight.current || licenseReadInFlight.current || uncertain || writeBlocked.current) return;
    if (resource === "dkim" && !adminDkimActionAllowed(command.action, command.row, data?.dkim, query)) { setError("invalid_request"); setConfirmed(false); return; }
    if (resource === "spam-policy") {
      const issue = adminSpamThresholdIssue(command.input);
      setShowPolicyValidation(true);
      if (issue) { setError("invalid_request"); formRef.current?.querySelector<HTMLElement>(`#admin-field-${issue.field}`)?.focus(); return; }
    }
    if (resource === "queue" && !adminQueueMutableStatus(command.row.status)) { setError("invalid_request"); setConfirmed(false); return; }
    if (!adminCommandTargetMatches(resource, command, query)) { setError("invalid_request"); setConfirmed(false); return; }
    const upload = resource === "theme-packages" && command.action === "create";
    if (managementFields(resource, command.action).some(field => field.name === "themeId") && !chosenAdminTheme(data?.themeChoices, command.input)) { setError("invalid_request"); return; }
    if (upload && (!packageFile || !packageFile.name.toLowerCase().endsWith(".zip") || packageFile.size === 0 || packageFile.size > 50 * 1024 * 1024)) { setError("invalid_request"); return; }
    if (command.action === "delete" && command.input.confirmation !== adminConfirmation(resource, command.row)) { setError("invalid_request"); return; }
    if (resource === "users" && command.action === "delete" && command.row.enabled !== false) { setError("invalid_request"); return; }
    if (!upload) {
      try { adminMutationPlan({ resource, action: command.action, id: resource === "dkim" ? command.row.selector : command.row.id, input: command.input, confirmed: true }); }
      catch { setError("invalid_request"); return; }
    }
    if ((command.action === "delete" || resource === "queue" && command.action === "cancel") && approvedDeletion.current !== command) { setDeletionConfirmation(command); return; }
    approvedDeletion.current = null;
    inFlight.current = true; onBusyChange?.(true); setSaving(true); setError(null);
    try {
      const response = await fetch(upload ? "/api/mail/admin/theme-package" : "/api/mail/admin/manage", { method: "POST", headers: upload ? { "Content-Type": "application/zip", "x-gxwebmail-confirm": "install-theme" } : { "Content-Type": "application/json" }, body: upload ? packageFile : JSON.stringify({ resource, action: command.action, id: resource === "dkim" ? command.row.selector : command.row.id, input: command.input, confirmed: true }), signal: AbortSignal.timeout(upload ? 45_000 : 15_000) });
      const result = await response.json();
      if (!response.ok || result.status !== "updated") {
        if (response.ok || result.status === "mutationUncertain" || response.status >= 500) writeBlocked.current = true;
        if (alive.current) {
          setError(result.status ?? "uncertain");
          if (writeBlocked.current) setUncertain(true);
          if (response.status === 409) { retiredCommand.current = command; setCommand(null); setDetails(null); setConfirmed(false); setRevision(n => n + 1); }
        }
        return;
      }
      retiredCommand.current = command;
      if (alive.current) { setCommand(null); setDetails(null); setNotice(true); setSecret(typeof result.secret === "string" ? result.secret : null); setRevision(n => n + 1); if (result.currentSessionRevoked) router.replace("/login"); else if (refreshPageOnMutation || ["branding", "themes", "domain-theme", "theme-packages"].includes(resource)) router.refresh(); }
    } catch { writeBlocked.current = true; if (alive.current) { setUncertain(true); setError("mutationUncertain"); } }
    finally { inFlight.current = false; if (alive.current) { setSaving(false); onBusyChange?.(false); } }
  }
  const actions = ["edit", "address", "password", "submission-limit", "retry", "cancel", "activate", "rollback", "claim", "delete"];
  const commandTarget = command ? String(command.row.address ?? command.row.name ?? command.row.recipient ?? command.row.selector ?? "") : "";
  const readBlocked = error === "unauthorized" || error === "forbidden";
  const errorText = uncertain ? t("uncertain") : error === "invalid_request" ? t(command ? "invalidInput" : "invalidQuery") : ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable", "conflict"].includes(error ?? "") ? service(error!) : service("unavailable");
  const inputStyle = "min-h-11 w-full min-w-0 rounded-(--radius-app) border border-(--border-app) bg-background px-3 text-foreground outline-none focus:ring-2 focus:ring-(--focus-ring)";
  return <section className="space-y-5" aria-busy={loading || saving}>
    <AdminPageActions><Button disabled={loading || saving} onClick={() => setRevision(n => n + 1)}>{t("refresh")}</Button>{allowedAdminAction(resource, "create") && <Button variant="primary" disabled={loading || saving || uncertain || readBlocked || (resource === "dkim" && !adminDkimActionAllowed("create", {}, data?.dkim, query))} onClick={() => begin("create")}>{t("create")}</Button>}</AdminPageActions>
    {adminFilterKey(resource) && <form className={resource === "audit" ? "grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" : "flex gap-2"} onSubmit={applyFilter}>
      {resource === "dkim" && dkimDomains !== undefined ? <CustomSelect aria-label={fieldLabel("domain")} value={filter} disabled={saving || loading || !dkimDomains.length} onChange={event => setFilter(event.target.value)} className={inputStyle}>{dkimDomains.map(domain => <option key={domain.id} value={domain.name}>{domain.name}</option>)}</CustomSelect> : resource === "queue" ? <CustomSelect aria-label={t("filter")} value={filter} onChange={event => setFilter(event.target.value)} className={inputStyle}>{["", "active", "pending", "deferred", "in_progress", "delivered", "failed", "cancelled", "all"].map(status => <option key={status} value={status}>{status ? valueLabel("status", status) : t("queue")}</option>)}</CustomSelect> : <input aria-label={resource === "audit" ? fieldLabel("eventType") : t("filter")} placeholder={resource === "users" ? t("users") : resource === "audit" ? fieldLabel("eventType") : resource === "domain-theme" ? t("domainId") : resource === "forwarding" ? fieldLabel("userId") : fieldLabel("domain")} maxLength={resource === "audit" ? 128 : resource === "dkim" ? 254 : 120} pattern={resource === "audit" ? "[a-z0-9._-]{1,128}" : undefined} value={filter} onChange={event => setFilter(event.target.value)} className={inputStyle} />}
      {resource === "audit" && <input aria-label={`${fieldLabel("actorUserId")} · UUID`} placeholder={`${fieldLabel("actorUserId")} · UUID`} maxLength={36} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" value={actorFilter} onChange={event => setActorFilter(event.target.value)} className={inputStyle} />}
      <Button type="submit" disabled={saving || loading || (resource === "dkim" && dkimDomains !== undefined && !dkimDomains.length)}>{t("filter")}</Button>
    </form>}
    {resource === "dkim" && !query && <p role="status">{t("dkimDomainRequired")}</p>}
    {resource === "dkim" && data?.dkim && !readBlocked && <AdminDkimOverview info={data.dkim} keys={data.items} />}
    {loading && <p role="status">{service("loading")}</p>}
    {error && <SystemErrorNotice message={errorText} className="rounded-lg border border-(--border-app) bg-background p-4" />}
    {notice && <p role="status">{t("completed")}</p>}
    {details && !readBlocked && <section ref={detailRef} tabIndex={-1} aria-labelledby="admin-record-title" className="rounded-sm border border-(--border-app) bg-background p-4 outline-none focus:ring-2 focus:ring-(--focus-ring)"><header className="mb-4 flex items-center justify-between gap-3"><h2 id="admin-record-title" className="font-semibold">{t(resource)} · {labels("adminBulk.view")}</h2><Button onClick={() => setDetails(null)}>{t("cancel")}</Button></header><dl className="grid gap-4 sm:grid-cols-2">{Object.entries(details).map(([key, value]) => <div key={key} className="min-w-0"><dt className="mb-1 text-xs text-(--text-muted)">{fieldLabel(key)}</dt><dd className="whitespace-pre-wrap break-all text-sm">{fieldValue(key, value)}</dd>{resource === "dkim" && ["dnsName", "dnsTxtValue"].includes(key) && typeof value === "string" && <CopyValueButton value={value} label={fieldLabel(key)} />}</div>)}</dl></section>}
    {secret && <section className="space-y-2 rounded-lg border border-(--border-app) bg-background p-4"><p>{t("secretNotice")}</p><input readOnly autoComplete="off" spellCheck={false} aria-label={t("secretNotice")} value={secret} onFocus={event => event.target.select()} className={inputStyle} /><div className="flex flex-wrap items-center gap-2"><CopyValueButton value={secret} label={t(resource)} /><Button onClick={() => setSecret(null)}>{t("cancel")}</Button></div></section>}
    {command && !readBlocked && <form ref={formRef} onSubmit={submit} className="space-y-4 rounded-xl border border-(--border-app) bg-background p-5">
      <fieldset disabled={licenseReading} className="space-y-4">
      <h3 className="font-bold">{resource === "queue" && command.action === "cancel" ? queue("cancelDelivery") : t(command.action)}{commandTarget ? ` · ${commandTarget}` : ""}</h3>
      {resource === "spam-policy" && <AdminSpamPolicyEditor input={command.input} disabled={saving || uncertain} showValidation={showPolicyValidation} onChange={(name, value) => { setConfirmed(false); setShowPolicyValidation(false); setError(null); setCommand({ ...command, input: { ...command.input, [name]: value } }); }} />}
      {resource === "license" && command.action === "create" && <AdminLicenseFilePicker key={originalInput} disabled={saving || uncertain || licenseReading} onBusyChange={busy => { licenseReadInFlight.current = busy; if (alive.current) { setLicenseReading(busy); onBusyChange?.(busy || saving); } }} onValue={value => { setConfirmed(false); approvedDeletion.current = null; setError(null); setCommand(current => current?.row === command.row && current.action === "create" ? { ...current, input: { ...current.input, file: value } } : current); }} onError={() => setError("invalid_request")} />}
      {resource === "users" && command.action === "delete" && <><AdminUserDeletionReport key={String(command.row.id)} userId={String(command.row.id)} />{command.row.enabled !== false && <p role="note">{labels("adminDeletion.enabled")}</p>}</>}
      {resource === "smtp-relay" && command.input.tlsMode === "local_loopback" && <p role="note" className="text-sm text-(--text-muted)">{t("localRelayNotice")}</p>}
      {managementFields(resource, command.action).some(field => field.name === "themeId") && <label className="flex flex-col gap-2 text-sm"><span>{t("themes")}</span><CustomSelect required disabled={saving || uncertain} className={inputStyle} value={chosenAdminTheme(data?.themeChoices, command.input) ? themeChoiceKey(chosenAdminTheme(data?.themeChoices, command.input)!) : ""} onChange={event => { const choice = data?.themeChoices?.find(item => themeChoiceKey(item) === event.target.value); if (choice) { setConfirmed(false); setCommand({ ...command, input: { ...command.input, themeId: choice.id, themeVersion: choice.version ?? "" } }); } }}><option disabled value="">—</option>{data?.themeChoices?.map(choice => <option key={themeChoiceKey(choice)} value={themeChoiceKey(choice)}>{choice.id}{choice.version ? ` · ${choice.version}` : ""}</option>)}</CustomSelect></label>}
      {resource === "theme-packages" && command.action === "create" && <input type="file" accept=".zip,application/zip" required disabled={saving || uncertain} aria-label={t("theme-packages")} onChange={event => { setConfirmed(false); setPackageFile(event.target.files?.[0] ?? null); }} className={inputStyle} />}
{resource !== "spam-policy" && <fieldset disabled={saving || uncertain} onChange={() => setConfirmed(false)} className="grid gap-4 sm:grid-cols-2">{managementFields(resource, command.action).filter(spec => spec.name !== "themeId" && spec.name !== "themeVersion").map(spec => <div key={spec.name} className="flex min-w-0 flex-col gap-2 text-sm"><label id={`admin-label-${spec.name}`} htmlFor={`admin-field-${spec.name}`}>{fieldLabel(spec.name)}</label>{spec.name === "quotaBytes" ? <AdminQuotaInput id={`admin-field-${spec.name}`} value={command.input[spec.name]} required={spec.required} disabled={saving || uncertain} onChange={bytes => { setConfirmed(false); setCommand({ ...command, input: { ...command.input, [spec.name]: bytes } }); }} /> : adminListOptions(resource, spec.name) ? <div role="group" aria-labelledby={`admin-label-${spec.name}`} className="grid gap-2 rounded-md border border-(--border-app) p-3">{adminListOptions(resource, spec.name)!.map(option => <label key={option} className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={(command.input[spec.name] as string[]).includes(option)} onChange={event => { const values = command.input[spec.name] as string[]; setCommand({ ...command, input: { ...command.input, [spec.name]: event.target.checked ? [...values, option] : values.filter(value => value !== option) } }); }} className="size-5 accent-(--color-primary)" /><span className="break-all">{option}</span></label>)}</div> : adminFieldOptions(resource, spec.name) ? <CustomSelect disabled={saving || uncertain} id={`admin-field-${spec.name}`} required={spec.required} className={inputStyle} value={String(command.input[spec.name] ?? "")} onChange={event => { setConfirmed(false); setCommand({ ...command, input: { ...command.input, [spec.name]: event.target.value, ...(resource === "smtp-relay" && spec.name === "tlsMode" && event.target.value === "local_loopback" ? { username: "", password: "", smtpUtf8RelayFallbackDirect: false } : {}) } }); }}>{!adminFieldOptions(resource, spec.name)!.includes("") && <option value="" disabled>—</option>}{adminFieldOptions(resource, spec.name)!.map(value => <option key={value} value={value}>{value ? valueLabel(spec.name, value) : t("inherit")}</option>)}</CustomSelect> : spec.type === "nullableBoolean" ? <CustomSelect disabled={saving || uncertain} id={`admin-field-${spec.name}`} className={inputStyle} value={command.input[spec.name] === null ? "" : String(command.input[spec.name])} onChange={event => { setConfirmed(false); setCommand({ ...command, input: { ...command.input, [spec.name]: event.target.value === "" ? null : event.target.value === "true" } }); }}><option value="">{t("inherit")}</option><option value="true">{t("allowed")}</option><option value="false">{t("denied")}</option></CustomSelect> : spec.type === "boolean" ? <input disabled={resource === "smtp-relay" && command.input.tlsMode === "local_loopback" && ["username", "password", "smtpUtf8RelayFallbackDirect"].includes(spec.name)} id={`admin-field-${spec.name}`} type="checkbox" checked={command.input[spec.name] === true} onChange={event => setCommand({ ...command, input: { ...command.input, [spec.name]: event.target.checked } })} className="size-5 accent-(--color-primary)" /> : spec.type === "list" ? <AdminListInput id={`admin-field-${spec.name}`} rows={4} disabled={saving || uncertain} required={resource === "groups" && spec.name === "members"} addresses={resource === "groups" && spec.name === "members"} maxLength={resource === "groups" ? 32100 : undefined} className={`${inputStyle} py-2`} value={command.input[spec.name] as string[]} onChange={value => { setConfirmed(false); setCommand({ ...command, input: { ...command.input, [spec.name]: value } }); }} /> : spec.name === "file" ? <textarea id={`admin-field-${spec.name}`} rows={4} className={`${inputStyle} py-2`} value={String(command.input[spec.name] ?? "")} onChange={event => setCommand({ ...command, input: { ...command.input, [spec.name]: event.target.value } })} /> : <input disabled={resource === "smtp-relay" && command.input.tlsMode === "local_loopback" && ["username", "password", "smtpUtf8RelayFallbackDirect"].includes(spec.name)} id={`admin-field-${spec.name}`} readOnly={resource === "dkim" && spec.name === "domain"} {...adminFieldBounds(spec.name)} placeholder={spec.type === "nullableNumber" ? t("inherit") : spec.name === "quotaBytes" ? "B" : undefined} type={spec.type === "password" ? "password" : spec.type === "number" || spec.type === "nullableNumber" ? "number" : "text"} autoComplete={spec.type === "password" ? "new-password" : "off"} required={spec.required} maxLength={spec.name === "selector" ? 63 : 1024} value={command.input[spec.name] === null ? "" : String(command.input[spec.name] ?? "")} onChange={event => setCommand({ ...command, input: { ...command.input, [spec.name]: spec.type === "number" || spec.type === "nullableNumber" ? event.target.value === "" && spec.type === "nullableNumber" ? null : Number(event.target.value) : event.target.value } })} className={inputStyle} />}</div>)}</fieldset>}
      {command.action === "delete" && <p className="text-sm">{t("deletePrompt")}: <strong>{adminConfirmation(resource, command.row)}</strong></p>}
      {resource === "backup-evidence" && command.action === "create" && <p className="text-sm">{t("confirmed")}: RECORD VERIFIED BACKUP EVIDENCE</p>}
      {resource === "dkim" && command.action === "activate" && <dl className="grid gap-3 rounded-lg border border-(--border-app) p-4 text-sm">{["dnsName", "dnsTxtValue", "dnsStatus"].map(key => <div key={key} className="min-w-0"><dt className="text-(--text-muted)">{fieldLabel(key)}</dt><dd className="whitespace-pre-wrap break-all">{fieldValue(key, command.row[key])}</dd>{["dnsName", "dnsTxtValue"].includes(key) && typeof command.row[key] === "string" && <CopyValueButton value={String(command.row[key])} label={fieldLabel(key)} />}</div>)}</dl>}
      <label className="flex items-center gap-2"><input type="checkbox" required disabled={saving || uncertain} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="size-5 accent-(--color-primary)" />{t(resource === "dkim" && command.action === "activate" ? "dkimPublished" : "confirmed")}</label>
      <div id={resource === "spam-policy" ? "admin-policy-review" : undefined} tabIndex={resource === "spam-policy" ? -1 : undefined} className="flex gap-2"><Button type="submit" variant={command.action === "delete" ? "danger" : "primary"} loading={saving} disabled={!confirmed || uncertain || (resource === "users" && command.action === "delete" && command.row.enabled !== false)}>{resource === "queue" ? command.action === "cancel" ? queue("cancelDelivery") : t("retry") : t("save")}</Button><Button disabled={saving} onClick={() => setCommand(null)}>{t("cancel")}</Button></div>
      </fieldset>
    </form>}
    {deletionConfirmation && <ConfirmDialog tone="destructive" title={resource === "queue" ? queue("cancelDelivery") : t("delete")} description={resource === "queue" ? queue("cancelPrompt", { recipient: String(deletionConfirmation.row.recipient ?? "") }) : `${t("deletePrompt")}: ${adminConfirmation(resource, deletionConfirmation.row)}`} confirmLabel={resource === "queue" ? queue("cancelDelivery") : t("delete")} cancelLabel={t("cancel")} confirmDisabled={saving || uncertain || deletionConfirmation !== command} onCancel={() => setDeletionConfirmation(null)} onConfirm={() => { if (deletionConfirmation !== command || saving || uncertain) return; approvedDeletion.current = deletionConfirmation; setDeletionConfirmation(null); formRef.current?.requestSubmit(); }} />}
    {data && !readBlocked && <>
      {data.singleton ? <section className="rounded-sm border border-(--border-app) bg-background p-5"><dl className="grid gap-3 sm:grid-cols-2">{Object.entries(data.singleton).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-sm text-(--text-muted)">{fieldLabel(key)}</dt><dd className="break-words text-sm">{fieldValue(key, value)}</dd></div>)}</dl><div className="mt-5 flex flex-wrap gap-2">{actions.filter(action => allowedAdminAction(resource, action)).map(action => <Button key={action} disabled={saving || loading || uncertain} onClick={() => begin(action, data.singleton)}>{t(action)}</Button>)}</div></section> : <div className="overflow-x-auto rounded-sm border border-(--border-app) bg-background"><table className="w-full min-w-160 text-left text-xs"><thead><tr>{adminColumns[resource].map(key => <th key={key} scope="col" className="whitespace-nowrap px-3 py-2.5">{fieldLabel(key)}</th>)}<th scope="col" className="whitespace-nowrap px-3 py-2.5">{t("actions")}</th></tr></thead><tbody>{data.items.map(row => <tr key={String(row.id)} className="border-t border-(--border-app)">{adminColumns[resource].map(key => <td key={key} className="max-w-64 break-words px-3 py-2.5">{fieldValue(key, row[key])}</td>)}<td className="px-3 py-2.5"><div className="flex items-center gap-1 whitespace-nowrap"><Button size="sm" disabled={saving || loading} onClick={() => requestAction(() => { setCommand(null); setDetails(row); })}>{labels("adminBulk.view")}</Button>{actions.filter(action => allowedAdminAction(resource, action)).map(action => <Button key={action} size="sm" disabled={saving || loading || uncertain || (resource === "queue" && !adminQueueMutableStatus(row.status)) || (resource === "dkim" && !adminDkimActionAllowed(action, row, data?.dkim, query))} onClick={() => begin(action, row)}>{resource === "queue" && action === "cancel" ? queue("cancelDelivery") : t(action)}</Button>)}{resource === "queue" && !adminQueueMutableStatus(row.status) && <span className="text-(--text-muted)">{queue("notMutable", { status: valueLabel("status", String(row.status)) })}</span>}</div></td></tr>)}</tbody></table>{!data.items.length && <p className="p-5 text-sm text-(--text-muted)">{t("empty")}</p>}</div>}
      <footer className="flex items-center justify-between gap-3"><Button disabled={!history.length || loading || saving} onClick={() => { setCursor(history[history.length - 1]); setHistory(previous => previous.slice(0, -1)); }}>{pages("previous")}</Button><span>{data.items.length}</span><Button disabled={!data.hasMore || loading || saving} onClick={() => { setHistory(previous => [...previous, cursor]); setCursor(data.cursor); }}>{pages("next")}</Button></footer>
    </>}
  </section>;
}

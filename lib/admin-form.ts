import { managementFields, type AdminResource, type AdminRow } from "./tastemail/admin-management";

export type AdminCommand = { action: string; row: AdminRow; input: Record<string, unknown>; scopeDomain?: string };

/** Display labels only: never replace protocol values in command inputs. */
export function adminValueLabel(resource: AdminResource, field: string, value: string): string | undefined {
  const own = (table: Record<string, string>, key: string) => Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
  const groups: Record<string, Record<string, string>> = {
    density: { comfortable: "themeCustomizer.densities.comfortable", dense: "themeCustomizer.densities.compact" },
    colorMode: { light: "themeCustomizer.schemes.light", dark: "themeCustomizer.schemes.dark" },
    dsnMode: { preserve: "adminValues.preserveDsn", never: "adminValues.suppressDsn" },
    kind: { backup: "adminValues.backupRecord", restore_drill: "adminValues.restoreDrill" },
  };
  if (field === "status" && resource === "queue") return own({
    active: "adminQueue.activeFilter", pending: "approvalsLive.pending", deferred: "adminValues.deferred",
    in_progress: "adminValues.inProgress", delivered: "adminDashboard.funnel.delivered",
    failed: "adminAudit.results.failed", cancelled: "approvalsLive.cancelled", all: "approvalsLive.all",
  }, value);
  if (field === "status" && resource === "backup-evidence") return own({ passed: "setup.database.states.passed", failed: "adminAudit.results.failed" }, value);
  if (resource === "dkim" && field === "status") return own({ pending: "adminDkim.pending", active: "adminDkim.active", retired: "adminDkim.retired" }, value);
  if (resource === "dkim" && field === "dnsStatus") return own({ published: "adminDkim.published", missing: "adminDkim.missing", unavailable: "adminDkim.unavailable", manual: "adminDkim.manual" }, value);
  return Object.prototype.hasOwnProperty.call(groups, field) ? own(groups[field], value) : undefined;
}
/** Preserve the selected domain even when the server returns an inherited override. */
export function prepareAdminCommand(resource: AdminResource, action: string, snapshot: AdminRow = {}, query = "", scopeDomain?: string): AdminCommand {
  const row: AdminRow = resource === "domain-theme" ? { ...snapshot, id: query } : resource === "dkim" ? { ...snapshot, domain: query } : { ...snapshot };
  const input: Record<string, unknown> = {};
  for (const spec of managementFields(resource, action)) {
    input[spec.name] = action === "delete" || spec.type === "password" ? "" :
      (spec.name === "messagesPerHour" ? row.submissionMessagesPerHour : row[spec.name]) ??
      (spec.type === "boolean" ? ["enabled", "keepLocalCopy", "active"].includes(spec.name) :
        spec.type === "list" ? [] : spec.name === "dsnMode" ? "preserve" :
          spec.name === "algorithm" ? "ed25519-sha256" : spec.name === "tlsMode" ? "start_tls" :
            spec.name === "port" ? 587 : spec.type === "number" ? 0 :
              spec.type === "nullableNumber" || spec.type === "nullableBoolean" ? null : "");
  }
  if (resource === "dkim") input.domain = query;
  if (resource === "users" && action === "create" && scopeDomain) input.address = `postmaster@${scopeDomain}`;
  if (row.revision !== undefined) input.expectedRevision = row.revision;
  return { action, row, input, ...(resource === "users" && scopeDomain ? { scopeDomain } : {}) };
}

/** Domain-scoped confirmation must keep the exact target whose record was shown. */
export function adminCommandTargetMatches(resource: AdminResource, command: AdminCommand, query: string): boolean {
  if (resource === "users" && command.scopeDomain && ["create", "address"].includes(command.action)) {
    return typeof command.input.address === "string" && command.input.address.trim().toLowerCase().endsWith(`@${command.scopeDomain.toLowerCase()}`);
  }
  if (resource === "domain-theme") return !!query && command.row.id === query;
  if (resource === "dkim") return !!query && command.row.domain === query && command.input.domain === command.row.domain;
  return true;
}

export function adminConfirmation(resource: AdminResource, row: AdminRow): string {
  return String(resource === "license" ? "DELETE LICENSE" : resource === "webhooks" ? `DELETE WEBHOOK ${row.id}` : row.address ?? row.name ?? row.source ?? row.id ?? "");
}

/** Translated form/table labels; unknown protocol-specific fields keep their identifier. */
export const adminFieldLabels: Record<string, string> = {
  name: "auth.signup.name", displayName: "auth.signup.name", address: "auth.common.email",
  password: "auth.common.password", quotaBytes: "adminUsers.columns.quota",
  status: "adminUsers.columns.status", occurredAt: "adminAudit.columns.time", actorAddress: "adminAudit.columns.admin",
  eventType: "adminAudit.columns.action", targetType: "adminAudit.fields.target", targetId: "adminAudit.fields.target",
  actorUserId: "adminFields.userId", remoteAddress: "adminAudit.fields.ip", detailJson: "adminAudit.viewJson",
  messageId: "adminQueue.messageId", lastSmtpCode: "adminQueue.smtpCode", createdAt: "adminQueue.createdAt",
  activatedAt: "adminDkim.activatedAt", retiredAt: "adminDkim.retiredAt",
  domain: "adminManage.domains", domainId: "adminManage.domainId",
  ...Object.fromEntries(["usedBytes","enabled","active","messagesPerHour","destination","sourceAddress","keepLocalCopy","dsnMode","host","port","tlsMode","username","themeId","themeVersion","density","colorMode","userSelectionAllowed","revision","scopes","expiresInDays","members","permissionOnly","tokenPrefix","isAdmin"].map(key => [key, `adminFields.${key}`])),
  submissionMessagesPerHour: "adminFields.messagesPerHour",
  userId: "adminFields.userId",
  ...Object.fromEntries(["id","archiveSizeBytes","installedAt","userCount","source","recipient","envelopeSender","attemptCount","lastError","nextAttemptAt","expiresAt","lastUsedAt","revokedAt","url","eventTypes","lastStatusCode","pendingDeliveries","failedDeliveries","kind","archiveSha256","sizeBytes","startedAt","completedAt","note","confirmation","code","file","supportEmail","supportUrl","loginNotice","smtpUtf8RelayFallbackDirect","passwordConfigured","routePolicy","inherited","basis","unlocked","attention","daysLeft","licenseId","licensee","edition","plan","seats","domains","issued","expires","validUntil","overDomains","overMailboxes","release","users","sharedMailboxes"].map(key => [key, `adminFields.${key}`])),
  ...Object.fromEntries(["junkThreshold","quarantineThreshold","rejectThreshold","spfSoftfailScore","spfFailScore","dkimFailScore","dmarcFailScore","blocklistScore","contentUrlThreshold","contentUrlScore","htmlOnlyScore","executableAttachmentScore","suspiciousSubjectScore","maxContentScanChars","suspiciousSubjectTerms","ipReputation","domainReputation","allowIpNetworks","blockIpNetworks","allowDomains","blockDomains","selector","algorithm","dnsName","dnsTxtValue","dnsStatus"].map(key => [key, `adminFields.${key}`])),
};

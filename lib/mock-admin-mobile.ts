import type { AdminMobileScreen } from "@/types/admin";

// Mock data for the small-screen ("mobile") variant of the Admin Console.
export const MOBILE_ADMIN_SCREENS: AdminMobileScreen[] = [
  {
    id: "dash",
    navDot: "#2B4BF2",
    chipCount: 3,
    rows: [
      { id: "throughput", tone: "info", metaCount: 249000, metaCountCompact: true, hasLine3: true },
      { id: "blocked", tone: "danger", metaMetric: { kind: "number", value: 24918 }, hasLine3: true },
      { id: "queue", tone: "neutral", metaMetric: { kind: "number", value: 1204 }, hasLine3: true },
      { id: "deliveryDelay", tone: "success", hasMeta: true, hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "needsAttention", tone: "warning", hasLine3: true, hasTag: true, tagTone: "warning", on: true },
    ],
    hasFooterText: true,
  },
  {
    id: "users",
    navDot: "#B9C6FA",
    subValues: { total: { value: 1284 }, suspended: { value: 3 }, inactive: { value: 26 } },
    actionLabel: "⌕",
    chipCount: 3,
    rows: [
      { id: "jiwoo", tone: "info", avatar: "한지", name: "한지우", line3UsageGb: 18.2, hasTag: true, tagTone: "success" },
      { id: "seojun", tone: "neutral", avatar: "박서", name: "박서준", line3UsageGb: 32.4, hasTag: true, tagTone: "success" },
      { id: "jaeho", tone: "warning", avatar: "윤재", name: "윤재호", line3UsageGb: 47.8, hasTag: true, tagTone: "warning" },
      { id: "temporary", tone: "danger", avatar: "임시", name: "temp-001", hasLine3: true, hasTag: true, tagTone: "danger" },
      { id: "serin", tone: "neutral", avatar: "오세", name: "오세린", line3UsageGb: 8.1, hasTag: true, tagTone: "success" },
    ],
    hasFooterText: true,
    hasFooterAction: true,
  },
  {
    id: "security",
    navDot: "#C0433B",
    subValues: { days: { value: 7 }, pending: { value: 3 } },
    chipCount: 2,
    rows: [
      { id: "unusualLogin", tone: "danger", hasLine2: true, hasLine3: true },
      { id: "phishing", tone: "danger", hasLine2: true, hasLine3: true, hasTag: true, tagTone: "danger", on: true },
      { id: "dlp", tone: "warning", hasLine2: true, hasLine3: true },
      { id: "spf", tone: "warning", line2: "mail.gxsoft.co.kr", hasLine3: true, hasTag: true, tagTone: "warning" },
      { id: "appPassword", tone: "neutral", hasLine2: true, hasLine3: true },
    ],
    hasFooterText: true,
  },
  {
    id: "quarantine",
    navDot: "#E3B5B0",
    subValues: { total: { value: 312 }, highRisk: { value: 18 } },
    chipCount: 3,
    rows: [
      { id: "alert", tone: "danger", name: "security-alert@gxsott.co.kr", line2: "긴급: 비밀번호가 만료되었습니다", hasLine3: true, hasTag: true, tagTone: "danger", on: true },
      { id: "invoice", tone: "danger", name: "invoice@paymnet-secure.net", line2: "미결제 청구서", hasLine3: true, hasTag: true, tagTone: "danger" },
      { id: "newsletter", tone: "warning", name: "newsletter@marketing-hub.io", line2: "9월 신제품 소식", hasLine3: true, hasTag: true, tagTone: "warning" },
      { id: "recruitment", tone: "neutral", name: "hr@partner-corp.kr", line2: "채용 협업 제안", hasLine3: true, hasTag: true, tagTone: "neutral" },
      { id: "billing", tone: "neutral", name: "billing@cloudvendor.com", line2: "8월 사용량 명세서", hasLine3: true, hasTag: true, tagTone: "neutral" },
    ],
    hasFooterText: true,
    hasFooterAction: true,
  },
  {
    id: "status",
    navDot: "#3FBF7F",
    actionLabel: "＋",
    rows: [
      { id: "mail", tone: "success", hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "webClient", tone: "success", hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "protocols", tone: "success", name: "IMAP · SMTP", hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "migration", tone: "warning", hasLine3: true, hasTag: true, tagTone: "warning" },
      { id: "maintenance", tone: "info", hasLine2: true, hasLine3: true, hasTag: true, tagTone: "info", on: true },
    ],
    hasFooterText: true,
  },
  {
    id: "groups",
    navDot: "#E3B5B0",
    subValues: { total: { value: 42 }, mailing: { value: 12 } },
    actionLabel: "＋",
    chipCount: 3,
    rows: [
      { id: "strategy", tone: "info", avatar: "전략", name: "전략기획팀", metaCount: 38, hasLine3: true },
      { id: "infrastructure", tone: "neutral", avatar: "인프", name: "인프라팀", metaCount: 24, hasLine3: true },
      { id: "allStaff", tone: "warning", avatar: "전사", name: "전사 공지", metaCount: 1284, hasLine3: true, hasTag: true, tagTone: "warning", on: true },
      { id: "sales", tone: "neutral", avatar: "영업", name: "영업 1팀", metaCount: 31, hasLine3: true },
      { id: "aurora", tone: "neutral", avatar: "오로", name: "프로젝트 오로라", metaCount: 9, hasLine3: true, hasTag: true, tagTone: "warning" },
    ],
    hasFooterText: true,
  },
  {
    id: "policy",
    navDot: "#E0AC4A",
    subValues: { domains: { value: 3 }, actions: { value: 1 } },
    chipCount: 2,
    rows: [
      { id: "primaryDomain", tone: "info", name: "gxsoft.co.kr", hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "mailDomain", tone: "neutral", name: "mail.gxsoft.co.kr", hasLine3: true, hasTag: true, tagTone: "warning", on: true },
      { id: "aliasDomain", tone: "neutral", name: "gxsoft.kr", hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "dmarc", tone: "neutral", hasLine3: true },
      { id: "mtaSts", tone: "warning", hasLine3: true, hasTag: true, tagTone: "warning" },
    ],
    hasFooterText: true,
  },
  {
    id: "audit",
    navDot: "#3B7A94",
    subValues: { hours: { value: 24 }, events: { value: 218 } },
    actionLabel: "⌕",
    chipCount: 3,
    rows: [
      { id: "grantRole", tone: "info", metaMetric: { kind: "time", value: "2026-09-27T00:24:00Z" }, line2: "오세린 → 박서준", line3: "IP 10.2.14.8 · 웹 콘솔" },
      { id: "removeDelegate", tone: "neutral", metaMetric: { kind: "time", value: "2026-09-26T23:51:00Z" }, line2: "shared-hr · 한지우", line3: "IP 10.2.9.31" },
      { id: "bulkDelete", tone: "danger", metaMetric: { kind: "time", value: "2026-09-26T22:12:00Z" }, line2: "격리 메일 84건", line3: "박서준 · 되돌릴 수 없음", hasTag: true, tagTone: "danger", on: true },
      { id: "editPolicy", tone: "neutral", hasMeta: true, line2: "DLP 실행 파일 차단 ON", line3: "오세린" },
      { id: "issueApiKey", tone: "neutral", hasMeta: true, line2: "billing-sync", line3: "인프라팀 · 만료 90일" },
    ],
    hasFooterText: true,
  },
  {
    id: "backup",
    navDot: "#2E8B5B",
    subValues: { frequency: { value: 1 }, lastSuccess: { value: "2026-09-26T18:10:00Z", format: "time" } },
    chipCount: 2,
    rows: [
      { id: "full", tone: "success", metaMetric: { kind: "time", value: "2026-09-26T18:10:00Z" }, hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "incremental", tone: "success", hasMeta: true, hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "restoreTest", tone: "warning", hasMeta: true, hasLine3: true, hasTag: true, tagTone: "warning", on: true },
      { id: "retention", tone: "neutral", hasLine3: true },
      { id: "storage", tone: "neutral", metaMetric: { kind: "percent", value: 0.62 }, line3StorageTb: { used: 4.9, total: 8 } },
    ],
    hasFooterText: true,
  },
  {
    id: "billing",
    navDot: "#D4D4CE",
    subValues: { month: { value: "2026-09-01T12:00:00Z", format: "month" }, amount: { value: 3852000, format: "currencyKrw" } },
    chipCount: 2,
    rows: [
      { id: "seats", tone: "info", metaMetric: { kind: "number", value: 1284 }, hasLine3: true },
      { id: "storage", tone: "neutral", metaMetric: { kind: "terabyte", value: 2 }, hasLine3: true },
      { id: "archive", tone: "neutral", metaMetric: { kind: "terabyte", value: 6 }, hasLine3: true },
      { id: "augustInvoice", tone: "neutral", metaMetric: { kind: "currencyKrw", value: 3796400 }, hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "cardExpiry", tone: "warning", hasLine3: true, hasTag: true, tagTone: "warning", on: true },
    ],
    hasFooterText: true,
  },
  {
    id: "brand",
    navDot: "#8E7CC3",
    chipCount: 2,
    rows: [
      { id: "logo", tone: "info", hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "accent", tone: "neutral", hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "signature", tone: "neutral", hasLine3: true },
      { id: "loginBackground", tone: "neutral", hasLine3: true, hasTag: true, tagTone: "warning", on: true },
      { id: "senderName", tone: "neutral", hasLine3: true },
    ],
    hasFooterText: true,
  },
  {
    id: "api",
    navDot: "#3B7A94",
    subValues: { keys: { value: 4 }, calls: { value: 12000, format: "compact" } },
    actionLabel: "＋",
    chipCount: 2,
    rows: [
      { id: "hrSync", tone: "info", name: "hr-sync", hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "billingSync", tone: "neutral", name: "billing-sync", hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "legacyImport", tone: "warning", name: "legacy-import", hasLine3: true, hasTag: true, tagTone: "warning", on: true },
      { id: "quarantineWebhook", tone: "neutral", line3: "POST /hooks/quarantine · 100%" },
      { id: "rateLimit", tone: "neutral", hasMeta: true, hasLine3: true },
    ],
    hasFooterText: true,
  },
  {
    id: "approval",
    navDot: "#6B5CA8",
    subValues: { pending: { value: 6 }, averageHours: { value: 4.2 } },
    chipCount: 2,
    rows: [
      { id: "bulkSend", tone: "warning", hasLine2: true, hasLine3: true, hasTag: true, tagTone: "warning", on: true },
      { id: "externalShare", tone: "warning", hasLine2: true, hasLine3: true, hasTag: true, tagTone: "warning" },
      { id: "deleteAccount", tone: "neutral", hasLine2: true, hasLine3: true, hasTag: true, tagTone: "warning" },
      { id: "dlpException", tone: "neutral", hasLine2: true, hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "approvalTemplate", tone: "neutral", hasLine3: true },
    ],
    hasFooterText: true,
    hasFooterAction: true,
  },
  {
    id: "reports",
    navDot: "#3B7A94",
    subValues: { month: { value: "2026-09-01T12:00:00Z", format: "month" }, week: { value: 1 } },
    chipCount: 2,
    rows: [
      { id: "traffic", tone: "info", metaMetric: { kind: "percent", value: 0.062, signed: true }, hasLine3: true },
      { id: "spamBlock", tone: "neutral", metaMetric: { kind: "percent", value: 0.992 }, hasLine3: true, hasTag: true, tagTone: "success" },
      { id: "userActivity", tone: "neutral", metaMetric: { kind: "percent", value: 0.94 }, hasLine3: true },
      { id: "storageGrowth", tone: "neutral", metaMetric: { kind: "gigabyte", value: 82, signed: true }, hasLine3: true },
      { id: "scheduled", tone: "info", hasMeta: true, hasLine3: true, on: true },
    ],
    hasFooterText: true,
  },
  {
    id: "migration",
    navDot: "#E0AC4A",
    subValues: { batches: { value: 4 }, progress: { value: 0.62, format: "percent" } },
    chipCount: 3,
    rows: [
      { id: "salesBatch", tone: "info", name: "배치 07 · 영업본부", metaMetric: { kind: "percent", value: 0.82 }, hasLine3: true, on: true },
      { id: "researchBatch", tone: "info", name: "배치 08 · 연구소", metaMetric: { kind: "percent", value: 0.54 }, hasLine3: true },
      { id: "overseasBatch", tone: "neutral", name: "배치 09 · 해외지사", metaMetric: { kind: "percent", value: 0.21 }, hasLine3: true },
      { id: "failedBatch", tone: "danger", hasLine3: true, hasTag: true, tagTone: "danger" },
      { id: "completedBatches", tone: "success", metaMetric: { kind: "number", value: 612 }, hasLine3: true, hasTag: true, tagTone: "success" },
    ],
    hasFooterText: true,
  },
];

// Operational mock metrics stay typed; the catalogs own wording and ordering.
export type AdminMobileDisplayValue = number | {
  kind: "percent" | "currencyKrw" | "compact" | "time" | "date" | "calendarDate" | "weekday" | "month";
  value: number | string;
  signed?: boolean;
};

export function formatAdminMobileDisplayValue(value: AdminMobileDisplayValue, locale: string, timeZone: string, hour12: boolean): string {
  if (typeof value === "number") return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  if (value.kind === "percent") return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2, signDisplay: value.signed ? "always" : "auto" }).format(Number(value.value));
  if (value.kind === "currencyKrw") return new Intl.NumberFormat(locale, { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(Number(value.value));
  if (value.kind === "compact") return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 2 }).format(Number(value.value));
  const date = new Date(String(value.value));
  if (value.kind === "time") return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12, timeZone }).format(date);
  if (value.kind === "date") return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone }).format(date);
  if (value.kind === "calendarDate") return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "UTC" }).format(date);
  if (value.kind === "weekday") return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone }).format(date);
  return new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(date);
}

export const MOBILE_ADMIN_ROW_NUMBERS: Record<string, Record<string, Partial<Record<"name" | "meta" | "line2" | "line3", Record<string, AdminMobileDisplayValue>>>>> = {
  dash: {
    throughput: { line3: { growth: { kind: "percent", value: 0.062, signed: true } } },
    blocked: { line3: { quarantined: 312, highRisk: 18 } },
    queue: { line3: { retry: 18, failed: 3 } },
    deliveryDelay: { meta: { seconds: 1.8 }, line3: { slaSeconds: 5 } },
    needsAttention: { name: { items: 2 }, line3: { threshold: 8 } },
  },
  users: { temporary: { line3: { days: 90 } } },
  security: {
    phishing: { line3: { time: { kind: "time", value: "2026-09-26T21:12:00Z" }, quarantined: 28 } },
    unusualLogin: { line2: { blocked: 12 }, line3: { days: 8 } },
    dlp: { line3: { cases: 3 } },
    spf: { line3: { score: 78 } },
    appPassword: { line2: { clients: 2 }, line3: { days: 6 } },
  },
  quarantine: {
    alert: { line3: { recipients: 84 } },
    invoice: { line3: { recipients: 12 } },
    newsletter: { line3: { recipients: 206 } },
    recruitment: { line3: { recipients: 2 } },
    billing: { line3: { recipients: 4 } },
  },
  status: {
    mail: { line3: { availability: { kind: "percent", value: 0.9998 }, days: 30 } },
    webClient: { line3: { latency: 118 } },
    maintenance: { line2: { date: { kind: "date", value: "2026-09-05T17:00:00Z" }, start: { kind: "time", value: "2026-09-05T17:00:00Z" }, end: { kind: "time", value: "2026-09-05T19:00:00Z" } } },
    protocols: { line3: { connections: 2412 } },
    migration: { line3: { batches: 4 } },
  },
  policy: { mailDomain: { line3: { score: 78 } } },
  audit: {
    bulkDelete: { line2: { count: 84 } },
    issueApiKey: { line3: { days: 90 } },
  },
  backup: {
    full: { line3: { used: 1.8, minutes: 42 } },
    incremental: { line3: { successes: 12 } },
    restoreTest: { meta: { days: 23 } },
    retention: { line3: { mailYears: 7, auditYears: 7 } },
  },
  billing: {
    seats: { line3: { contracted: 1400, available: 116 } },
    storage: { line3: { amount: { kind: "currencyKrw", value: 320000 } } },
    archive: { line3: { amount: { kind: "currencyKrw", value: 540000 }, years: 7 } },
    augustInvoice: { line3: { date: { kind: "calendarDate", value: "2026-08-31T12:00:00Z" } } },
  },
  brand: { signature: { line3: { types: 3 } } },
  api: {
    hrSync: { line3: { minutes: 2 } },
    billingSync: { line3: { days: 82 } },
    legacyImport: { line3: { days: 6 } },
    rateLimit: { meta: { perMinute: 600 } },
  },
  approval: {
    bulkSend: { line2: { people: 1284 }, line3: { hours: 2 } },
    approvalTemplate: { line3: { step: 3 } },
    externalShare: { line3: { hours: 5 } },
  },
  reports: {
    traffic: { line3: { received: { kind: "compact", value: 1680000 }, sent: { kind: "compact", value: 810000 } } },
    spamBlock: { line3: { reports: 12 } },
    userActivity: { line3: { people: 1207, days: 5 } },
    storageGrowth: { line3: { months: 14 } },
    scheduled: { meta: { reports: 3 }, line3: { weekday: { kind: "weekday", value: "2026-09-27T23:00:00Z" }, time: { kind: "time", value: "2026-09-27T23:00:00Z" } } },
  },
  migration: {
    failedBatch: { name: { failures: 4 } },
    salesBatch: { line3: { migrated: 312, total: 380, hours: 1, minutes: 40 } },
    researchBatch: { line3: { migrated: 104, total: 192 } },
    overseasBatch: { line3: { migrated: 38, total: 180 } },
    completedBatches: { line3: { days: 30 } },
  },
};

export function formatAdminMobileSubValues(screen: AdminMobileScreen, locale: string, timeZone = "Asia/Seoul", hour12 = false): Record<string, string> {
  return Object.fromEntries(Object.entries(screen.subValues ?? {}).map(([key, metric]) => [
    key,
    metric.format === "time" || metric.format === "month" || metric.format === "currencyKrw"
      ? formatAdminMobileDisplayValue({ kind: metric.format, value: metric.value }, locale, timeZone, hour12)
      : new Intl.NumberFormat(locale, metric.format === "percent"
          ? { style: "percent", maximumFractionDigits: 1 }
          : metric.format === "compact"
            ? { notation: "compact", maximumFractionDigits: 1 }
            : { maximumFractionDigits: 1 }).format(Number(metric.value)),
  ]));
}

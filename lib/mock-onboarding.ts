// Mock data for the org-admin onboarding wizard (/admin/onboarding) — this is
// distinct from /setup, which is the initial server install wizard.
export type StepStatus = "done" | "now" | "todo";

export const ONBOARD_STEPS = [
  { id: "organization", status: "done" },
  { id: "domain", status: "now" },
  { id: "accounts", status: "todo" },
  { id: "migration", status: "todo" },
  { id: "policy", status: "todo" },
  { id: "cutover", status: "todo" },
] as const satisfies readonly { id: string; status: StepStatus }[];

export type OnboardDnsState = "verified" | "pending" | "unregistered";
export const DNS_RECORDS: { type: string; host: string; value: string; prio: string; state: OnboardDnsState; tone: "success" | "warning" | "neutral" }[] = [
  { type: "MX", host: "@", value: "mx1.mailwave.kr", prio: "10", state: "verified", tone: "success" },
  { type: "MX", host: "@", value: "mx2.mailwave.kr", prio: "20", state: "verified", tone: "success" },
  { type: "TXT", host: "@", value: "v=spf1 include:spf.mailwave.kr ~all", prio: "—", state: "verified", tone: "success" },
  { type: "TXT", host: "mw._domainkey", value: "v=DKIM1; k=rsa; p=MIIBIjANBg…", prio: "—", state: "pending", tone: "warning" },
  { type: "TXT", host: "_dmarc", value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@…", prio: "—", state: "unregistered", tone: "neutral" },
];

export const MIGRATIONS = [
  { id: "exchange", source: "Exchange 2016", percent: 72, completed: 142000, total: 197000 },
  { id: "google", source: "Google Workspace", percent: 38, completed: 61000, total: 160000 },
  { id: "imap", source: "IMAP", percent: 0, completed: null, total: null },
];

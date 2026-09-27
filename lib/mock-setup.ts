// Mock data for the self-hosted mail server "first run" setup wizard (/setup).
export const SETUP_STEP_IDS = ["license", "database", "organization", "dns", "storage", "security", "invitations"] as const;
export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

type DbCheckState = "passed" | "warning";
type DnsRecordState = "verified" | "propagating" | "missing";

export const DB_CHECKS: { id: "connection" | "version" | "permissions" | "charset" | "timezone"; state: DbCheckState }[] = [
  { id: "connection", state: "passed" },
  { id: "version", state: "passed" },
  { id: "permissions", state: "passed" },
  { id: "charset", state: "passed" },
  { id: "timezone", state: "warning" },
];

export const SETUP_DNS_RECORDS: { type: string; host: string; value: string; state: DnsRecordState }[] = [
  { type: "MX", host: "@", value: "10 mail.gxsoft.co.kr", state: "verified" },
  { type: "TXT · SPF", host: "@", value: "v=spf1 include:mail.gxsoft.co.kr ~all", state: "verified" },
  { type: "CNAME · DKIM", host: "mw1._domainkey", value: "mw1.dkim.gxsoft.co.kr", state: "propagating" },
  { type: "TXT · DMARC", host: "_dmarc", value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@gxsoft.co.kr", state: "missing" },
];

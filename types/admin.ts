// Shared shapes for the Admin Console (nav items, status "Tone" colors,
// dashboard cards, and the mobile screen variant).
export type AdminTabId =
  | "dash"
  | "users"
  | "policy"
  | "security"
  | "flow"
  | "groups"
  | "audit"
  | "backup"
  | "reports"
  | "migration"
  | "brand"
  | "api"
  | "billing";

export interface AdminNavItem {
  id: AdminTabId;
  dot: string;
  badge?: string;
}

export type Tone = "success" | "warning" | "danger" | "info" | "violet" | "teal" | "neutral";

export interface Pill {
  label: string;
  tone: Tone;
}

export interface KpiCardData {
  label: string;
  value: string;
  delta: string;
  deltaUp: boolean;
  bars: number[];
}

export interface SparkBar {
  value: number;
  highlight?: boolean;
}

export interface AdminMobileRow {
  id: string;
  tone: Tone;
  avatar?: string;
  name?: string;
  meta?: string;
  metaMetric?: { kind: "number" | "percent" | "gigabyte" | "terabyte" | "currencyKrw"; value: number; signed?: boolean } | { kind: "time"; value: string };
  metaCount?: number;
  metaCountCompact?: boolean;
  hasMeta?: boolean;
  line2?: string;
  hasLine2?: boolean;
  line3?: string;
  line3UsageGb?: number;
  line3StorageTb?: { used: number; total: number };
  hasLine3?: boolean;
  tag?: string;
  hasTag?: boolean;
  tagTone?: Tone;
  on?: boolean;
}

export interface AdminMobileScreen {
  id: string;
  navDot: string;
  subValues?: Record<string, { value: number | string; format?: "number" | "percent" | "compact" | "currencyKrw" | "time" | "month" }>;
  actionLabel?: string;
  chipCount?: number;
  rows: AdminMobileRow[];
  hasFooterText?: boolean;
  hasFooterAction?: boolean;
}

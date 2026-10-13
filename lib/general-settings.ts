import type { UserSettings } from "@/types/user-settings";
import { DEFAULT_USER_SETTINGS } from "./user-settings";
import { normalizeShortcut, shortcutConflicts } from "./mail-shortcuts";

// 서버의 계정별 UI 설정만 투영한다. identity·보안·규칙 원문은 포함하지 않는다.
export type GeneralSettings = Pick<UserSettings, "locale" | "accessibility" | "sending" | "notifications" | "shortcuts"> & {
  compose: Omit<UserSettings["compose"], "senderName" | "senderAddress" | "signatures">;
  inbox: Omit<UserSettings["inbox"], "remoteImageSenders"> & { remoteImageSenders: string[] };
};
export type GeneralSettingsSnapshot = { version: 1; accountId: string; revision: number; settings: GeneralSettings };
export type GeneralSettingsChanges = { [K in keyof GeneralSettings]?: Partial<GeneralSettings[K]> };
export type GeneralSettingsUpdate = { expectedRevision: number; changes: GeneralSettingsChanges };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_LIMIT = 32 * 1024;
// JSONB의 구분 공백을 위한 서버 여유분은 요청 본문 상한과 별개다.
const SETTINGS_LIMIT = 31 * 1024;
const choices: Record<string, readonly string[]> = {
  "locale.dateFormat": ["locale", "iso", "long"], "locale.timeFormat": ["12", "24"], "locale.weekStart": ["sunday", "monday"],
  "accessibility.fontScale": ["90", "100", "110", "125"], "compose.font": ["sans", "serif", "mono"], "compose.undoSeconds": ["0", "5", "10", "20", "30"],
  "inbox.density": ["comfortable", "compact"], "inbox.previewPane": ["right", "bottom", "off"], "inbox.markRead": ["immediate", "2seconds", "manual"],
  "inbox.remoteImages": ["always", "contacts", "never"], "inbox.pageSize": ["25", "50", "100"], "inbox.dateFormat": ["relative", "short", "full"], "inbox.unreadStyle": ["bold", "highlight", "dot"],
  "sending.defaultReply": ["reply", "replyAll"], "sending.quoteStyle": ["inline", "below", "none"], "sending.scheduleDefault": ["off", "nextMorning", "custom"], "sending.autosaveSeconds": ["15", "30", "60"], "sending.composeMode": ["html", "plain"],
};
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function bytes(value: unknown) { return new TextEncoder().encode(JSON.stringify(value)).length; }
function textBytes(value: string) { return new TextEncoder().encode(value).length; }
function revision(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
export function generalSettingsFromUser(settings: UserSettings, accountAddress: string): GeneralSettings {
  const { font, defaultSignatureId, signatureOnNew, signatureOnReply, undoSeconds } = settings.compose;
  const { remoteImageSenders, ...inbox } = settings.inbox;
  return structuredClone({ locale: settings.locale, accessibility: settings.accessibility, compose: { font, defaultSignatureId, signatureOnNew, signatureOnReply, undoSeconds },
    inbox: { ...inbox, remoteImageSenders: remoteImageSenders[accountAddress.trim().toLowerCase()] ?? [] }, sending: settings.sending, notifications: settings.notifications, shortcuts: settings.shortcuts });
}
const template = generalSettingsFromUser(DEFAULT_USER_SETTINGS, "");
function shape(value: unknown, expected: unknown, partial: boolean): boolean {
  if (Array.isArray(expected)) return Array.isArray(value) && value.length <= 200 && value.every(item => typeof item === "string");
  if (object(expected)) {
    if (!object(value) || !Object.keys(value).length || Object.keys(value).some(key => !Object.hasOwn(expected, key))) return false;
    return (partial || Object.keys(value).length === Object.keys(expected).length) && Object.entries(value).every(([key, item]) => shape(item, expected[key], partial));
  }
  return typeof value === typeof expected;
}
function valid(settings: GeneralSettings): boolean {
  const system = settings.inbox.hiddenSystemMailboxes;
  const ids = settings.inbox.hiddenMailboxIds;
  if (system.length > 8 || new Set(system).size !== system.length || system.some(key => !["all","inbox","starred","drafts","sent","archive","spam","trash"].includes(key))) return false;
  if (ids.length > 200 || new Set(ids).size !== ids.length || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) || id === "00000000-0000-0000-0000-000000000000")) return false;
  for (const [path, allowed] of Object.entries(choices)) {
    const [section, field] = path.split(".");
    if (!allowed.includes((settings as unknown as Record<string, Record<string, string>>)[section][field])) return false;
  }
  if (!Object.values(settings.notifications.modes).every(mode => ["instant", "digest", "off"].includes(mode))) return false;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.notifications.quietStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.notifications.quietEnd)) return false;
  if (textBytes(settings.locale.timezone) > 128) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: settings.locale.timezone }); } catch { return false; }
  if (textBytes(settings.compose.defaultSignatureId) > 128 || /[\u0000-\u001f\u007f-\u009f]/u.test(settings.compose.defaultSignatureId)) return false;
  if (settings.inbox.remoteImageSenders.length > 100 || settings.inbox.remoteImageSenders.some(address => textBytes(address) > 254 || !/^[^\s@,]+@[^\s@,]+$/.test(address))) return false;
  if ([settings.sending.defaultCc, settings.sending.defaultBcc].some(value => textBytes(value) > 4096 || /[\u0000-\u001f\u007f-\u009f]/u.test(value) || (value.trim() && (value.split(',').length > 20 || value.split(',').some(address => !/^[^\s@,]+@[^\s@,]+$/.test(address.trim())))))) return false;
  if (Object.values(settings.shortcuts.bindings).some(value => value.length > 16 || normalizeShortcut(value) !== value) || shortcutConflicts(settings.shortcuts.bindings)) return false;
  return bytes(settings) <= SETTINGS_LIMIT;
}
export function requireGeneralSettingsSnapshot(value: unknown, accountId?: string): GeneralSettingsSnapshot {
  if (!object(value) || value.version !== 1 || typeof value.accountId !== "string" || !UUID.test(value.accountId) || (accountId !== undefined && value.accountId !== accountId) || !revision(value.revision) || !shape(value.settings, template, false) || !valid(value.settings as GeneralSettings)) throw new Error("invalid_general_settings_snapshot");
  return { version: 1, accountId: value.accountId, revision: value.revision, settings: structuredClone(value.settings) as GeneralSettings };
}
export function generalSettingsUpdate(value: unknown): GeneralSettingsUpdate | null {
  if (!object(value) || Object.keys(value).length !== 2 || !revision(value.expectedRevision) || value.expectedRevision >= Number.MAX_SAFE_INTEGER || !shape(value.changes, template, true) || bytes(value) > REQUEST_LIMIT) return null;
  return structuredClone(value) as unknown as GeneralSettingsUpdate;
}
export function userSettingsFromGeneral(snapshot: GeneralSettingsSnapshot, accountAddress: string): UserSettings {
  const { remoteImageSenders, ...inbox } = snapshot.settings.inbox;
  return { ...structuredClone(DEFAULT_USER_SETTINGS), ...structuredClone(snapshot.settings), compose: { ...DEFAULT_USER_SETTINGS.compose, ...snapshot.settings.compose }, inbox: { ...inbox, remoteImageSenders: { [accountAddress.trim().toLowerCase()]: [...remoteImageSenders] } } };
}

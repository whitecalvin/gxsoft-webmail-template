import type { UserSettings } from "@/types/user-settings";
import { normalizeImageSenders } from "./mail-image-policy";
import { normalizeShortcut, SHORTCUT_ACTIONS, shortcutConflicts } from "./mail-shortcuts";

export const USER_SETTINGS_STORAGE_KEY = "gxmail:user-settings:v1";

export const DEFAULT_USER_SETTINGS: UserSettings = {
  version: 1,
  locale: { timezone: "Asia/Seoul", dateFormat: "locale", timeFormat: "24", weekStart: "monday" },
  accessibility: { fontScale: "100", highContrast: false, reduceMotion: false, enhancedFocus: false, screenReaderDetails: true, keyboardNavigation: true },
  compose: {
    senderName: "",
    senderAddress: "",
    font: "sans",
    defaultSignatureId: "",
    signatureOnNew: true,
    signatureOnReply: true,
    undoSeconds: "10",
    signatures: [],
  },
  inbox: { hiddenSystemMailboxes: [], hiddenMailboxIds: [], showMailboxCounts: true, showMailboxStorage: true, showDeliveryDetails: true, density: "comfortable", previewPane: "right", conversationView: true, markRead: "2seconds", remoteImages: "always", remoteImageSenders: {}, pageSize: "50", dateFormat: "relative", unreadStyle: "bold" },
  sending: { defaultReply: "replyAll", quoteStyle: "below", requestReceipt: false, scheduleDefault: "off", autosaveSeconds: "30", defaultCc: "", defaultBcc: "", composeMode: "html" },
  away: { enabled: false, startDate: "", endDate: "", subject: "", internalMessage: "", externalMessage: "", contactsOnly: false },
  notifications: { browser: true, email: false, sound: true, weekends: false, quietStart: "22:00", quietEnd: "07:00", modes: { important: "instant", general: "instant", approval: "instant", mention: "instant", shared: "digest" } },
  labels: [],
  filters: [],
  blockedSenders: [],
  account: { displayName: "", primaryEmail: "", replyTo: "", aliases: [] },
  security: { twoFactor: false, backupCodes: 0, passwordChangedAt: "", sessions: [] },
  integrations: [],
  shortcuts: { enabled: true, bindings: { compose: "C", search: "/", inbox: "G I", archive: "E", delete: "#", reply: "R", forward: "F" } },
};

export function mergeStoredSettings(value: unknown): UserSettings {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_USER_SETTINGS);
  const stored = value as Partial<UserSettings>;
  if (stored.version !== 1) return structuredClone(DEFAULT_USER_SETTINGS);
  const bindings = Object.fromEntries(SHORTCUT_ACTIONS.map((action) => [action, normalizeShortcut(stored.shortcuts?.bindings?.[action]) ?? DEFAULT_USER_SETTINGS.shortcuts.bindings[action]]));
  return {
    ...structuredClone(DEFAULT_USER_SETTINGS),
    ...stored,
    locale: { ...DEFAULT_USER_SETTINGS.locale, ...stored.locale },
    accessibility: { ...DEFAULT_USER_SETTINGS.accessibility, ...stored.accessibility },
    compose: { ...DEFAULT_USER_SETTINGS.compose, ...stored.compose },
    inbox: { ...DEFAULT_USER_SETTINGS.inbox, ...stored.inbox, showMailboxCounts: typeof stored.inbox?.showMailboxCounts === "boolean" ? stored.inbox.showMailboxCounts : true, showMailboxStorage: typeof stored.inbox?.showMailboxStorage === "boolean" ? stored.inbox.showMailboxStorage : true, showDeliveryDetails: typeof stored.inbox?.showDeliveryDetails === "boolean" ? stored.inbox.showDeliveryDetails : true, remoteImageSenders: normalizeImageSenders(stored.inbox?.remoteImageSenders) },
    sending: { ...DEFAULT_USER_SETTINGS.sending, ...stored.sending },
    away: { ...DEFAULT_USER_SETTINGS.away, ...stored.away },
    notifications: { ...DEFAULT_USER_SETTINGS.notifications, ...stored.notifications, modes: { ...DEFAULT_USER_SETTINGS.notifications.modes, ...stored.notifications?.modes } },
    account: { ...DEFAULT_USER_SETTINGS.account, ...stored.account },
    security: {
      ...DEFAULT_USER_SETTINGS.security,
      ...stored.security,
      sessions: (stored.security?.sessions ?? DEFAULT_USER_SETTINGS.security.sessions).map((session) => ({
        ...session,
        lastActive: session.lastActive || DEFAULT_USER_SETTINGS.security.sessions.find((item) => item.id === session.id)?.lastActive || new Date(0).toISOString(),
      })),
    },
    integrations: (stored.integrations ?? DEFAULT_USER_SETTINGS.integrations).map((integration) => ({
      ...integration,
      status: integration.status ?? "ok",
    })),
    shortcuts: { enabled: typeof stored.shortcuts?.enabled === "boolean" ? stored.shortcuts.enabled : true, bindings: shortcutConflicts(bindings) ? { ...DEFAULT_USER_SETTINGS.shortcuts.bindings } : bindings },
  };
}

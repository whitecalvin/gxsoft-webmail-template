// Canonical user-settings information architecture. Labels live in the
// next-intl settingsSystem namespace; this data remains locale-neutral.
export const SETTINGS_NAV_GROUPS = [
  { key: "general", items: [
    { key: "locale", href: "/settings/locale" },
    { key: "theme", href: "/settings/theme" },
    { key: "accessibility", href: "/settings/accessibility" },
  ] },
  { key: "mail", items: [
    { key: "signature", href: "/settings/signature" },
    { key: "inbox-display", href: "/settings/inbox-display" },
    { key: "sending", href: "/settings/sending" },
    { key: "away", href: "/settings/away" },
    { key: "notifications", href: "/settings/notifications" },
  ] },
  { key: "management", items: [
    { key: "labels", href: "/settings/labels" },
    { key: "filters", href: "/settings/rules" },
    { key: "blocked-senders", href: "/settings/blocked-senders" },
  ] },
  { key: "account", items: [
    { key: "account", href: "/settings/account" },
    { key: "security", href: "/settings/security" },
    { key: "integrations", href: "/settings/integrations" },
    { key: "shortcuts", href: "/settings/shortcuts" },
  ] },
] as const;

export type SettingsNavItem = (typeof SETTINGS_NAV_GROUPS)[number]["items"][number];
export type SettingsNavKey = SettingsNavItem["key"];
export const SETTINGS_NAV: readonly SettingsNavItem[] = SETTINGS_NAV_GROUPS.flatMap((group) => [...group.items]);

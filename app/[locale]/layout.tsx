import type { Metadata, Viewport } from "next";
import { createHash } from "node:crypto";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { DialogPlatformProvider } from "@/components/overlay/DialogActions";
import { dialogPlatform } from "@/lib/dialog-platform";
import Script from "next/script";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/context/theme-context";
import { MailProvider } from "@/context/mail-context";
import { MailboxIconProvider } from "@/context/mailbox-icon-context";
import { MAILBOX_ICON_COOKIE, parseMailboxIconPreferences } from "@/lib/mailbox-icon-preferences";
import { initialMailboxGlyphs } from "@/lib/mailbox-svg.server";
import { snapshotMailboxIconPreferences } from "@/lib/mailbox-icon-snapshot";
import { loadInitialAccountIconPreferences } from "@/lib/tastemail/icon-preferences-initial";
import { ToastProvider } from "@/context/toast-context";
import { ToastStack } from "@/components/toast/ToastStack";
import { DENSITY_MAP, FONT_OPTIONS, RADIUS_MAP, THEME_STORAGE_KEY } from "@/lib/theme-presets";
import { WorkspaceSidebarProvider } from "@/context/workspace-sidebar-context";
import { WORKSPACE_SIDEBAR_COOKIE_NAME } from "@/lib/workspace-sidebar";
import { SettingsProvider } from "@/context/settings-context";
import { SettingsNavigationGuard } from "@/components/settings/SettingsNavigationGuard";
import { mailDataMode } from "@/lib/tastemail/server";
import { loadPublicBranding } from "@/lib/tastemail/branding";
import { BrandingProvider } from "@/context/branding-context";
import { loadServerTheme } from "@/lib/tastemail/theme";
import { TASTEMAIL_SESSION_COOKIE_NAME } from "@/lib/tastemail/session";
import { mergeThemePreference, serverThemeSettings, type ServerTheme } from "@/lib/server-theme";
import { themeStylesheetHref } from "@/lib/theme-assets";
import { loadInitialGeneralSettings } from "@/lib/tastemail/general-settings-initial";
import { loadImageSnapshot } from "@/lib/tastemail/image-assets";
import { ImageAssetsProvider } from "@/context/image-assets-context";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const FONT_STACKS = Object.fromEntries(
  FONT_OPTIONS.map(({ value, stack }) => [value, stack])
);

function themeBootstrapScript(policy: ServerTheme | null) { return `(() => {
  try {
    const raw = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    const stored = raw ? JSON.parse(raw) : null;
    const theme = (${mergeThemePreference.toString()})(${JSON.stringify(serverThemeSettings(policy))}, stored, ${JSON.stringify((policy?.userSelectionAllowed ?? true) && !policy?.theme.version)});
    const root = document.documentElement;
    const fontStacks = ${JSON.stringify(FONT_STACKS)};
    const radiusMap = ${JSON.stringify(RADIUS_MAP)};
    const densityMap = ${JSON.stringify(DENSITY_MAP)};
    if (!${Boolean(policy?.theme.version)}) {
    if (typeof theme.primaryColor === "string") root.style.setProperty("--color-primary", theme.primaryColor);
    if (typeof theme.accentColor === "string") root.style.setProperty("--color-accent", theme.accentColor);
    if (fontStacks[theme.fontFamily]) root.style.setProperty("--font-app", fontStacks[theme.fontFamily]);
    if (radiusMap[theme.radius]) root.style.setProperty("--radius-app", radiusMap[theme.radius]);
    }
    if (densityMap[theme.density]) root.style.setProperty("--density-preference-scale", densityMap[theme.density]);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    root.classList.toggle("dark", theme.colorScheme === "dark" || (theme.colorScheme === "system" && prefersDark));
    root.dataset.sidebarPosition = theme.sidebarPosition;
    root.dataset.layoutStyle = theme.layoutStyle;
  } catch {}
})();`; }

// Root layout: resolves/validates the `[locale]` segment, wires up the
// three global context providers (theme, mail state, toasts), and mounts
// the toast stack once for the whole app.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

// Pre-render a static shell for every supported locale.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Makes the resolved locale available to server components (e.g. getTranslations)
  // rendered further down the tree without re-reading the route param.
  setRequestLocale(locale);
  const [messages, cookieStore, branding, requestHeaders] = await Promise.all([getMessages(), cookies(), loadPublicBranding(), headers()]);
  const platform = dialogPlatform(requestHeaders.get("user-agent"), requestHeaders.get("sec-ch-ua-platform"));
  const mode = mailDataMode();
  const token = cookieStore.get(TASTEMAIL_SESSION_COOKIE_NAME)?.value ?? null;
  const [serverTheme, serverIcons, generalSettings, brandImage, avatarImage] = await Promise.all([
    loadServerTheme(token),
    token ? loadInitialAccountIconPreferences(token).catch(() => null) : Promise.resolve(null),
    loadInitialGeneralSettings(token),
    loadImageSnapshot("brand"),
    loadImageSnapshot("avatar", token),
  ]);
  const initialTheme = serverThemeSettings(serverTheme);
  const packageHref = themeStylesheetHref(serverTheme, Boolean(cookieStore.get(TASTEMAIL_SESSION_COOKIE_NAME)?.value));
  const themeStyle = serverTheme ? {
    ...(!packageHref ? {
    "--color-primary": initialTheme.primaryColor, "--color-accent": initialTheme.accentColor,
    "--font-app": FONT_STACKS[initialTheme.fontFamily], "--radius-app": RADIUS_MAP[initialTheme.radius],
    } : {}),
    "--density-preference-scale": DENSITY_MAP[initialTheme.density],
  } as CSSProperties : undefined;
  const sidebarInitiallyCollapsed =
    cookieStore.get(WORKSPACE_SIDEBAR_COOKIE_NAME)?.value === "1";
  const initialIconPreferences = parseMailboxIconPreferences(cookieStore.get(MAILBOX_ICON_COOKIE)?.value);
  const serverIconPreferences = serverIcons ? snapshotMailboxIconPreferences(serverIcons.account, serverIcons.preferences) : {};
  const accessibility = generalSettings.snapshot?.settings.accessibility;
  const initialStyle = { ...themeStyle, ...(accessibility ? { "--user-font-scale": `${Number(accessibility.fontScale) / 100}` } : {}) } as CSSProperties;

  return (
    <html lang={locale} className={`h-full antialiased${serverTheme?.colorMode === "dark" ? " dark" : ""}`} style={initialStyle} data-high-contrast={accessibility?.highContrast} data-reduce-motion={accessibility?.reduceMotion} data-enhanced-focus={accessibility?.enhancedFocus} data-screen-reader-details={accessibility?.screenReaderDetails} data-keyboard-navigation={accessibility?.keyboardNavigation} data-theme={serverTheme?.theme.id} data-theme-package={packageHref ? "1" : undefined} data-density={serverTheme?.density} data-color-scheme={serverTheme?.colorMode} data-layout-style={initialTheme.layoutStyle} data-sidebar-position={initialTheme.sidebarPosition} suppressHydrationWarning>
      <head>{packageHref ? <link key={packageHref} rel="stylesheet" href={packageHref} data-theme-stylesheet="package" /> : null}</head>
      <body className="h-full">
        <Script
          id="gxmail-theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript(serverTheme) }}
        />
        <NextIntlClientProvider messages={messages} now={new Date()}>
          <DialogPlatformProvider platform={platform}>
          <BrandingProvider branding={branding}>
          <ImageAssetsProvider key={createHash("sha256").update(token ?? "anonymous").digest("hex")} brand={brandImage} avatar={avatarImage}>
            <ThemeProvider serverTheme={serverTheme}>
              <WorkspaceSidebarProvider
                initialCollapsed={sidebarInitiallyCollapsed}
              >
                <MailboxIconProvider key={serverIcons?.account ?? "unavailable"} initialServer={serverIcons} serverRequired={Boolean(token)} initialPreferences={initialIconPreferences} initialGlyphs={initialMailboxGlyphs({ ...initialIconPreferences, ...serverIconPreferences })}>
                <MailProvider mode={mode} loadWorkspaceData={false}>
                  <SettingsProvider key={`${generalSettings.accountId ?? "anonymous"}:${generalSettings.accountAddress}`} accountId={generalSettings.accountId} accountAddress={generalSettings.accountAddress} initialSnapshot={generalSettings.snapshot} initialError={generalSettings.error}>
                    <ToastProvider>
                      {children}
                      <SettingsNavigationGuard />
                      <ToastStack />
                    </ToastProvider>
                  </SettingsProvider>
                </MailProvider>
                </MailboxIconProvider>
              </WorkspaceSidebarProvider>
            </ThemeProvider>
          </ImageAssetsProvider></BrandingProvider>
          </DialogPlatformProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

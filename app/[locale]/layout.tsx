import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Script from "next/script";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/context/theme-context";
import { MailProvider } from "@/context/mail-context";
import { ToastProvider } from "@/context/toast-context";
import { ToastStack } from "@/components/toast/ToastStack";
import { DEFAULT_THEME, DENSITY_MAP, FONT_OPTIONS, RADIUS_MAP, THEME_STORAGE_KEY } from "@/lib/theme-presets";
import { WorkspaceSidebarProvider } from "@/context/workspace-sidebar-context";
import { WORKSPACE_SIDEBAR_COOKIE_NAME } from "@/lib/workspace-sidebar";
import { SettingsProvider } from "@/context/settings-context";
import { SettingsNavigationGuard } from "@/components/settings/SettingsNavigationGuard";

const FONT_STACKS = Object.fromEntries(
  FONT_OPTIONS.map(({ value, stack }) => [value, stack])
);

const THEME_BOOTSTRAP_SCRIPT = `(() => {
  try {
    const raw = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (!stored || typeof stored !== "object") return;
    const theme = { ...${JSON.stringify(DEFAULT_THEME)}, ...stored };
    const root = document.documentElement;
    const fontStacks = ${JSON.stringify(FONT_STACKS)};
    const radiusMap = ${JSON.stringify(RADIUS_MAP)};
    const densityMap = ${JSON.stringify(DENSITY_MAP)};
    if (typeof theme.primaryColor === "string") root.style.setProperty("--color-primary", theme.primaryColor);
    if (typeof theme.accentColor === "string") root.style.setProperty("--color-accent", theme.accentColor);
    if (fontStacks[theme.fontFamily]) root.style.setProperty("--font-app", fontStacks[theme.fontFamily]);
    if (radiusMap[theme.radius]) root.style.setProperty("--radius-app", radiusMap[theme.radius]);
    if (densityMap[theme.density]) root.style.setProperty("--density-preference-scale", densityMap[theme.density]);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    root.classList.toggle("dark", theme.colorScheme === "dark" || (theme.colorScheme === "system" && prefersDark));
    root.dataset.sidebarPosition = theme.sidebarPosition;
    root.dataset.layoutStyle = theme.layoutStyle;
  } catch {}
})();`;

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
  const [messages, cookieStore] = await Promise.all([getMessages(), cookies()]);
  const sidebarInitiallyCollapsed =
    cookieStore.get(WORKSPACE_SIDEBAR_COOKIE_NAME)?.value === "1";

  return (
    <html lang={locale} className="h-full antialiased" suppressHydrationWarning>
      <body className="h-full">
        <Script
          id="gxmail-theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
        <NextIntlClientProvider messages={messages} now={new Date()}>
            <ThemeProvider>
              <WorkspaceSidebarProvider
                initialCollapsed={sidebarInitiallyCollapsed}
              >
                <MailProvider>
                  <SettingsProvider>
                    <ToastProvider>
                      {children}
                      <SettingsNavigationGuard />
                      <ToastStack />
                    </ToastProvider>
                  </SettingsProvider>
                </MailProvider>
              </WorkspaceSidebarProvider>
            </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

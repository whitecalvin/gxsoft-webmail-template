import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { DrawerHistory } from "../lib/drawer-history.ts";

const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const shellCode = compile("../components/layout/WorkspaceLayout.tsx");
const titleCode = compile("../components/settings/SettingsHeaderTitle.tsx");
const navigation = {};
const textMarkup = value => renderToStaticMarkup(React.createElement("span", null, value)).slice(6, -7);
new Function("exports", "require", compile("../lib/settings-navigation.ts"))(navigation, require);
function render(locale, pathname) {
  const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const dependencies = name => {
    if (name === "next-intl") return { useTranslations: namespace => key => {
      const value = key.split(".").reduce((result, part) => result?.[part], messages[namespace]);
      assert.equal(typeof value, "string", `${locale}:${namespace}.${key}`);
      return value;
    } };
    if (name === "@/i18n/navigation") return { usePathname: () => pathname, Link: props => React.createElement("a", props) };
    if (name === "@/lib/settings-navigation") return navigation;
    if (name === "@/components/settings/SettingsHeaderTitle") return title;
    if (name === "@/context/theme-context") return { useTheme: () => ({ draft: {} }) };
    if (name === "@/context/workspace-sidebar-context") return { useWorkspaceSidebar: () => ({ collapsed: false }) };
    if (name === "./LiveSessionGate") return { LiveSessionGate: ({ children }) => children };
    if (name === "./TopBar") return { TopBar: ({ title }) => React.createElement("header", null, title) };
    if (name.startsWith("./") || name.startsWith("@/components/")) return new Proxy({}, { get: () => () => null });
    if (name === "@/lib/overlay-scroll-lock") return { lockBodyScroll: () => () => {} };
    if (name === "@/lib/drawer-history") return { DrawerHistory };
    return require(name);
  };
  const title = {};
  new Function("exports", "require", titleCode)(title, dependencies);
  const shell = {};
  new Function("exports", "require", shellCode)(shell, dependencies);
  return { html: renderToStaticMarkup(React.createElement(shell.WorkspaceShell, { sessionUsername: null, sessionAccountId: null }, "content")), messages };
}
for (const locale of ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
  const landing = render(locale, "/settings");
  assert.ok(landing.html.includes(textMarkup(landing.messages.settingsSystem.title)));
  assert.match(landing.html, /<header><nav/);
  const search = render(locale, "/search");
  assert.ok(search.html.includes(`<header>${textMarkup(search.messages.topBar.searchPlaceholder)}</header>`));
  const files = render(locale, "/files");
  assert.ok(files.html.includes(`<header>${textMarkup(files.messages.filesPage.title)}</header>`));
  for (const item of navigation.SETTINGS_NAV) {
    const { html, messages } = render(locale, item.href);
    assert.ok(html.includes(textMarkup(messages.settingsSystem.nav[item.key])), `${locale}:${item.href}`);
    assert.match(html, /href="\/settings"/);
  }
}
assert.match(render("ko", "/calendar").html, /<header><\/header>/);
assert.match(render("ko", "/settings-not-a-route").html, /<header><\/header>/);
console.log("settings header SSR: landing and all sections render before effects in ten locales; unrelated routes unchanged");

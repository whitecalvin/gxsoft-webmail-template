import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL("../components/layout/MobileWorkspaceNavigation.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function render(locale, pathname, menuOpen = false) {
  const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const exports = {};
  new Function("exports", "require", code)(exports, name => {
    if (name === "next-intl") return { useTranslations: namespace => key => {
      const value = messages[namespace]?.[key]; assert.equal(typeof value, "string", `${locale}:${namespace}.${key}`); return value;
    } };
    if (name === "@/context/mail-context") return { useMail: () => ({ setActiveFolder: () => {} }) };
    if (name === "@/i18n/navigation") return { usePathname: () => pathname, Link: props => React.createElement("a", props) };
    return require(name);
  });
  return renderToStaticMarkup(React.createElement(exports.MobileWorkspaceNavigation, { onOpenMenu: () => {}, menuOpen }));
}
for (const locale of ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
  const html = render(locale, "/settings/locale");
  assert.match(html, /md:hidden/);
  assert.match(html, /safe-area-inset-bottom/);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  assert.match(html, /href="\/settings"[^>]*aria-current="page"/);
  assert.equal((html.match(/<a /g) ?? []).length, 4);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /min-h-14/);
}
assert.match(render("ko", "/search"), /href="\/"[^>]*aria-current="page"/);
assert.match(render("ko", "/", true), /aria-controls="workspace-navigation-drawer"/);
const shell = readFileSync(new URL("../components/layout/WorkspaceLayout.tsx", import.meta.url), "utf8");
assert.match(shell, /<\/main>\s*<MobileWorkspaceNavigation/);
const sidebar = readFileSync(new URL("../components/layout/WorkspaceSidebar.tsx", import.meta.url), "utf8");
assert.doesNotMatch(sidebar, /workspace-menu-item-enter|animationDelay/, "drawer contents must be visible immediately, without staggered fades");
assert.match(shell, /transition-transform duration-300/, "panel slide is preserved");
console.log("mobile navigation: ten locales, nested-route indicator, menu drawer, touch targets and non-overlapping safe-area footer passed");

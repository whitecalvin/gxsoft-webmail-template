import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import * as ReactDOM from "react-dom";
import { adminResources } from "../lib/tastemail/admin-management.ts";
import { adminDraftDestination } from "../lib/admin-draft-navigation.ts";
function compile(file, modules) {
  const exports = {};
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => { if (!(name in modules)) throw new Error(name); return modules[name]; } });
  return exports;
}
const navigation = compile("lib/admin-navigation.ts", { "./tastemail/admin-management": { adminResources } });
test("every administrator resource has exactly one grouped route", () => {
  const items = navigation.adminMenuGroups.flatMap(group => [...group.items]);
  assert.equal(items.length, new Set(items).size);
  assert.deepEqual([...items].sort(), ["dashboard", "system", "onboarding", "quarantine", "shared-mailboxes", ...adminResources].sort());
  for (const section of items) assert.equal(navigation.adminSectionFromPath(navigation.adminSectionHref(section)), section);
  for (const path of ["/admin/unknown", "/admin/users/extra", "/administer", "/mailboxes"]) assert.equal(navigation.adminSectionFromPath(path), null);
});
test("shared shell renders route title, accessible mobile dialog and bottom indicator", () => {
  const icon = props => React.createElement("svg", props);
  const guard = compile("components/admin/AdminDraftGuard.tsx", {
    react: React, "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "next-intl": { useTranslations: namespace => key => `${namespace}.${key}` },
    "@/components/overlay/ConfirmDialog": { ConfirmDialog: () => null },
    "@/lib/admin-draft-navigation": { adminDraftDestination },
  });
  const shell = compile("components/admin/AdminShell.tsx", {
    react: React, "react/jsx-runtime": jsx, "react-dom": ReactDOM,
    "lucide-react": { Menu: icon, X: icon, ArrowLeft: icon, Search: icon, Activity: icon, Users: icon, Shield: icon, Server: icon, Palette: icon, KeyRound: icon },
    "next-intl": { useTranslations: namespace => key => `${namespace}.${key}` },
    "@/i18n/navigation": { usePathname: () => "/admin/users", useRouter: () => ({ push() {} }), Link: props => React.createElement("a", props) },
    "@/lib/admin-navigation": navigation,
    "@/context/branding-context": { useBranding: () => ({ displayName: "Synthetic", logoUrl: null }) },
    "@/components/layout/BrandMark": { BrandMark: () => React.createElement("span", null, "G") },
    "./AdminDraftGuard": guard,
    "@/components/ui/Tooltip": { Tooltip: ({ children }) => React.createElement("span", null, children) },
  });
  const html = renderToStaticMarkup(React.createElement(shell.AdminShell, { initial: { service: { hostname: "synthetic.example", status: "running" } } }, React.createElement("p", null, "page-content")));
  assert.match(html, /<h1[^>]*>adminManage.users<\/h1>/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /aria-controls="admin-mobile-navigation"/);
  assert.match(html, /<dialog[^>]*id="admin-mobile-navigation"/);
  assert.match(html, /safe-area-inset-bottom/);
  assert.match(html, /page-content/);
  assert.match(html, /role="search"/);
  assert.match(html, /Ctrl K/);
  assert.match(html, /w-62\.5/);
  assert.match(html, /synthetic.example/);
  assert.match(html, /<header class="relative flex h-14 shrink-0 items-center/);
  assert.match(html, /class="ml-2 shrink-0 rounded-\(--radius-app\) p-2/);
  assert.match(html, /grid grid-cols-5 gap-1/);
  assert.match(html, /href="\/admin\/users" aria-current="page"[^>]*min-h-14/);
  assert.match(html, /id="admin-header-search"[^>]*class="hidden absolute/);
  assert.match(html, /<footer class="hidden[^>]*lg:flex/);
  assert.doesNotMatch(html, /title="adminShell.groups/);
  const mailHeader = readFileSync(new URL("../components/layout/TopBar.tsx", import.meta.url), "utf8");
  assert.match(mailHeader, /flex h-14 min-w-0 items-center/);
  assert.match(mailHeader, /className="ml-2 rounded-\(--radius-app\) p-2/);
});
test("live layout preserves child pages while mock routes retain legacy content", () => {
  const layout = readFileSync(new URL("../app/[locale]/admin/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<AdminShell initial=\{initial\}>\{children\}<\/AdminShell>/);
  assert.doesNotMatch(layout, /mock|Mock/);
  const manager = readFileSync(new URL("../components/admin/LiveAdminManager.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(manager, /adminResources\.map|setResource/);
  assert.match(manager, /AdminPageActions/);
});

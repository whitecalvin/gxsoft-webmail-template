import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as navigation from "../lib/workspace-navigation.ts";
import { FOLDERS } from "../lib/mail-folders.ts";

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const encoded = value => encodeURIComponent(JSON.stringify(value));
const boxes = [{ id: "custom-id", name: "Work", role: null }, { id: "inbox-id", name: "Inbox", role: "inbox" }];
assert.deepEqual(navigation.sidebarGroupsFromCookie(encoded({ mailboxGroup: true, shortcutsGroup: false, unknown: true, collaborationGroup: "true" })), { mailboxGroup: true, shortcutsGroup: false });
for (const raw of [undefined, "%not-json", "null", "[]", "x".repeat(2049)]) {
  assert.deepEqual(navigation.sidebarGroupsFromCookie(raw), {});
  assert.deepEqual(navigation.mailSelectionFromCookie(raw, boxes), { folder: "inbox", mailboxId: null });
}
assert.equal(navigation.navigationCookieName("groups", " Person@Example.COM "), navigation.navigationCookieName("groups", "person@example.com"));
assert.notEqual(navigation.navigationCookieName("mail", "a@example.com"), navigation.navigationCookieName("mail", "b@example.com"));
for (const folder of ["all", "inbox", "starred", "drafts", "sent", "archive", "spam", "trash"]) {
  assert.deepEqual(navigation.mailSelectionFromCookie(encoded({ folder, mailboxId: "ignore" }), boxes), { folder, mailboxId: null });
}
assert.deepEqual(navigation.mailSelectionFromCookie(encoded({ folder: "custom", mailboxId: "custom-id" }), boxes), { folder: "custom", mailboxId: "custom-id" });
for (const mailboxId of ["missing", "inbox-id"]) assert.deepEqual(navigation.mailSelectionFromCookie(encoded({ folder: "custom", mailboxId }), boxes), { folder: "inbox", mailboxId: null });
assert.deepEqual(navigation.mailSelectionFromCookie(encoded({ folder: "javascript:alert(1)" }), boxes), { folder: "inbox", mailboxId: null });

const context = {};
const source = read("context/workspace-sidebar-context.tsx");
new Function("exports", "require", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText)(context, name => {
  if (name === "@/lib/workspace-navigation") return navigation;
  if (name === "@/lib/workspace-sidebar") return { WORKSPACE_SIDEBAR_COOKIE_NAME: "collapsed", WORKSPACE_SIDEBAR_COOKIE_MAX_AGE: 31536000 };
  return require(name);
});
function Probe() { const value = context.useWorkspaceSidebar(); return React.createElement("button", { "aria-expanded": !value.collapsedGroups.mailboxGroup, "data-compact": value.collapsed }, "menu"); }
const html = renderToStaticMarkup(React.createElement(context.WorkspaceSidebarProvider, { initialCollapsed: true, initialGroups: navigation.sidebarGroupsFromCookie(encoded({ mailboxGroup: true })), navigationAccount: "synthetic@example.com" }, React.createElement(Probe)));
assert.match(html, /aria-expanded="false"/);
assert.match(html, /data-compact="true"/);

// Run the actual click handlers: no refresh/server action and no effect-delayed restore.
const mailSource = read("context/mail-context.tsx");
const ast = ts.createSourceFile("mail.tsx", mailSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ["setActiveFolderAndClear", "selectCustomMailbox"].includes(node.name.getText(ast))) handlers[node.name.getText(ast)] = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const writes = [];
const set = value => writes.push(value);
const globals = { pathname: "/", activeFolder: "inbox", activeCustomMailboxId: null, navigationAccount: "synthetic@example.com", mailboxes: boxes, navigationCookieName: navigation.navigationCookieName, persistNavigationCookie: (name, value) => writes.push([name, value]), setActiveFolder: set, setActiveCustomMailboxId: set, setActiveCustomMailboxName: set, setSelectedEmailId: set, setPagePosition: set, setMutationStatus: set, pendingAutoRead: { clear() {} } };
for (const [name, expression] of Object.entries(handlers)) {
  const code = ts.transpileModule(`const handler = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const handler = new Function(...Object.keys(globals), `${code}; return handler;`)(...Object.values(globals));
  handler(name === "selectCustomMailbox" ? "custom-id" : "sent");
}
const cookies = writes.filter(Array.isArray);
assert.deepEqual(cookies.map(item => item[1]), [{ folder: "sent", mailboxId: null }, { folder: "custom", mailboxId: "custom-id" }]);
const layout = read("app/[locale]/(workspace)/layout.tsx");
assert.match(layout, /initialGroups=\{initialGroups\}/);
assert.match(layout, /initialSelection=\{initialSelection\}/);
assert.match(mailSource, /useState<FolderId>\(initialSelection.folder\)/);
assert.match(mailSource, /useState<string \| null>\(initialSelection.mailboxId\)/);
const sidebarExports = {};
let currentPath = "/", selection = { folder: "sent", mailboxId: null };
let renderedMenus = [];
new Function("exports", "require", ts.transpileModule(read("components/layout/WorkspaceSidebar.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText)(sidebarExports, name => {
  if (name === "next-intl") return { useLocale: () => "en", useTranslations: () => key => key };
  if (name === "@/i18n/navigation") return { usePathname: () => currentPath, useRouter: () => ({}), Link: props => React.createElement("a", props) };
  if (name === "@/context/mail-context") return { useMail: () => ({ activeFolder: selection.folder, activeCustomMailboxId: selection.mailboxId, unreadCounts: Object.fromEntries(FOLDERS.map(item => [item.id, 0])), mailboxes: [], mailboxSummaryStatus: "ready" }) };
  if (name === "@/context/theme-context") return { useTheme: () => ({ draft: { layoutStyle: "classic", sidebarPosition: "left" } }) };
  if (name === "@/context/settings-context") return { useSettings: () => ({ saved: { inbox: { showMailboxCounts: false, showMailboxStorage: false } } }) };
  if (name === "@/context/branding-context") return { useBranding: () => ({ displayName: "Synthetic" }) };
  if (name === "@/context/toast-context") return { useToast: () => ({}) };
  if (name === "@/lib/mail-folders") return { FOLDERS };
  if (name === "@/lib/all-mailbox-storage") return { allMailboxStorage: () => null };
  if (name === "@/lib/tastemail/client-session") return {};
  if (name === "./SidebarMenuGroup") return { SidebarMenuGroup: props => props.children };
  if (name === "@/components/mail/InboxContextMenu") return { InboxContextMenu: props => { renderedMenus.push(props); return props.children; } };
  if (name === "@/components/mail/PersonalFolderTree") return { PersonalFolderTree: props => props.activeId ? React.createElement("button", { "aria-current": "page" }, props.activeId) : null };
  if (name.startsWith("@/components/")) return new Proxy({}, { get: () => () => null });
  return require(name);
});
const renderSidebar = (props = {}) => { renderedMenus = []; return renderToStaticMarkup(React.createElement(sidebarExports.WorkspaceSidebar, props)); };
assert.match(renderSidebar(), /<button[^>]*aria-current="page"[^>]*>[\s\S]*?sent/);
assert.match(renderSidebar(), /overflow-x-hidden overflow-y-auto pb-3 px-3/);
assert.deepEqual(renderedMenus.map(menu => menu.folder), FOLDERS.map(folder => folder.id));
assert.ok(renderedMenus.every(menu => menu.showTrigger && menu.menuLabel === menu.folder));
renderSidebar({ collapsed: true });
assert.deepEqual(renderedMenus.map(menu => menu.folder), FOLDERS.map(folder => folder.id));
assert.ok(renderedMenus.every(menu => !menu.showTrigger));
const mobileSidebar = renderSidebar({ mobile: true });
assert.match(mobileSidebar, /w-70 max-w-\[calc\(100vw-2rem\)\]/);
assert.match(mobileSidebar, /overflow-x-hidden overflow-y-auto pb-3 px-1/);
assert.match(mobileSidebar, /\[&amp;_\[data-mailbox-row\]\]:px-1/);
assert.match(mobileSidebar, /gap-1 px-1/);
assert.match(mobileSidebar, /flex size-11 shrink-0 items-center justify-center/);
// Tool links use the 44px icon slot as their touch target, without extra vertical padding.
assert.equal([...mobileSidebar.matchAll(/<a[^>]*min-h-11 gap-1 px-1[^>]*style="padding-block:0"/g)].length, 9);
assert.match(renderSidebar(), /style="padding-block:calc\(0\.625rem \* var\(--density-scale\)\)"/);
assert.equal([...mobileSidebar.matchAll(/data-mailbox-row="true"/g)].length, FOLDERS.length);
assert.ok(renderedMenus.every(menu => menu.showTrigger));
selection = navigation.mailSelectionFromCookie(encoded({ folder: "custom", mailboxId: "custom-id" }), boxes);
assert.match(renderSidebar(), /<button aria-current="page">custom-id<\/button>/);
for (const path of ["/settings/locale", "/security", "/calendar", "/files", "/rules", "/settings/rules", "/settings/filters"]) {
  currentPath = path;
  const target = ["/rules", "/settings/rules", "/settings/filters"].includes(path) ? "/settings/rules" : path === "/security" || path.startsWith("/settings") ? "/settings" : path;
  const markup = renderSidebar();
  assert.match(markup, new RegExp(`<a[^>]*href="${target}"[^>]*aria-current="page"`));
  assert.equal([...markup.matchAll(/aria-current="page"/g)].length, 1);
}
console.log("navigation SSR: cookie bounds, account separation, stale IDs, first-render groups and CSR mail selection passed");

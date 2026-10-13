import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { SIDEBAR_GROUP_KEYS } from "../lib/workspace-navigation.ts";

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const context = read("context/workspace-sidebar-context.tsx");
const tree = ts.createSourceFile("context.tsx", context, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "toggleGroup") callback = node.initializer.arguments[0];
  ts.forEachChild(node, visit);
}
visit(tree);
let collapsedGroups = {};
const callbackCode = ts.transpileModule(`const toggle = ${callback.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const toggleGroup = new Function("setCollapsedGroups", "groupsRef", "SIDEBAR_GROUP_KEYS", "navigationAccount", `${callbackCode}; return toggle;`)(update => { collapsedGroups = update; }, { current: {} }, SIDEBAR_GROUP_KEYS, null);
const exports = {};
const code = ts.transpileModule(read("components/layout/SidebarMenuGroup.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
new Function("exports", "require", code)(exports, name => name === "@/context/workspace-sidebar-context" ? { useWorkspaceSidebar: () => ({ collapsedGroups, toggleGroup }) } : require(name));
const render = (key, compact = false) => renderToStaticMarkup(React.createElement(exports.SidebarMenuGroup, { groupKey: key, title: key, compact }, React.createElement("a", { href: "/synthetic" }, "Synthetic menu")));
assert.match(render("mailboxGroup"), /class="mb-1 mt-2"/);
assert.match(render("collaborationGroup", true), /class="mx-2 my-2 border-t/);
for (const key of ["mailboxGroup", "collaborationGroup", "mailManagementGroup", "shortcutsGroup"]) {
  assert.match(render(key), /aria-expanded="true"/);
  toggleGroup(key);
  assert.match(render(key), /aria-expanded="false"/);
  assert.match(render(key), / hidden=""/);
  assert.doesNotMatch(render(key, true), / hidden=""|aria-expanded/);
  toggleGroup(key);
  assert.match(render(key), /aria-expanded="true"/);
}
toggleGroup("mailboxGroup");
toggleGroup("shortcutsGroup");
assert.deepEqual(collapsedGroups, { mailboxGroup: true, collaborationGroup: false, mailManagementGroup: false, shortcutsGroup: true });
const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
  React.createElement(exports.SidebarMenuGroup, { groupKey: "mailboxGroup", title: "Desktop", compact: false }, "menu"),
  React.createElement(exports.SidebarMenuGroup, { groupKey: "mailboxGroup", title: "Mobile", compact: false }, "menu")));
const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length);
assert.match(read("components/layout/WorkspaceSidebar.tsx"), /SidebarMenuGroup groupKey="mailboxGroup"/);
console.log("sidebar groups: independent toggles, shared mobile/desktop state, keyboard buttons, unique IDs and compact navigation preserved passed");

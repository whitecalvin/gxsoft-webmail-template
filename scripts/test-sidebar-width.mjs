import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const exports = {};
const source = readFileSync(new URL("../lib/sidebar-width.ts", import.meta.url), "utf8");
new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
const { sidebarWidth, draggedSidebarWidth } = exports;
for (const value of [null, undefined, "", " ", "invalid", Infinity, NaN]) assert.equal(sidebarWidth(value), 250);
assert.equal(sidebarWidth("315"), 315);
assert.equal(sidebarWidth(315.8), 316);
assert.equal(sidebarWidth(-100), 200);
assert.equal(sidebarWidth(900), 480);
assert.equal(draggedSidebarWidth(250, 50, false), 300);
assert.equal(draggedSidebarWidth(250, 50, true), 200);
assert.equal(draggedSidebarWidth(250, -50, true), 300);
assert.equal(draggedSidebarWidth(250, 1000, false), 480);

const component = readFileSync(new URL("../components/layout/ResizableWorkspaceSidebar.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("sidebar.tsx", component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "persist") callback = node.initializer; ts.forEachChild(node, visit); }
visit(tree); assert.ok(callback);
const js = ts.transpileModule(`const action = ${callback.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let local, stored, notifications = 0;
const persist = new Function("sidebarWidth", "setLocal", "key", "window", "EVENT", "persistLayoutWidthCookie", "cookieName", `${js}; return action;`)(sidebarWidth, value => { local = value; }, "account-scoped", { localStorage: { setItem: (key, value) => { stored = [key, value]; } }, dispatchEvent: () => notifications++ }, "resize", () => {}, "fixture-cookie");
persist(340);
assert.deepEqual(local, { key: "account-scoped", width: 340 });
assert.deepEqual(stored, ["account-scoped", "340"]);
assert.equal(notifications, 1);
console.log("sidebar width: limits, restored values, left/right drag, persistence and reset bounds passed");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const exports = {};
const values = new Map([["gxmail:sidebar-width:v1:other", "420"]]);
const cookies = [];
const events = [];
const code = ts.transpileModule(readFileSync(new URL("../lib/reset-layout-width.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function("exports", "require", "window", "CustomEvent", code)(exports, name => {
  if (name === "./sidebar-width") return { SIDEBAR_DEFAULT_WIDTH: 250 };
  if (name === "./mail-list-width") return { MAIL_LIST_DEFAULT_WIDTH: 448 };
  if (name === "./layout-width-cookie") return {
    layoutWidthCookieName: (kind, account) => `gxmail_${kind}_width_v1_${encodeURIComponent(account)}`,
    persistLayoutWidthCookie: (...args) => cookies.push(args),
  };
  throw new Error(name);
}, { localStorage: { setItem: (key, value) => values.set(key, value) }, dispatchEvent: event => events.push(event) }, class { constructor(type, { detail }) { this.type = type; this.detail = detail; } });
exports.resetLayoutWidth(" TEST@example.test ", "sidebar");
exports.resetLayoutWidth("test@example.test", "mail-list");
assert.equal(values.get("gxmail:sidebar-width:v1:test%40example.test"), "250");
assert.equal(values.get("gxmail:mail-list-width:v1:test%40example.test"), "448");
assert.equal(values.get("gxmail:sidebar-width:v1:other"), "420");
assert.deepEqual(cookies, [["gxmail_sidebar_width_v1_test%40example.test", 250], ["gxmail_mail-list_width_v1_test%40example.test", 448]]);
assert.deepEqual(events.map(event => [event.type, event.detail]), [
  ["gxmail:sidebar-width", { account: "test@example.test", reset: true, width: 250 }],
  ["gxmail:mail-list-width", { account: "test@example.test", reset: true, width: 448 }],
]);
exports.resetLayoutWidth(" ", "sidebar"); assert.equal(events.length, 2);
for (const component of ["ResizableWorkspaceSidebar", "ResizableMailList"]) {
  const source = readFileSync(new URL(`../components/layout/${component}.tsx`, import.meta.url), "utf8");
  assert.match(source, /event.detail.account === account/);
  assert.match(source, /drag.current = null; setResizing\(false\); setLocal\(/);
}
console.log("layout width reset: independent account-scoped defaults, SSR cookies and immediate resize override passed");

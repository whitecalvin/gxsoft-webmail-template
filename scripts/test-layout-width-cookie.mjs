import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/layout-width-cookie.ts", import.meta.url), "utf8");
const exports = {}, document = { cookie: "" }, window = { location: { protocol: "https:" } };
new Function("exports", "document", "window", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports, document, window);
const { layoutWidthCookieName, readLayoutWidthCookie, persistLayoutWidthCookie } = exports;
const name = layoutWidthCookieName("sidebar", " USER@example.test ");
assert.equal(name, layoutWidthCookieName("sidebar", "user@example.test"));
assert.notEqual(name, layoutWidthCookieName("sidebar", "other@example.test"));
assert.notEqual(name, layoutWidthCookieName("mail-list", "user@example.test"));
assert.equal(readLayoutWidthCookie(`other=10; ${name}=345; tail=20`, name), "345");
assert.equal(readLayoutWidthCookie(`${name}extra=345`, name), null);
persistLayoutWidthCookie(name, 345);
assert.ok(document.cookie.startsWith(`${name}=345;`));
assert.ok(document.cookie.includes("Path=/"));
assert.ok(document.cookie.includes("SameSite=Lax"));
assert.ok(document.cookie.endsWith("; Secure"));
window.location.protocol = "http:";
persistLayoutWidthCookie(name, 250);
assert.ok(!document.cookie.includes("Secure"));

// Verify actual server snapshots in both controls, not a mock rendering path.
for (const [file, exported, value] of [["ResizableWorkspaceSidebar", "sidebar", 345], ["ResizableMailList", "mailList", 503]]) {
  const text = readFileSync(new URL(`../components/layout/${file}.tsx`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let snapshot;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "useSyncExternalStore") snapshot = node.arguments[2];
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(snapshot);
  const js = ts.transpileModule(`const snapshot = ${snapshot.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const renderSnapshot = new Function("initialWidth", `${js}; return snapshot;`)(value);
  assert.equal(renderSnapshot(), value, exported);
}
const layout = readFileSync(new URL("../app/[locale]/(workspace)/layout.tsx", import.meta.url), "utf8");
assert.ok(layout.includes('cookieStore.get(layoutWidthCookieName("sidebar", widthAccount))'));
assert.ok(layout.includes('cookieStore.get(layoutWidthCookieName("mail-list", widthAccount))'));
console.log("width SSR: account isolation, cookie parsing, HTTP/HTTPS persistence and both server snapshots passed");

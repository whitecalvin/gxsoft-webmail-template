import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const exports = {};
const source = readFileSync(new URL("../lib/mail-list-width.ts", import.meta.url), "utf8");
new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
const { mailListWidth } = exports;
for (const value of [null, undefined, "", "invalid", NaN]) assert.equal(mailListWidth(value), 448);
assert.equal(mailListWidth("500"), 500);
assert.equal(mailListWidth(0), 260);
assert.equal(mailListWidth(1000), 720);
assert.equal(mailListWidth(720, 800), 480);
assert.equal(mailListWidth(720, 1200), 720);
assert.equal(mailListWidth(448, 640), 320);
assert.equal(mailListWidth(448 + 100, 900), 548);
assert.equal(mailListWidth(448 - 300, 900), 260);

const component = readFileSync(new URL("../components/layout/ResizableMailList.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("pane.tsx", component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "persist") callback = node.initializer; ts.forEachChild(node, visit); }
visit(tree); assert.ok(callback);
const js = ts.transpileModule(`const action = ${callback.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let local, stored;
const action = new Function("mailListWidth", "available", "setLocal", "key", "window", "EVENT", "persistLayoutWidthCookie", "cookieName", `${js}; return action;`)(mailListWidth, 800, value => { local = value; }, "account-scoped", { localStorage: { setItem: (key, value) => { stored = [key, value]; } }, dispatchEvent: () => {} }, "resize", () => {}, "fixture-cookie");
action(700);
assert.deepEqual(local, { key: "account-scoped", width: 480 });
assert.deepEqual(stored, ["account-scoped", "480"]);
console.log("mail list width: bounds, viewport clamp, drag values and account-scoped persistence passed");

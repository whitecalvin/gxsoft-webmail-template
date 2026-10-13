import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { mailViewKey, mailPageTransitionPosition, isCurrentMailView, shouldRetainMailPage } from "../lib/mail-view.ts";

const text = readFileSync(new URL("../context/mail-context.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("context.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let failure;
const initializers = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) initializers.set(node.name.text, node.initializer.getText(file));
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "catch" &&
      node.arguments[0]?.getText(file).includes("shouldRetainMailPage")) failure = node.arguments[0].getText(file);
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(failure);
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const previousKey = mailViewKey("inbox", null, 0);
const nextKey = mailViewKey("inbox", null, 50);
const derive = new Function("mode", "loadedViewKey", "viewKey", "loadStatus", "mailPageTransitionPosition", "isCurrentMailView",
  compile(["transitionPosition", "pageTransitionPending", "pageCurrent", "currentLoadStatus"].map(key => `const ${key} = ${initializers.get(key)};`).join("\n")) + "return {transitionPosition,pageTransitionPending,pageCurrent,currentLoadStatus};");
assert.deepEqual(derive("live", previousKey, nextKey, "ready", mailPageTransitionPosition, isCurrentMailView),
  { transitionPosition: 0, pageTransitionPending: true, pageCurrent: true, currentLoadStatus: "ready" });
assert.equal(derive("live", previousKey, mailViewKey("archive", null, 0), "ready", mailPageTransitionPosition, isCurrentMailView).currentLoadStatus, "loading");

function runFailure(reason, { aborted = false, changed = false } = {}) {
  const result = { emails: ["confirmed"], total: 100, selection: "confirmed", loaded: previousKey, position: 50, cleared: false };
  const env = {
    controller: { signal: { aborted } }, startedAtRevision: 0, mailboxDataRevision: { current: changed ? 1 : 0 },
    lastSuccessfulViewKey: { current: previousKey }, viewKey: nextKey, summaryKey: "0",
    shouldRetainMailPage, mailPageTransitionPosition,
    setLoadAttempt: () => { result.retried = true; },
    setEmails: value => { result.emails = value; }, setPageTotal: value => { result.total = value; },
    setSelectedEmailId: value => { result.selection = value; }, pendingAutoRead: { clear: () => { result.cleared = true; } },
    setMailboxes: value => { result.mailboxes = value; }, setAccountAddress: value => { result.account = value; },
    setSummaryStatus: value => { result.summary = value; }, setLoadedMailboxKey: () => {},
    setLoadStatus: value => { result.status = value; }, setPagePosition: value => { result.position = value; },
    setLoadedViewKey: value => { result.loaded = value; },
    loadAttempt: 2, setRefreshReceipt: value => { result.receipt = value; },
  };
  new Function(...Object.keys(env), compile(`const handler = ${failure};`) + "return handler;")(...Object.values(env))(new Error(reason));
  return result;
}
for (const status of ["retryable", "rateLimited", "unavailable"]) {
  const result = runFailure(status);
  assert.deepEqual(result.emails, ["confirmed"]);
  assert.equal(result.total, 100);
  assert.equal(result.selection, "confirmed");
  assert.equal(result.position, 0);
  assert.equal(result.loaded, previousKey);
  assert.equal(result.status, status);
  assert.equal(result.receipt.status, status);
}
for (const status of ["unauthorized", "forbidden"]) {
  const result = runFailure(status);
  assert.deepEqual(result.emails, []);
  assert.deepEqual(result.mailboxes, []);
  assert.equal(result.selection, null);
  assert.equal(result.account, null);
}
assert.equal(runFailure("retryable", { aborted: true }).status, undefined);
assert.equal(runFailure("retryable", { changed: true }).retried, true);
console.log("CSR pagination: actual loading derivation and failure callback preserve confirmed pages; auth failures clear data.");

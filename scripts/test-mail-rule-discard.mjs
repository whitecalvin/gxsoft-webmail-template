import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const text = readFileSync("components/settings/LiveMailRules.tsx", "utf8");
const tree = ts.createSourceFile("rules.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = {};
function visit(node) { if (ts.isVariableDeclaration(node)) nodes[node.name.getText(tree)] = node.initializer; ts.forEachChild(node, visit); }
visit(tree);
function handler(name, bindings) {
  const js = ts.transpileModule(`const handler = ${nodes[name].getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${js};return handler;`)(...Object.values(bindings));
}
const calls = [], savingRef = { current: false }, saveUncertainRef = { current: false }, discardIntentRef = { current: null };
const data = { rules: [{ id: "synthetic" }] };
const bindings = { savingRef, saveUncertainRef, discardIntentRef, data, dirty: true, applicationLocked: false,
  setDiscardIntent: value => calls.push(["dialog", value]), onClose: () => calls.push(["close"]),
  importEpoch: { current: 0 }, importingRef: { current: false },
  setImporting: value => calls.push(["importing", value]), setImportPreview() {}, setDeleteKey() {},
  setStatus: value => calls.push(["status", value]), setAttempt: update => calls.push(["attempt", update(0)]),
  persistedRules: value => value.rules, setDrafts: value => calls.push(["drafts", value]),
  setSelectedKey: value => calls.push(["selected", value]), setFeedback() {}, setCheckResult() {},
};
bindings.requestDiscard = handler("requestDiscard", bindings);
bindings.cancelDiscard = handler("cancelDiscard", bindings);
const close = handler("close", bindings), confirm = handler("confirmDiscard", bindings);
close(); assert.deepEqual(calls, [["dialog", "close"]]);
bindings.cancelDiscard(); assert.ok(!calls.some(call => call[0] === "close"));
calls.length = 0; close(); confirm(); confirm();
assert.equal(calls.filter(call => call[0] === "close").length, 1);
calls.length = 0; bindings.requestDiscard("reset"); bindings.cancelDiscard();
assert.ok(!calls.some(call => call[0] === "drafts"));
bindings.requestDiscard("reset"); confirm(); assert.equal(calls.filter(call => call[0] === "drafts").length, 1);
calls.length = 0; saveUncertainRef.current = true; bindings.requestDiscard("reload"); confirm(); confirm();
assert.equal(calls.filter(call => call[0] === "attempt").length, 1);
assert.equal(bindings.importEpoch.current, 1);
calls.length = 0; savingRef.current = true; close(); bindings.requestDiscard("reset"); confirm(); assert.equal(calls.length, 0);
assert.doesNotMatch(text, /window\.confirm\(live\("discardNotice"\)\)/);
assert.match(text, /<ConfirmDialog[^\n]*description=\{live\("discardNotice"\)\}/);
console.log("Rule discard: common confirmation for close/reset/reload, cancellation preserves drafts, duplicate and save guards passed.");

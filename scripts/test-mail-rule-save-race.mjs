import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { clientMutationFailure } from "../lib/tastemail/client-session-status.ts";
import { simpleRuleMoveReady, simpleMailRuleSource, EMPTY_SIMPLE_RULE } from "../lib/simple-mail-rule.ts";

const text = readFileSync(new URL("../components/settings/LiveMailRules.tsx", import.meta.url), "utf8");
const source = ts.createSourceFile("LiveMailRules.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = {};
function visit(node) {
  if (ts.isVariableDeclaration(node)) nodes[node.name.getText(source)] = node.initializer;
  ts.forEachChild(node, visit);
}
visit(source);
function compile(name, bindings = {}) {
  assert.ok(nodes[name], name);
  const js = ts.transpileModule(`const handler = ${nodes[name].getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js};return handler;`)(...Object.values(bindings));
}
const ERRORS = compile("ERRORS");
const REQUEST_ERRORS = compile("REQUEST_ERRORS", { ERRORS });
const requestFailureReason = compile("requestFailureReason", { REQUEST_ERRORS });
const persistedRules = compile("persistedRules");
const rule = { key: "synthetic", id: "synthetic", name: "Synthetic", kind: "filter", source: "keep;", enabled: false };
function fixture(fetch, confirm = true, options = {}) {
  const state = { savingRef: { current: false }, saveUncertainRef: { current: false }, saveConfirmationRef: { current: false }, updates: 0, dataUpdates: 0 };
  const bindings = {
    ...state, data: { mode: "rules", revision: 1, rules: [rule] }, dirty: true, applicationLocked: false,
    drafts: [{ ...rule, ...options.rule }], selected: rule, saving: false, saveUncertain: false,
    simpleRuleMoveReady, mailboxes: options.mailboxes ?? [], mailboxSummaryStatus: options.status ?? "ready", designer: key => key,
    fetch, window: { confirm: () => confirm }, live: (key) => key, service: (key) => key,
    ERRORS, requestFailureReason, persistedRules, clientMutationFailure,
    setSaving: () => {}, setSaveUncertain: () => {}, setFeedback: () => {}, setSelectedKey: () => {},
    setSaveConfirmation: () => {},
    setDrafts: () => { state.updates += 1; }, setData: () => { state.dataUpdates += 1; },
  };
  const save = compile("save", bindings);
  return { state, requestSave: save, save: async () => { await save(); if (confirm) await save(true); }, update: compile("update", bindings), move: compile("move", bindings), add: compile("add", bindings) };
}
let resolve;
let requests = 0;
const pending = new Promise((done) => { resolve = done; });
const busy = fixture(async () => { requests += 1; return pending; });
const first = busy.save();
await busy.save();
busy.update(rule.key, { name: "Must not overwrite pending save" });
busy.move(1);
busy.add();
assert.equal(requests, 1);
assert.equal(busy.state.updates, 0);
resolve(Response.json({ revision: 2, rules: [rule] }));
await first;
assert.equal(busy.state.savingRef.current, false);
assert.equal(busy.state.dataUpdates, 1);
assert.equal(busy.state.updates, 1);
for (const response of [() => { throw new Error("response lost"); }, () => Response.json({}), () => Response.json({ status: "conflict" }, { status: 409 })]) {
  let calls = 0;
  const uncertain = fixture(async () => { calls += 1; return response(); });
  await uncertain.save();
  await uncertain.save();
  uncertain.update(rule.key, { name: "Blocked" });
  uncertain.add();
  assert.equal(calls, 1);
  assert.equal(uncertain.state.saveUncertainRef.current, true);
  assert.equal(uncertain.state.savingRef.current, false);
  assert.equal(uncertain.state.updates, 0);
}
let rejectedCalls = 0;
const rejected = fixture(async () => { rejectedCalls += 1; return Response.json({ status: "invalid_request" }, { status: 400 }); });
await rejected.save();
assert.equal(rejected.state.saveUncertainRef.current, false);
assert.equal(rejected.state.savingRef.current, false);
rejected.update(rule.key, { name: "Corrected" });
assert.equal(rejected.state.updates, 1);
assert.equal(rejectedCalls, 1);
const declined = fixture(() => { throw new Error("Must not request without confirmation"); }, false);
await declined.save();
assert.equal(declined.state.savingRef.current, false);
assert.equal(declined.state.saveConfirmationRef.current, true, "opening the common dialog does not write to server");
declined.state.saveConfirmationRef.current = false;
await declined.requestSave(true);
assert.equal(declined.state.savingRef.current, false, "cancel consumes pending confirmation");
assert.ok(!text.includes("window.confirm"), "rule save uses no native confirmation");
assert.match(text, /saveConfirmation \? <ConfirmDialog/);
const movingRule = { source: simpleMailRuleSource({ ...EMPTY_SIMPLE_RULE, action: "move", mailbox: "Archive", stop: true }) };
for (const options of [{}, { status: "retryable", mailboxes: [{ name: "Archive" }] }, { mailboxes: [{ name: "Renamed" }] }]) {
  const missing = fixture(() => { throw new Error("Missing target must never issue PUT"); }, true, { ...options, rule: movingRule });
  await missing.save();
  assert.equal(missing.state.savingRef.current, false);
}
let moveSaves = 0;
const destination = fixture(async () => { moveSaves += 1; return Response.json({ revision: 2, rules: [{ ...rule, ...movingRule }] }); }, true, { rule: movingRule, mailboxes: [{ name: "Archive" }] });
await destination.save();
assert.equal(moveSaves, 1);
assert.match(text, /<fieldset disabled=\{saving \|\| saveUncertain\}/);
console.log("Mail rules: duplicate saves and pending edits blocked; uncertain outcomes locked; definite errors editable; confirmation preserved.");

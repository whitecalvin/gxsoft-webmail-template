import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { makeAwaySource, readAwaySource, replaceManagedAwayRule, validAwayDraft } from "../lib/away-rule.ts";
import { clientMutationFailure } from "../lib/tastemail/client-session-status.ts";

// Actual callback execution with synthetic dependencies; no real Sieve changes.
const source = ts.createSourceFile("LiveAwaySettings.tsx",
  readFileSync(new URL("../components/settings/LiveAwaySettings.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) nodes.set(node.name.text, node);
  if (ts.isVariableDeclaration(node)) nodes.set(node.name.getText(source), node.initializer);
  ts.forEachChild(node, visit);
}
visit(source);
function compile(name, bindings = {}) {
  const node = nodes.get(name);
  assert.ok(node, `Missing callback ${name}`);
  const text = ts.isFunctionDeclaration(node) ? node.getText(source) : `const ${name} = ${node.getText(source)};`;
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return ${name};`)(...Object.values(bindings));
}
const draft = { subject: "Synthetic away", message: "Synthetic response", enabled: false };
const data = { revision: 1, mode: "rules", source: "", enabled: false, rules: [] };
const saved = { ...data, revision: 2, rules: [{ id: "synthetic-vacation", kind: "vacation", enabled: false, source: makeAwaySource(draft) }] };
function fixture(fetch) {
  const state = { savingRef: { current: false }, saveBlockedRef: { current: false },
    uncertain: false, feedback: "", saving: false, reloads: 0, saved: null };
  const bindings = {
    fetch, data, draft, managed: null, editable: true, dirty: true, status: "ready", uncertain: false,
    savingRef: state.savingRef, saveBlockedRef: state.saveBlockedRef,
    validAwayDraft, makeAwaySource, readAwaySource, replaceManagedAwayRule, clientMutationFailure,
    snapshot: compile("snapshot"), statuses: compile("statuses"), window: { confirm: () => true },
    away: key => key, service: key => key,
    setSaving: value => { state.saving = value; }, setFeedback: value => { state.feedback = value; },
    setUncertain: value => { state.uncertain = value; }, setStatus: () => {},
    setAttempt: update => { state.reloads = update(state.reloads); },
    setData: value => { state.saved = value; }, setDraft: () => {},
  };
  return { state, save: compile("save", bindings), reload: compile("reload", bindings) };
}
for (const response of [
  () => { throw new Error("check timeout"); },
  () => Response.json({ status: "retryable" }, { status: 503 }),
  () => Response.json({ valid: false }),
  () => Response.json({ valid: "true" }),
  () => Response.json([]),
  () => new Response("not JSON"),
]) {
  let checks = 0;
  const run = fixture(async (path) => { assert.equal(path, "/api/mail/rules/check"); checks++; return response(); });
  await run.save(); await run.save();
  assert.equal(checks, 2, "Failed read-only validation may be manually retried");
  assert.equal(run.state.uncertain, false);
  assert.equal(run.state.saveBlockedRef.current, false);
  assert.equal(run.state.saved, null);
  assert.notEqual(run.state.feedback, "uncertain");
}
for (const outcome of [
  () => { throw new Error("lost PUT response"); },
  () => Response.json({ status: "retryable" }, { status: 503 }),
  () => Response.json({ status: "conflict" }, { status: 409 }),
  () => Response.json({ ...saved, revision: 1 }),
]) {
  let calls = 0;
  const run = fixture(async path => { calls++; return path.endsWith("/check") ? Response.json({ valid: true }) : outcome(); });
  await run.save(); await run.save();
  assert.equal(calls, 2, "Old callback cannot revalidate or rewrite after uncertain/conflicting PUT");
  assert.equal(run.state.saveBlockedRef.current, true);
  assert.equal(run.state.uncertain, true);
  assert.equal(run.state.saved, null);
}
let resolvePending, calls = 0;
const pending = new Promise(resolve => { resolvePending = resolve; });
const run = fixture(async path => { calls++; return path.endsWith("/check") ? pending : Response.json(saved); });
const first = run.save();
await run.save(); run.reload();
assert.equal(calls, 1); assert.equal(run.state.reloads, 0);
resolvePending(Response.json({ valid: true })); await first;
assert.equal(calls, 2); assert.deepEqual(run.state.saved, saved);
assert.equal(run.state.feedback, "saved"); assert.equal(run.state.saving, false);
run.reload(); await run.save();
assert.equal(run.state.reloads, 1);
assert.equal(calls, 2, "Reload blocks a pre-render stale save callback");
console.log("Away saves: confirmed validation, no write on preflight failure, duplicate/uncertain/reload guards passed.");

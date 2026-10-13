// Execute the actual save/review callbacks; no real account or network traffic.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { clientMutationFailure } from "../lib/tastemail/client-session-status.ts";

const source = ts.createSourceFile("LiveSignatureSettings.tsx",
  readFileSync(new URL("../components/settings/LiveSignatureSettings.tsx", import.meta.url), "utf8"),
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
  assert.ok(node, `Missing actual callback ${name}`);
  const text = ts.isFunctionDeclaration(node) ? node.getText(source) : `const ${name} = ${node.getText(source)};`;
  const js = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return ${name};`)(...Object.values(bindings));
}
const identity = {
  id: "11111111-1111-4111-8111-111111111111", address: "fixture@example.test",
  displayName: null, isDefault: true, mailSignature: "Synthetic signature",
  mailSignatureHtml: "", mailSignatureFormat: "text/plain",
};
function fixture(fetch, status = "ready") {
  const state = { mutationLock: { current: false }, uncertainSave: { current: false },
    uncertain: false, successes: 0, errors: [], attempts: 0, saving: false };
  const bindings = {
    fetch, draft: { ...identity, identityId: identity.id }, dirty: true, valid: true,
    status, saveUncertain: false, mutationLock: state.mutationLock, uncertainSave: state.uncertainSave,
    SAVE_TIMEOUT_MS: compile("SAVE_TIMEOUT_MS"), SAVE_ERRORS: compile("SAVE_ERRORS"),
    clientMutationFailure, snapshotFrom: compile("snapshotFrom"), formFrom: compile("formFrom"),
    toast: { success: () => state.successes++, error: value => state.errors.push(value) },
    live: key => key, service: key => key, setSnapshot: () => {}, setDraft: () => {}, setEditorRevision: () => {},
    setSaveUncertain: value => { state.uncertain = value; }, setStatus: () => {},
    setAttempt: update => { state.attempts = update(state.attempts); },
    setSaving: value => { state.saving = value; },
  };
  return { state, save: compile("save", bindings), review: compile("reviewSave", bindings) };
}
let resolvePending, requests = 0;
const pending = new Promise(resolve => { resolvePending = resolve; });
const concurrent = fixture(async () => { requests++; return pending; });
const first = concurrent.save();
await concurrent.save();
concurrent.state.uncertainSave.current = true;
concurrent.review();
assert.equal(concurrent.state.uncertainSave.current, true, "Review cannot clear a running write guard");
assert.equal(requests, 1);
resolvePending(Response.json({ identities: [identity] }));
await first;
assert.equal(concurrent.state.successes, 1);
assert.equal(concurrent.state.mutationLock.current, false);
assert.equal(concurrent.state.saving, false);

for (const response of [
  () => { throw new Error("lost response"); },
  () => Response.json({ status: "retryable" }, { status: 503 }),
  () => new Response("not json", { status: 200 }),
  () => Response.json({ identities: [] }),
  () => Response.json({ status: "mutation_uncertain" }, { status: 409 }),
]) {
  let calls = 0;
  const run = fixture(async () => { calls++; return response(); });
  await run.save(); await run.save(); // Same pre-render closure must remain blocked.
  assert.equal(calls, 1);
  assert.equal(run.state.uncertainSave.current, true);
  assert.equal(run.state.uncertain, true);
  assert.deepEqual(run.state.errors, ["saveUncertain"]);
  assert.equal(run.state.successes, 0);
  run.review();
  assert.equal(run.state.uncertainSave.current, false);
  assert.equal(run.state.uncertain, false);
}
for (const [code, reason] of [[400, "invalid_request"], [401, "unauthorized"],
  [403, "forbidden"], [429, "rateLimited"], [409, "conflict"]]) {
  const run = fixture(async () => Response.json({ status: reason }, { status: code }));
  await run.save();
  assert.equal(run.state.uncertainSave.current, false);
  assert.equal(run.state.uncertain, false);
  assert.equal(run.state.successes, 0);
  assert.notEqual(run.state.errors[0], "saveUncertain");
  assert.equal(run.state.attempts, 1, "Reconcile server state without repeating PATCH");
}
const loading = fixture(async () => { throw new Error("Must not write while loading"); }, "loading");
loading.state.uncertainSave.current = true; loading.review();
assert.equal(loading.state.uncertainSave.current, true);
await loading.save();
console.log("Signature saves: duplicate/stale callback guards, uncertainty review and confirmed rejection separation passed.");

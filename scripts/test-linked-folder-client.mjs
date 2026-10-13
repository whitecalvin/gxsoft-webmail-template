import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url), read = p => readFileSync(p, "utf8");
function load(path, deps = {}) {
  const exports = {}, js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", js)(exports, name => name in deps ? deps[name] : require(name)); return exports;
}
const accounts = load("lib/linked-accounts.ts"), mail = load("lib/linked-mail.ts", { "./linked-accounts": accounts });
const folders = load("lib/linked-folders.ts", { "./linked-accounts": accounts, "./linked-mail": mail });
const auth = load("lib/linked-authentication.ts", { "./linked-accounts": accounts });
const id = "11111111-1111-4111-8111-111111111111";
const before = { id, email: "synthetic@naver.com", provider: "naver", status: "connected", revision: 3, credentialGeneration: 2, capabilities: { read: true, sync: true, send: false, mutate: false } };
const data = { accounts: [before], limit: 10, authenticationAvailable: { naver: true, gmail: true, tastemail: false } };
const receipt = folders.requireLinkedFolders({ encoding: "imapModifiedUtf7", folders: ["INBOX", "&ZeVnLIqe-", "A&-B"] }, before);
assert.deepEqual(folders.linkedFoldersReceipt({ ...receipt, secret: "not projected" }, before), receipt);
for (const patch of [{ linkedAccountId: "22222222-2222-4222-8222-222222222222" }, { revision: 4 }, { credentialGeneration: 3 }, { encoding: "utf8" }, { folders: [receipt.folders[0], receipt.folders[0]] }, { folders: [{ value: "INBOX", label: "other" }] }, { folders: [{ value: "日本語", label: "日本語" }] }, { folders: Array(101).fill(receipt.folders[0]) }]) {
  assert.throws(() => folders.linkedFoldersReceipt({ ...receipt, ...patch }, before));
}
const source = read("context/linked-accounts-context.tsx"), section = source.slice(source.indexOf("  async function refresh()"), source.indexOf("\n  return <Context.Provider"));
const js = ts.transpileModule(section, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness({ initial = data, respond = () => Response.json(receipt) } = {}) {
  const state = { snapshot: { status: "ready", data: initial }, busy: false, uncertain: false, error: null, calls: [] };
  const pending = { current: false }, unresolved = { current: null }, generation = { current: 1 };
  const deps = { snapshot: state.snapshot, pending, unresolved, generation,
    setBusy: v => { state.busy = v; }, setSnapshot: v => { state.snapshot = typeof v === "function" ? v(state.snapshot) : v; }, setUncertain: v => { state.uncertain = v; }, setError: v => { state.error = v; },
    fetch: async (...args) => { state.calls.push(args); return respond(...args); },
    failures: ["unauthorized", "forbidden", "conflict", "mutation_uncertain", ...auth.LINKED_AUTH_FAILURES],
    requireLinkedAccounts: accounts.requireLinkedAccounts, linkedAuthResolved: auth.linkedAuthResolved,
    linkedFoldersBefore: folders.linkedFoldersBefore, linkedFoldersReceipt: folders.linkedFoldersReceipt };
  return { state, pending, unresolved, generation, ...new Function(...Object.keys(deps), `${js}; return {loadFolders,mutate,authenticate,startOAuth,refresh};`)(...Object.values(deps)) };
}
let h = harness(); assert.deepEqual(await h.loadFolders(id), receipt); assert.equal(h.state.busy, false); assert.equal(h.state.uncertain, false);
assert.equal(h.state.calls[0][0], `/api/mail/linked-accounts/${id}/folders`);
assert.equal(h.state.calls[0][1].method, "POST"); assert.equal(h.state.calls[0][1].cache, "no-store"); assert.deepEqual(JSON.parse(h.state.calls[0][1].body), { expectedRevision: 3 });
for (const account of [{ ...before, status: "reauthRequired", capabilities: { ...before.capabilities, sync: false } }, { ...before, status: "pendingAuth" }, { ...before, revision: Number.MAX_SAFE_INTEGER }]) {
  h = harness({ initial: { ...data, accounts: [account] } }); assert.equal(await h.loadFolders(id), null); assert.equal(h.state.calls.length, 0);
}
h = harness(); assert.equal(await h.loadFolders("bad"), null); assert.equal(h.state.calls.length, 0);
let finish; h = harness({ respond: () => new Promise(resolve => { finish = resolve; }) }); let waiting = h.loadFolders(id);
assert.equal(h.state.busy, true); assert.equal(await h.loadFolders(id), null);
assert.equal(await h.mutate({ method: "DELETE", id, input: { expectedRevision: 3 } }), false);
assert.equal(await h.authenticate({}), false); assert.equal(await h.startOAuth(id, "ko"), false); assert.equal(h.state.calls.length, 1);
finish(Response.json(receipt)); assert.deepEqual(await waiting, receipt);
for (const respond of [() => { throw new Error("network"); }, () => Response.json({ ...receipt, revision: 4 }), () => Response.json(receipt, { status: 201 }), () => Response.json({ status: "conflict" }, { status: 409 }), () => Response.json({ status: "remote_unavailable", uncertain: true }, { status: 502 })]) {
  h = harness({ respond }); assert.equal(await h.loadFolders(id), null); assert.equal(h.state.uncertain, true); assert.equal(h.state.busy, false);
  assert.deepEqual(h.unresolved.current, { kind: "folders", before }); assert.doesNotMatch(JSON.stringify(h.unresolved.current), /INBOX|folders\":\[/);
  await h.loadFolders(id); await h.mutate({}); assert.equal(h.state.calls.length, 1);
}
for (const status of ["conflict", "remote_unavailable", "forbidden", "unauthorized"]) {
  h = harness({ respond: () => Response.json({ status, uncertain: false }, { status: status === "conflict" ? 409 : status === "remote_unavailable" ? 502 : status === "forbidden" ? 403 : 401 }) });
  assert.equal(await h.loadFolders(id), null); assert.equal(h.state.uncertain, false); assert.equal(h.state.error, status);
  if (["unauthorized", "forbidden"].includes(status)) assert.equal(h.state.snapshot.data, null);
}
h = harness({ respond: () => new Promise(resolve => { finish = resolve; }) }); waiting = h.loadFolders(id); h.generation.current++; finish(Response.json(receipt));
assert.equal(await waiting, null); assert.equal(h.state.error, null); assert.equal(h.state.uncertain, false);
assert.equal(auth.linkedAuthResolved(data, { kind: "folders", before }), false);
assert.equal(auth.linkedAuthResolved({ ...data, accounts: [{ ...before, status: "temporaryError" }] }, { kind: "folders", before }), false);
let count = 0; h = harness({ respond: () => ++count === 1 ? Promise.reject(new Error("network")) : Response.json(data) });
await h.loadFolders(id); await h.refresh(); assert.equal(h.state.snapshot.status, "ready"); assert.equal(h.state.uncertain, true); await h.loadFolders(id); assert.equal(h.state.calls.length, 2);
console.log("Linked folder client: actual Provider scope, serialization, uncertainty, generation fence and receipt validation passed (synthetic only).");

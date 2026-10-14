import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url), read = p => readFileSync(p, "utf8");
function load(path, deps = {}) { const exports = {}, js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; new Function("exports", "require", js)(exports, n => n === "server-only" ? {} : n in deps ? deps[n] : n.startsWith(".") && existsSync(resolve(dirname(path), `${n}.ts`)) ? load(resolve(dirname(path), `${n}.ts`)) : require(n)); return exports; }
const accounts = load("lib/linked-accounts.ts"), mail = load("lib/linked-mail.ts", { "./linked-accounts": accounts });
const folders = load("lib/linked-folders.ts", { "./linked-accounts": accounts, "./linked-mail": mail });
const sync = load("lib/linked-sync.ts", { "./linked-folders": folders, "./linked-mail": mail }), auth = load("lib/linked-authentication.ts", { "./linked-accounts": accounts });
const id = "11111111-1111-4111-8111-111111111111", before = { id, email: "synthetic@gmail.com", provider: "gmail", revision: 2, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
const data = { accounts: [before], limit: 10, authenticationAvailable: { gmail: true, naver: true, tastemail: false } }, input = { expectedRevision: 2, folder: "A&-B/ +" };
const receipt = { mode: "receiveMirror", folder: input.folder, uidValidity: 3, scannedThrough: 50, nextCursor: 51, cycleComplete: false, messages: 4, remoteMutation: false }, expected = { ...receipt, linkedAccountId: id, revision: 2, credentialGeneration: 1 };
assert.deepEqual(sync.linkedSyncRequest(id, input), input); assert.deepEqual(sync.linkedSyncBefore(data, id, input), before); assert.deepEqual(sync.requireLinkedSync({ ...receipt, internal: "removed" }, before, input), expected);
for (const patch of [{ expectedRevision: "2" }, { expectedRevision: 0 }, { expectedRevision: Number.MAX_SAFE_INTEGER }, { folder: "" }, { folder: "\n" }, { folder: "x".repeat(1025) }, { mode: "other" }]) assert.equal(sync.linkedSyncRequest(id, { ...input, ...patch }), null);
for (const patch of [{ folder: "other" }, { remoteMutation: true }, { uidValidity: 0 }, { messages: 51 }, { messages: -1 }, { nextCursor: 52 }, { cycleComplete: true }, { mode: "send" }]) assert.throws(() => sync.requireLinkedSync({ ...receipt, ...patch }, before, input));
assert.equal(sync.requireLinkedSync({ ...receipt, nextCursor: 1, cycleComplete: true, messages: 0 }, before, input).cycleComplete, true);
assert.throws(() => sync.linkedSyncReceipt({ ...expected, revision: 3 }, before, input));
class LinkedAuthError extends Error { constructor(status, uncertain = false) { super(status); this.status = status; this.uncertain = uncertain; } }
class LinkedAccountError extends Error { constructor(status) { super(status); this.status = status; } }
let response = Response.json(receipt), listing = data, after = null, listingCalls = 0, calls = [];
const server = { assertLiveApiConfigured() {}, tastemailLinkedSync: async (...args) => { calls.push(args); if (response === "network") throw new Error("network"); return response; } };
const adapter = load("lib/tastemail/linked-sync.ts", { "../linked-accounts": accounts, "../linked-sync": sync, "./linked-accounts": { LinkedAccountError, requestLinkedAccounts: async () => ++listingCalls % 2 === 0 && after ? after : listing }, "./linked-authentication": { LinkedAuthError }, "./server": server });
assert.deepEqual(await adapter.requestLinkedSync("synthetic-token", id, input), expected); assert.deepEqual(calls[0], [id, "synthetic-token", input]);
let count = calls.length; listing = { ...data, accounts: [{ ...before, status: "reauthRequired", capabilities: { ...before.capabilities, sync: false } }] }; await assert.rejects(adapter.requestLinkedSync("synthetic-token", id, input), e => e.status === "auth_unavailable" && !e.uncertain); assert.equal(calls.length, count); listing = data;
for (const [http, type, status] of [[401, "", "unauthorized"], [403, "", "forbidden"], [429, "", "rateLimited"], [409, "stateMismatch", "conflict"], [409, "reauthRequired", "reauth_required"], [404, "", "not_deployed"], [502, "remoteUnavailable", "remote_unavailable"]]) { response = Response.json({ type }, { status: http }); await assert.rejects(adapter.requestLinkedSync("synthetic-token", id, input), e => e.status === status && !e.uncertain); }
for (const bad of ["network", Response.json({ ...receipt, remoteMutation: true }), Response.json(receipt, { status: 201 }), new Response("x".repeat(32769))]) { response = bad; await assert.rejects(adapter.requestLinkedSync("synthetic-token", id, input), e => e.uncertain); }
response = new Response("", { status: 401 }); await assert.rejects(adapter.requestLinkedSync("synthetic-token", id, input), e => e.status === "unauthorized" && !e.uncertain);
listingCalls = 0; after = { ...data, accounts: [{ ...before, revision: 3 }] }; response = Response.json(receipt); await assert.rejects(adapter.requestLinkedSync("synthetic-token", id, input), e => e.uncertain); after = null;
let token = null;
const route = load("lib/tastemail/linked-sync-route.ts", { "./contact-route": { sameOrigin: r => r.headers.get("origin") === new URL(r.url).origin }, "./server": server, "./session": { tastemailSessionToken: async () => token }, "../linked-sync": sync, "./linked-authentication": { LinkedAuthError }, "./linked-sync": adapter });
const request = (body = input, origin = "https://synthetic.test", headerOrigin = origin) => new Request(`${origin}/api/mail/linked-accounts/${id}/sync`, { method: "POST", headers: { origin: headerOrigin, "content-type": "application/json" }, body: JSON.stringify(body) });
assert.equal((await route.linkedSyncRoute(request(), id)).status, 401); token = "synthetic-token";
assert.equal((await route.linkedSyncRoute(request(undefined, undefined, "https://untrusted.test"), id)).status, 403);
assert.equal((await route.linkedSyncRoute(request(undefined, "http://192.168.0.109"), id)).status, 400);
count = calls.length; assert.equal((await route.linkedSyncRoute(request({ ...input, owner: id }), id)).status, 400); assert.equal((await route.linkedSyncRoute(request({ ...input, folder: "x".repeat(5000) }), id)).status, 400); assert.equal(calls.length, count);
response = Response.json(receipt); const result = await route.linkedSyncRoute(request(), id); assert.equal(result.status, 200); assert.deepEqual(await result.json(), expected); assert.match(result.headers.get("cache-control"), /private, no-store/);
const transport = load("lib/tastemail/server.ts"), oldFetch = globalThis.fetch, oldTimeout = AbortSignal.timeout, oldOrigin = process.env.TASTEMAIL_API_URL, deadlines = [];
try {
  process.env.TASTEMAIL_API_URL = "https://synthetic.test"; AbortSignal.timeout = ms => { deadlines.push(ms); return new AbortController().signal; };
  globalThis.fetch = async (url, init) => { assert.equal(url, `https://synthetic.test/api/user/linked-accounts/${id}/sync`); assert.equal(init.method, "POST"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store"); assert.deepEqual(JSON.parse(init.body), input); return Response.json(receipt); };
  await transport.tastemailLinkedSync(id, "synthetic-token", input); assert.deepEqual(deadlines, [65000]); assert.throws(() => transport.tastemailLinkedSync("bad", "synthetic-token", input));
} finally { globalThis.fetch = oldFetch; AbortSignal.timeout = oldTimeout; if (oldOrigin === undefined) delete process.env.TASTEMAIL_API_URL; else process.env.TASTEMAIL_API_URL = oldOrigin; }
// Provider sync now uses durable operations, while legacy BFF/transport checks above remain.
const source = ts.createSourceFile("provider.tsx", read("context/linked-accounts-context.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let fn;
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === "syncFolder") fn = node; ts.forEachChild(node, visit); }
visit(source); assert.ok(fn);
const js = ts.transpileModule(fn.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let operationCalls = 0, operation = { sync: expected };
const syncFolder = new Function("performOperation", `${js};return syncFolder;`)(async (target, action) => { operationCalls++; assert.equal(target, id); assert.deepEqual(action, { kind: "sync", folder: input.folder }); return operation; });
assert.deepEqual(await syncFolder(id, input.folder), expected); assert.equal(operationCalls, 1);
operation = null; assert.equal(await syncFolder(id, input.folder), null);
operation = { sync: null }; assert.equal(await syncFolder(id, input.folder), null);
assert.doesNotMatch(fn.getText(source), /fetch\(|\/sync|linkedSyncBefore|linkedSyncReceipt/);
assert.equal(auth.linkedAuthResolved(data, { kind: "sync", before }), false);
assert.match(read("app/api/mail/linked-accounts/[id]/sync/route.ts"), /await context.params/);
console.log("Linked sync: legacy batch contract/BFF/transport, durable sync delegation and empty-result suppression passed; engine concurrency/generation fencing is covered separately (synthetic only).");

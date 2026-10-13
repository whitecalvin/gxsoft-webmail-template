import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url), read = p => readFileSync(p, "utf8");
function load(path, deps = {}) { const exports = {}, js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; new Function("exports", "require", js)(exports, n => n === "server-only" ? {} : n in deps ? deps[n] : require(n)); return exports; }
const accounts = load("lib/linked-accounts.ts"), mail = load("lib/linked-mail.ts", { "./linked-accounts": accounts }), folders = load("lib/linked-folders.ts", { "./linked-accounts": accounts, "./linked-mail": mail });
const id = "11111111-1111-4111-8111-111111111111", before = { id, provider: "gmail", email: "synthetic@gmail.com", revision: 2, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
const data = { accounts: [before], limit: 10, authenticationAvailable: { gmail: true, naver: true, tastemail: false } };
const encode = text => `&${Buffer.from(text, "utf16le").swap16().toString("base64").replaceAll("/", ",").replace(/=+$/, "")}-`;
for (const label of ["개발", "日本語", "台北", "😀", "\ufeff한글"]) assert.equal(folders.linkedFolderLabel(encode(label)), label);
assert.equal(folders.linkedFolderLabel("~peter/mail/&U,BTFw-/&ZeVnLIqe-"), "~peter/mail/台北/日本語");
assert.equal(folders.linkedFolderLabel("A&-B+~\\C"), "A&B+~\\C");
for (const bad of ["", "raw한글", "A&", "&Jjo!", "&A-", "&AA-", "&AEE-", "&U,BTFw-&ZeVnLIqe-", "&2AA-", "&AKU=-", "&AAo-", "&AIk-", "&AKX-", "&AKU/-"]) assert.throws(() => folders.linkedFolderLabel(bad), bad);
assert.deepEqual(folders.linkedFolderRequest(id, { expectedRevision: 2 }), { expectedRevision: 2 });
for (const bad of [{ expectedRevision: 0 }, { expectedRevision: 2, owner: id }, { expectedRevision: 2, host: "untrusted" }, { expectedRevision: Number.MAX_SAFE_INTEGER }]) assert.equal(folders.linkedFolderRequest(id, bad), null);
const value = { folders: ["INBOX", encode("개발")], encoding: "imapModifiedUtf7", token: "remove" };
const expected = { linkedAccountId: id, revision: 2, credentialGeneration: 1, encoding: "imapModifiedUtf7", folders: [{ value: "INBOX", label: "INBOX" }, { value: encode("개발"), label: "개발" }] };
assert.deepEqual(folders.requireLinkedFolders(value, before), expected);
for (const bad of [{ ...value, encoding: "utf8" }, { ...value, folders: ["INBOX", "INBOX"] }, { ...value, folders: ["&Jjo!"] }, { ...value, folders: Array.from({ length: 101 }, (_, i) => String(i)) }]) assert.throws(() => folders.requireLinkedFolders(bad, before));
class LinkedAccountError extends Error { constructor(status) { super(status); this.status = status; } }
class LinkedAuthError extends Error { constructor(status, uncertain = false) { super(status); this.status = status; this.uncertain = uncertain; } }
let listing = data, second = null, response = Response.json(value), calls = [], listingCalls = 0;
const linked = { LinkedAccountError, requestLinkedAccounts: async () => { listingCalls++; return second && listingCalls % 2 === 0 ? second : listing; } };
const server = { assertLiveApiConfigured() {}, tastemailLinkedFolders: async (...args) => { calls.push(args); if (response === "network") throw new Error("network"); return response; } };
const adapter = load("lib/tastemail/linked-folders.ts", { "../linked-accounts": accounts, "../linked-folders": folders, "./linked-accounts": linked, "./linked-authentication": { LinkedAuthError }, "./server": server });
assert.deepEqual(await adapter.requestLinkedFolders("synthetic-token", id, { expectedRevision: 2 }), expected); assert.deepEqual(calls[0], [id, "synthetic-token", 2]);
const sent = calls.length; listing = { ...data, accounts: [{ ...before, status: "pendingAuth", credentialGeneration: 0, capabilities: { read: false, sync: false, send: false, mutate: false } }] };
await assert.rejects(adapter.requestLinkedFolders("synthetic-token", id, { expectedRevision: 2 }), e => e.status === "auth_unavailable" && !e.uncertain); assert.equal(calls.length, sent);
listing = data;
for (const [code, type, status] of [[401, "", "unauthorized"], [403, "", "forbidden"], [429, "", "rateLimited"], [409, "stateMismatch", "conflict"], [409, "reauthRequired", "reauth_required"], [404, "", "not_deployed"], [503, "configurationRequired", "configuration_required"], [502, "remoteUnavailable", "remote_unavailable"]]) { response = Response.json({ type }, { status: code }); await assert.rejects(adapter.requestLinkedFolders("synthetic-token", id, { expectedRevision: 2 }), e => e.status === status && !e.uncertain); }
for (const bad of ["network", Response.json({ ...value, encoding: "unknown" }), new Response('"' + "x".repeat(1024 * 1024) + '"'), Response.json(value, { status: 201 })]) { response = bad; await assert.rejects(adapter.requestLinkedFolders("synthetic-token", id, { expectedRevision: 2 }), e => e.uncertain); }
listingCalls = 0; second = { ...data, accounts: [{ ...before, revision: 3 }] }; response = Response.json(value); await assert.rejects(adapter.requestLinkedFolders("synthetic-token", id, { expectedRevision: 2 }), e => e.uncertain); second = null;
let token = null;
const route = load("lib/tastemail/linked-folders-route.ts", { "./contact-route": { sameOrigin: r => r.headers.get("origin") === new URL(r.url).origin }, "./server": server, "./session": { tastemailSessionToken: async () => token }, "../linked-folders": folders, "./linked-authentication": { LinkedAuthError }, "./linked-folders": adapter });
const request = (body = { expectedRevision: 2 }, origin = "https://synthetic.test", headerOrigin = origin) => new Request(`${origin}/api/mail/linked-accounts/${id}/folders`, { method: "POST", headers: { origin: headerOrigin, "content-type": "application/json" }, body: JSON.stringify(body) });
assert.equal((await route.linkedFoldersRoute(request(), id)).status, 401); token = "synthetic-token";
assert.equal((await route.linkedFoldersRoute(request(undefined, undefined, "https://untrusted.test"), id)).status, 403);
assert.equal((await route.linkedFoldersRoute(request(undefined, "http://192.168.0.109"), id)).status, 400);
const count = calls.length; assert.equal((await route.linkedFoldersRoute(request({ expectedRevision: 2, owner: id }), id)).status, 400); assert.equal(calls.length, count);
response = Response.json(value); const result = await route.linkedFoldersRoute(request(), id); assert.equal(result.status, 200); assert.deepEqual(await result.json(), expected); assert.match(result.headers.get("cache-control"), /private, no-store/);
// Actual fixed transport and deadline, without a real connection.
const transport = load("lib/tastemail/server.ts"), oldFetch = globalThis.fetch, oldTimeout = AbortSignal.timeout, oldOrigin = process.env.TASTEMAIL_API_URL, deadlines = [];
try {
  process.env.TASTEMAIL_API_URL = "https://synthetic.test"; AbortSignal.timeout = ms => { deadlines.push(ms); return new AbortController().signal; };
  globalThis.fetch = async (url, init) => { assert.equal(url, `https://synthetic.test/api/user/linked-accounts/${id}/folders`); assert.equal(init.method, "POST"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store"); assert.deepEqual(JSON.parse(init.body), { expectedRevision: 2 }); return Response.json(value); };
  await transport.tastemailLinkedFolders(id, "synthetic-token", 2); assert.deepEqual(deadlines, [65000]);
  assert.throws(() => transport.tastemailLinkedFolders("bad", "synthetic-token", 2)); assert.throws(() => transport.tastemailLinkedFolders(id, "synthetic-token", 0));
} finally { globalThis.fetch = oldFetch; AbortSignal.timeout = oldTimeout; if (oldOrigin === undefined) delete process.env.TASTEMAIL_API_URL; else process.env.TASTEMAIL_API_URL = oldOrigin; }
console.log("Linked folders: exact raw names, RFC modified UTF-7 labels, scoped POST, deadline, known/unknown failures and safe BFF passed (synthetic only).");

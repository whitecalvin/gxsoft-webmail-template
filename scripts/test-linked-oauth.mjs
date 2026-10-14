import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, deps = {}) {
  const exports = {}, js = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", js)(exports, name => name === "server-only" ? {} : name in deps ? deps[name] : name.startsWith(".") && existsSync(resolve(dirname(path), `${name}.ts`)) ? load(resolve(dirname(path), `${name}.ts`)) : require(name));
  return exports;
}
const accounts = load("lib/linked-accounts.ts"), oauth = load("lib/linked-oauth.ts", { "./linked-accounts": accounts });
const id = "11111111-1111-4111-8111-111111111111", origin = "https://mail.example.test";
const before = { id, provider: "gmail", email: "synthetic@gmail.com", revision: 1, credentialGeneration: 0, status: "pendingAuth", capabilities: { read: false, sync: false, send: false, mutate: false } };
const after = { ...before, revision: 2, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
const callback = oauth.linkedOAuthRedirect(origin), input = { expectedRevision: 1 }, proof = { state: "s".repeat(43), code: "synthetic-code" };
const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
for (const [key, value] of Object.entries({ client_id: "synthetic-client", redirect_uri: callback, response_type: "code", scope: "https://mail.google.com/", state: proof.state, access_type: "offline", prompt: "consent", login_hint: before.email, code_challenge: "c".repeat(43), code_challenge_method: "S256" })) url.searchParams.set(key, value);
const receipt = { authorizationUrl: url.href, expiresIn: 600 };
assert.deepEqual(oauth.linkedOAuthStartReceipt({ ...receipt, access_token: "must-not-pass" }, before, callback), { ...receipt, state: proof.state });
for (const [key, value] of [["redirect_uri", "https://other.example.test/callback"], ["login_hint", "other@gmail.com"], ["scope", "profile"], ["code_challenge_method", "plain"], ["code_challenge", "bad"], ["state", "bad"], ["response_type", "token"], ["prompt", "none"], ["access_type", "online"], ["client_id", ""]]) {
  const bad = new URL(url); bad.searchParams.set(key, value);
  assert.throws(() => oauth.linkedOAuthStartReceipt({ ...receipt, authorizationUrl: bad.href }, before, callback));
}
for (const modify of [v => { v.host = "untrusted.example"; }, v => { v.protocol = "http:"; }, v => { v.username = "user"; }, v => { v.hash = "fragment"; }, v => { v.pathname = "/other"; }, v => { v.searchParams.append("state", proof.state); }, v => { v.searchParams.set("access_token", "must-not-pass"); }]) {
  const bad = new URL(url); modify(bad);
  assert.throws(() => oauth.linkedOAuthStartReceipt({ ...receipt, authorizationUrl: bad.href }, before, callback));
}
for (const value of ["http://localhost:7540", "https://user:pass@example.test", "https://example.test/path", "https://example.test?q=1", "https://example.test#fragment"]) assert.throws(() => oauth.linkedOAuthRedirect(value));
assert.throws(() => oauth.linkedOAuthStartReceipt({ ...receipt, expiresIn: 601 }, before, callback));
assert.throws(() => oauth.linkedOAuthStartReceipt(receipt, { ...before, provider: "naver" }, callback));
for (const value of [{ ...input, token: "must-not-pass" }, { expectedRevision: 0 }, { expectedRevision: Number.MAX_SAFE_INTEGER }, { expectedRevision: 1.1 }]) assert.equal(oauth.linkedOAuthRevision(id, value), null);
for (const value of [{ ...proof, owner: id }, { ...proof, code: "x\u0085x" }, { ...proof, code: "가".repeat(1366) }, { ...proof, state: "" }, { ...proof, state: "s".repeat(257) }]) assert.equal(oauth.linkedOAuthCallback(value), null);
assert.deepEqual(oauth.linkedOAuthCompletionReceipt({ ...after, refresh_token: "must-not-pass" }, before), after);
for (const value of [{ ...after, email: "other@gmail.com" }, { ...after, id: "22222222-2222-4222-8222-222222222222" }, { ...after, revision: 3 }, { ...after, credentialGeneration: 0 }, before]) assert.throws(() => oauth.linkedOAuthCompletionReceipt(value, before));

let listing = { accounts: [before], limit: 10, authenticationAvailable: { gmail: true, naver: false, tastemail: false } }, upstream = Response.json(receipt), calls = [], fail = false;
class LinkedAccountError extends Error { constructor(status) { super(status); this.status = status; } }
class LinkedAuthError extends Error { constructor(status, uncertain = false) { super(status); this.status = status; this.uncertain = uncertain; } }
const dispatch = async (...args) => { calls.push(args); if (fail) throw new Error("synthetic transport failure"); return upstream; };
const adapter = load("lib/tastemail/linked-oauth.ts", { "../linked-oauth": oauth, "../linked-accounts": accounts,
  "./linked-accounts": { LinkedAccountError, requestLinkedAccounts: async () => listing }, "./linked-authentication": { LinkedAuthError },
  "./server": { tastemailRequest: dispatch, tastemailCompleteLinkedOAuth: dispatch } });
assert.deepEqual(await adapter.startLinkedOAuth("synthetic-session", id, input, origin), { before, ...receipt, state: proof.state });
assert.equal(calls.at(-1)[0], `/api/user/linked-accounts/${id}/oauth/start`);
assert.deepEqual(JSON.parse(calls.at(-1)[2].body), input);
const initialCalls = calls.length;
await assert.rejects(adapter.startLinkedOAuth("synthetic-session", id, input, "http://localhost:7540"), e => e.status === "insecure_connection" && !e.uncertain);
listing = { ...listing, authenticationAvailable: false };
await assert.rejects(adapter.startLinkedOAuth("synthetic-session", id, input, origin), e => e.status === "auth_unavailable");
assert.equal(calls.length, initialCalls);
listing = { ...listing, authenticationAvailable: { gmail: true, naver: false, tastemail: false } };
upstream = Response.json(after);
assert.deepEqual(await adapter.completeLinkedOAuth("synthetic-session", before, proof), after);
assert.deepEqual(calls.at(-1), [id, "synthetic-session", proof]);
listing.accounts = [{ ...before, credentialGeneration: 1 }];
const callbackCalls = calls.length;
await assert.rejects(adapter.completeLinkedOAuth("synthetic-session", before, proof), e => e.status === "conflict" && !e.uncertain);
assert.equal(calls.length, callbackCalls);
listing.accounts = [before];
for (const [code, type, status] of [[401, "", "unauthorized"], [403, "", "forbidden"], [429, "", "rateLimited"], [409, "stateMismatch", "conflict"], [503, "configurationRequired", "configuration_required"], [409, "reauthRequired", "reauth_required"], [502, "remoteUnavailable", "remote_unavailable"]]) {
  upstream = Response.json({ type, detail: "must-not-pass" }, { status: code });
  await assert.rejects(adapter.completeLinkedOAuth("synthetic-session", before, proof), e => e.status === status && !e.uncertain && !e.message.includes("must-not-pass"));
}
upstream = Response.json({ type: "resultUnknown" }, { status: 409 });
await assert.rejects(adapter.completeLinkedOAuth("synthetic-session", before, proof), e => e.uncertain);
upstream = Response.json({ ...after, email: "other@gmail.com" });
await assert.rejects(adapter.completeLinkedOAuth("synthetic-session", before, proof), e => e.uncertain);
fail = true;
await assert.rejects(adapter.startLinkedOAuth("synthetic-session", id, input, origin), e => e.uncertain);
await assert.rejects(adapter.completeLinkedOAuth("synthetic-session", before, proof), e => e.uncertain);

// Exercise the actual fixed-path transport without any external request.
const transport = load("lib/tastemail/server.ts"), originalFetch = globalThis.fetch, originalTimeout = AbortSignal.timeout;
const originalOrigin = process.env.TASTEMAIL_API_URL;
let timeout, sent;
try {
  process.env.TASTEMAIL_API_URL = "http://127.0.0.1:6711";
  AbortSignal.timeout = ms => { timeout = ms; return new AbortController().signal; };
  globalThis.fetch = async (path, init) => { sent = { path, init }; return Response.json(after); };
  await transport.tastemailCompleteLinkedOAuth(id, "synthetic-session", proof);
  assert.equal(timeout, 65000);
  assert.equal(sent.path, `http://127.0.0.1:6711/api/user/linked-accounts/${id}/oauth/callback`);
  assert.equal(sent.init.cache, "no-store"); assert.equal(sent.init.redirect, "error");
  assert.deepEqual(JSON.parse(sent.init.body), proof);
  for (const value of [{ ...proof, owner: id }, { ...proof, code: "" }, { ...proof, state: "s".repeat(257) }]) assert.throws(() => transport.tastemailCompleteLinkedOAuth(id, "synthetic-session", value));
  assert.throws(() => transport.tastemailCompleteLinkedOAuth("//untrusted.example", "synthetic-session", proof));
} finally {
  globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout;
  if (originalOrigin === undefined) delete process.env.TASTEMAIL_API_URL; else process.env.TASTEMAIL_API_URL = originalOrigin;
}
console.log("Linked Gmail OAuth scoped contract, URL policy, receipts, error handling and fixed transport passed (synthetic only).");

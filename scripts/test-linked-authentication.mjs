import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url), read = path => readFileSync(path, "utf8");
function load(path, deps = {}) {
  const exports = {}, js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("exports", "require", js)(exports, name => name === "server-only" ? {} : name in deps ? deps[name] : require(name));
  return exports;
}
const accounts = load("lib/linked-accounts.ts"), auth = load("lib/linked-authentication.ts", { "./linked-accounts": accounts });
const id = "11111111-1111-4111-8111-111111111111";
const before = { id, provider: "naver", email: "synthetic@naver.com", revision: 1, credentialGeneration: 0, status: "pendingAuth", capabilities: { read: false, sync: false, send: false, mutate: false } };
const saved = { ...before, revision: 2, credentialGeneration: 1, status: "pendingVerification" };
const connected = { ...saved, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
const data = { accounts: [before], limit: 10, authenticationAvailable: { gmail: false, naver: true, tastemail: false } };
const input = { expectedRevision: 1, provider: "naver", appPassword: "synthetic-only" };
const command = auth.linkedAuthenticationCommand("credentials", id, input);
assert.ok(command);
for (const value of [{ ...input, provider: "gmail" }, { ...input, host: "untrusted" }, { ...input, owner: id }, { ...input, expectedRevision: 0 }, { ...input, appPassword: "" }, { ...input, appPassword: "x\u0085x" }, { ...input, appPassword: "가".repeat(342) }, { ...input, token: "not-allowed" }]) assert.equal(auth.linkedAuthenticationCommand("credentials", id, value), null);
assert.equal(auth.linkedAuthenticationCommand("verify", id, input), null);
assert.equal(auth.linkedAuthenticationCommand("credentials", "bad", input), null);
assert.deepEqual(auth.linkedAuthReceipt({ ...saved, appPassword: "must-not-pass" }, before, "credentials"), saved);
assert.deepEqual(auth.linkedAuthReceipt(connected, saved, "verify"), connected);
for (const value of [{ ...saved, id: "22222222-2222-4222-8222-222222222222" }, { ...saved, email: "other@naver.com" }, { ...saved, revision: 3 }, { ...saved, credentialGeneration: 0 }, connected]) assert.throws(() => auth.linkedAuthReceipt(value, before, "credentials"));
assert.equal(auth.linkedAuthResolved(data, { kind: "credentials", before }), false);
assert.equal(auth.linkedAuthResolved({ ...data, accounts: [saved] }, { kind: "credentials", before }), true);
assert.equal(auth.linkedAuthResolved({ ...data, accounts: [saved] }, { kind: "verify", before: saved }), false);
assert.equal(auth.linkedAuthResolved({ ...data, accounts: [connected] }, { kind: "verify", before: saved }), true);
assert.throws(() => auth.linkedAuthBefore(data, { kind: "verify", id, input: { expectedRevision: 1 } }));

let listing = data, response = Response.json(saved), networkFailure = false, calls = [];
class LinkedAccountError extends Error { constructor(status) { super(status); this.status = status; } }
const server = { assertLiveApiConfigured() {}, tastemailRequest: async (...args) => { calls.push(args); if (networkFailure) throw new Error("network"); return response; },
  tastemailVerifyLinkedAccount: async (...args) => { calls.push(args); if (networkFailure) throw new Error("network"); return response; } };
const adapter = load("lib/tastemail/linked-authentication.ts", { "../linked-authentication": auth, "../linked-accounts": accounts, "./server": server,
  "./linked-accounts": { LinkedAccountError, requestLinkedAccounts: async () => listing } });
assert.deepEqual(await adapter.requestLinkedAuthentication("synthetic-token", command), saved);
assert.equal(calls.at(-1)[0], `/api/user/linked-accounts/${id}/credentials`);
assert.deepEqual(JSON.parse(calls.at(-1)[2].body), input);
listing = { ...data, accounts: [saved] }; response = Response.json(connected);
const verify = { kind: "verify", id, input: { expectedRevision: 2 } };
assert.deepEqual(await adapter.requestLinkedAuthentication("synthetic-token", verify), connected);
assert.deepEqual(calls.at(-1), [id, "synthetic-token", 2]);
for (const [code, type, status] of [[409, "reauthRequired", "reauth_required"], [502, "remoteUnavailable", "remote_unavailable"], [503, "configurationRequired", "configuration_required"], [501, "capabilityUnavailable", "auth_unavailable"], [401, "", "unauthorized"], [403, "", "forbidden"], [429, "", "rateLimited"]]) {
  response = Response.json({ type, detail: "must-not-pass" }, { status: code });
  await assert.rejects(adapter.requestLinkedAuthentication("synthetic-token", verify), e => e.status === status && !e.uncertain);
}
response = Response.json({ type: "resultUnknown" }, { status: 409 });
await assert.rejects(adapter.requestLinkedAuthentication("synthetic-token", verify), e => e.uncertain);
networkFailure = true;
await assert.rejects(adapter.requestLinkedAuthentication("synthetic-token", verify), e => e.uncertain);
networkFailure = false;
response = Response.json(saved);
await assert.rejects(adapter.requestLinkedAuthentication("synthetic-token", verify), e => e.uncertain);
listing = { ...data, authenticationAvailable: false };
const count = calls.length;
await assert.rejects(adapter.requestLinkedAuthentication("synthetic-token", command), e => e.status === "auth_unavailable" && !e.uncertain);
assert.equal(calls.length, count, "unadvertised authentication cannot send credentials upstream");

let token = "synthetic-token";
const route = load("lib/tastemail/linked-authentication-route.ts", { "./server": server, "../linked-authentication": auth, "./linked-authentication": adapter,
  "./session": { tastemailSessionToken: async () => token }, "./contact-route": { sameOrigin: request => request.headers.get("origin") === new URL(request.url).origin } });
const request = (body, origin = "http://localhost:7540", headerOrigin = origin) => new Request(`${origin}/api/mail/linked-accounts/${id}/credentials`, { method: "POST", headers: { "content-type": "application/json", origin: headerOrigin }, body: JSON.stringify(body) });
assert.equal((await route.linkedAuthenticationRoute(request(input, "http://192.168.0.109"), id, "credentials")).status, 400);
assert.equal((await route.linkedAuthenticationRoute(request(input, undefined, "https://untrusted.example"), id, "credentials")).status, 403);
assert.equal((await route.linkedAuthenticationRoute(request({ ...input, owner: id }), id, "credentials")).status, 400);
token = null; assert.equal((await route.linkedAuthenticationRoute(request(input), id, "credentials")).status, 401); token = "synthetic-token";
listing = data; response = Response.json({ ...saved, appPassword: "must-not-pass", token: "must-not-pass" });
const result = await route.linkedAuthenticationRoute(request(input), id, "credentials");
assert.match(result.headers.get("cache-control"), /private, no-store/);
assert.deepEqual(await result.json(), saved);

// Exercise the actual Provider functions with synthetic responses only.
const source = read("context/linked-accounts-context.tsx"), section = source.slice(source.indexOf("  async function refresh()"), source.indexOf("\n  return <Context.Provider"));
const js = ts.transpileModule(section, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let snapshot = { status: "ready", data }, busy = false, uncertain = false, error = null, uiResponse = "network", requests = 0;
const pending = { current: false }, unresolved = { current: null }, generation = { current: 1 };
const failures = ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable", "not_deployed", "invalid_request", "not_found", "conflict", "limit", "mutation_uncertain", ...auth.LINKED_AUTH_FAILURES];
function functions() {
  return new Function("snapshot", "pending", "unresolved", "generation", "setBusy", "setSnapshot", "setUncertain", "setError", "fetch", "requireLinkedAccount", "requireLinkedAccounts", "responseFailure", "failures", "linkedAuthenticationCommand", "linkedAuthBefore", "linkedAuthReceipt", "linkedAuthResolved", `${js}; return {refresh,authenticate,mutate};`)(snapshot, pending, unresolved, generation,
    v => { busy = v; }, v => { snapshot = typeof v === "function" ? v(snapshot) : v; }, v => { uncertain = v; }, v => { error = v; },
    async () => { requests++; if (uiResponse === "network") throw new Error("network"); return uiResponse; }, accounts.requireLinkedAccount, accounts.requireLinkedAccounts, (_, b) => b.status, failures,
    auth.linkedAuthenticationCommand, auth.linkedAuthBefore, auth.linkedAuthReceipt, auth.linkedAuthResolved);
}
assert.equal(await functions().authenticate(command), false);
assert.equal(uncertain, true); assert.equal(error, "mutation_uncertain"); assert.equal(busy, false);
assert.doesNotMatch(JSON.stringify(unresolved.current), /appPassword|synthetic-only/);
const sent = requests; await functions().authenticate(command); await functions().mutate({ method: "DELETE", id, input: { expectedRevision: 1 } }); assert.equal(requests, sent);
uiResponse = Response.json(data); await functions().refresh(); assert.equal(uncertain, true);
uiResponse = Response.json({ ...data, accounts: [saved] }); await functions().refresh(); assert.equal(uncertain, false);
uiResponse = "network"; await functions().authenticate(verify); assert.equal(uncertain, true);
uiResponse = Response.json({ ...data, accounts: [saved] }); await functions().refresh(); assert.equal(uncertain, true);
uiResponse = Response.json({ ...data, accounts: [connected] }); await functions().refresh(); assert.equal(uncertain, false);
assert.equal(await functions().authenticate(verify), false, "already connected accounts cannot repeat verify");

for (const file of readdirSync("messages").filter(f => f.endsWith(".json"))) {
  const messages = JSON.parse(read(`messages/${file}`));
  const t = ns => (key, values = {}) => Object.entries(values).reduce((text, [k, v]) => text.replaceAll(`{${k}}`, String(v)), messages[ns][key]);
  for (const [account, available, disabledCount] of [[before, true, 1], [saved, true, 0], [connected, true, 1], [saved, false, 2]]) {
    const ui = load("components/settings/NaverLinkedAuthentication.tsx", { "next-intl": { useTranslations: t }, "@/lib/linked-authentication": auth,
      "@/context/linked-accounts-context": { useLinkedAccounts: () => ({ snapshot: { status: "ready", data: { ...data, authenticationAvailable: { ...data.authenticationAvailable, naver: available } } }, busy: false, uncertain: false, error: null, refresh() {}, authenticate() {} }) },
      "@/components/ui/Tooltip": { Tooltip: ({ children }) => children }, "@/components/ui/Button": load("components/ui/Button.tsx", { "./utils": load("components/ui/utils.ts") }),
      "@/components/ui/Input": {}, "@/components/overlay/Modal": {}, "@/components/overlay/ConfirmDialog": {}, "@/components/overlay/DialogActions": {} });
    const html = renderToStaticMarkup(React.createElement(ui.NaverLinkedAuthentication, { account }));
    assert.equal((html.match(/ disabled=""/g) ?? []).length, disabledCount);
    assert.doesNotMatch(html, /synthetic-only|type="password"|localStorage/);
    assert.ok(html.includes(messages.linkedAccountAuth.credentials)); assert.ok(html.includes(messages.linkedAccountAuth.verify));
  }
}
const modalSource = read("components/settings/NaverLinkedAuthentication.tsx");
const saveSection = modalSource.slice(modalSource.indexOf("  const save = async"), modalSource.indexOf('\n  if (account.provider'));
const saveJs = ts.transpileModule(saveSection, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let field = { current: { value: "synthetic-only" } }, editing = before, invalid = false;
const saveUi = new Function("locked", "editing", "password", "linkedAuthenticationCommand", "setInvalid", "authenticate", "setEditing", `${saveJs}; return save;`)(false, editing, field,
  auth.linkedAuthenticationCommand, value => { invalid = value; }, async value => {
    assert.equal(field.current.value, "", "clear the secret input before dispatch");
    assert.deepEqual(value, command); return true;
  }, value => { editing = value; });
await saveUi(); assert.equal(editing, null); assert.equal(invalid, false);
assert.match(modalSource, /password.current.value = ""/); assert.doesNotMatch(modalSource, /localStorage|sessionStorage|console\./);
assert.match(modalSource, /ConfirmDialog tone="default"/);
assert.ok(modalSource.indexOf('password.current.value = ""', modalSource.indexOf("const save")) < modalSource.indexOf("await authenticate(command)"));
console.log("Linked authentication contracts, safe BFF, receipt scope, secret-free uncertainty, retry locks and ten-locale controls passed (synthetic only).");

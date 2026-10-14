import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url), read = p => readFileSync(p, "utf8");
function load(path, deps = {}) {
  const exports = {}, source = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("exports", "require", source)(exports, name => name === "server-only" ? {} : name in deps ? deps[name] : require(name));
  return exports;
}
const c = load("lib/linked-accounts.ts");
const auth = load("lib/linked-authentication.ts", { "./linked-accounts": c });
const id = "11111111-1111-4111-8111-111111111111";
const account = { id, provider: "gmail", email: "synthetic@gmail.com", revision: 1, credentialGeneration: 0, status: "pendingAuth", capabilities: { read: false, send: false, sync: false, mutate: false } };
const list = { accounts: [account], limit: 10, authenticationAvailable: false };
const empty = { ...list, accounts: [] };
const command = c.linkedRegistration({ provider: "gmail", email: " Synthetic@GMAIL.com " });
assert.equal(command.input.email, account.email);
for (const value of [{ provider: "gmail", email: "name@example.com" }, { provider: "naver", email: "name@gmail.com" }, { provider: "other", email: "name@example.com" }, { provider: "gmail", email: "name@gmail.com", token: "must-not-pass" }]) assert.equal(c.linkedRegistration(value), null);
assert.ok(c.linkedRegistration({ provider: "tastemail", email: "synthetic@example.com" }));
assert.equal(c.linkedDeletion({ expectedRevision: 1, owner: id }, id), null);
assert.equal(c.linkedDeletion({ expectedRevision: 0 }, id), null);
assert.deepEqual(c.requireLinkedAccount({ ...account, password: "must-not-pass", token: "must-not-pass" }), account);
assert.deepEqual(c.requireLinkedAccounts({ ...list, secret: "must-not-pass" }), list);
for (const invalid of [{ ...list, accounts: [account, account] }, { ...list, authenticationAvailable: true }, { ...list, limit: 11 }, { ...list, accounts: [{ ...account, status: "connected" }] }, { ...list, accounts: [{ ...account, capabilities: { ...account.capabilities, read: true } }] }]) assert.throws(() => c.requireLinkedAccounts(invalid));
const availability = { gmail: true, naver: false, tastemail: false };
const connected = { ...account, revision: 3, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
const modern = { ...list, authenticationAvailable: availability, accounts: [connected] };
assert.deepEqual(c.requireLinkedAccounts({ ...modern, authenticationAvailable: { ...availability, token: "must-not-pass" } }), modern);
for (const status of ["temporaryError", "reauthRequired"]) {
  const cached = { ...connected, status, capabilities: { ...connected.capabilities, sync: false } };
  assert.deepEqual(c.requireLinkedAccounts({ ...modern, accounts: [cached] }).accounts[0], cached);
}
assert.deepEqual(c.requireLinkedAccounts({ ...list, authenticationAvailable: availability }), { ...list, authenticationAvailable: availability });
for (const invalid of [
  { ...modern, authenticationAvailable: { gmail: 1, naver: false, tastemail: false } },
  { ...modern, authenticationAvailable: { gmail: true, naver: false, tastemail: true } },
  { ...modern, authenticationAvailable: { gmail: true } },
  { ...modern, accounts: [{ ...connected, capabilities: { ...connected.capabilities, send: true } }] },
  { ...modern, accounts: [{ ...connected, capabilities: { ...connected.capabilities, mutate: true } }] },
  { ...modern, accounts: [{ ...connected, capabilities: { ...connected.capabilities, read: false } }] },
  { ...modern, accounts: [{ ...connected, status: "pendingAuth" }] },
  { ...modern, accounts: [{ ...connected, status: "temporaryError" }] },
  { ...modern, accounts: [{ ...account, status: "reauthRequired" }] },
  { ...modern, authenticationAvailable: false },
]) assert.throws(() => c.requireLinkedAccounts(invalid));
let response = Response.json(list), throws = false, calls = [];
const server = { serviceStatus: status => status >= 500 ? "retryable" : "unavailable", assertLiveApiConfigured() {}, tastemailRequest: async (...args) => { calls.push(args); if (throws) throw new Error("network"); return response; } };
const adapter = load("lib/tastemail/linked-accounts.ts", { "./server": server, "../linked-accounts": c });
assert.deepEqual(await adapter.requestLinkedAccounts("synthetic-token"), list);
response = Response.json(modern);
assert.deepEqual(await adapter.requestLinkedAccounts("synthetic-token"), modern);
response = Response.json({ ...account, token: "must-not-pass" }, { status: 201 });
assert.deepEqual(await adapter.requestLinkedAccounts("synthetic-token", command), account);
assert.equal(calls.at(-1)[0], "/api/user/linked-accounts"); assert.deepEqual(JSON.parse(calls.at(-1)[2].body), command.input);
response = Response.json({ ...account, email: "wrong@gmail.com" }, { status: 201 });
await assert.rejects(adapter.requestLinkedAccounts("synthetic-token", command), e => e.status === "mutation_uncertain");
const deletion = c.linkedDeletion({ expectedRevision: 1 }, id);
response = new Response(null, { status: 204 });
assert.deepEqual(await adapter.requestLinkedAccounts("synthetic-token", deletion), { deletedId: id });
assert.equal(calls.at(-1)[0], `/api/user/linked-accounts/${id}`);
for (const [status, type, expected] of [[401, "", "unauthorized"], [403, "", "forbidden"], [429, "", "rateLimited"], [409, "stateMismatch", "conflict"], [409, "limitReached", "limit"], [409, "resultUnknown", "mutation_uncertain"], [404, "notFound", "not_found"], [500, "serverFail", "mutation_uncertain"]]) {
  response = Response.json({ type, detail: "must-not-pass" }, { status });
  await assert.rejects(adapter.requestLinkedAccounts("synthetic-token", command), e => e.status === expected);
}
response = new Response("not deployed", { status: 404 });
assert.equal((await adapter.initialLinkedAccounts("synthetic-token")).status, "not_deployed");
throws = true; await assert.rejects(adapter.requestLinkedAccounts("synthetic-token", command), e => e.status === "mutation_uncertain"); throws = false;
let token = "synthetic-token";
const routes = load("lib/tastemail/linked-account-route.ts", { "./server": server, "./linked-accounts": adapter, "../linked-accounts": c,
  "./session": { tastemailSessionToken: async () => token }, "./contact-route": { sameOrigin: request => request.headers.get("origin") === "http://localhost:7540" } });
const request = (method, body, origin = "http://localhost:7540") => new Request("http://localhost:7540/api/mail/linked-accounts", { method, headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
const before = calls.length;
assert.equal((await routes.linkedAccountRoute(request("POST", command.input, "https://untrusted.example"))).status, 403);
assert.equal((await routes.linkedAccountRoute(request("POST", { ...command.input, owner: id }))).status, 400);
assert.equal((await routes.linkedAccountRoute(request("DELETE", { expectedRevision: 1 }), "bad-id")).status, 400);
assert.equal(calls.length, before);
token = null; assert.equal((await routes.linkedAccountRoute()).status, 401); token = "synthetic-token";
response = Response.json(account, { status: 201 });
const registered = await routes.linkedAccountRoute(request("POST", command.input));
assert.equal(registered.status, 201); assert.match(registered.headers.get("cache-control"), /private, no-store/);
response = new Response(null, { status: 204 });
assert.deepEqual(await (await routes.linkedAccountRoute(request("DELETE", deletion.input), id)).json(), { deletedId: id });

// Exercise the actual client mutation/reconciliation functions without real accounts or network.
const provider = read("context/linked-accounts-context.tsx");
const functionSource = provider.slice(provider.indexOf("  async function refresh()"), provider.indexOf("\n  return <Context.Provider"));
const js = ts.transpileModule(functionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let snapshot = { status: "ready", data: empty }, busy = false, uncertain = false, error = null, uiResponse = "network", requests = 0;
const pending = { current: false }, unresolved = { current: null }, generation = { current: 1 };
const journal = { current: null }, journalFailed = { current: false }, booted = { current: true };
function functions() {
  return new Function("snapshot", "pending", "unresolved", "generation", "journal", "journalFailed", "booted", "setBusy", "setSnapshot", "setUncertain", "setError", "fetch", "requireLinkedAccount", "requireLinkedAccounts", "responseFailure", "failures", `${js}; return {refresh,mutate};`)(snapshot, pending, unresolved, generation, journal, journalFailed, booted,
    value => { busy = value; }, value => { snapshot = typeof value === "function" ? value(snapshot) : value; }, value => { uncertain = value; }, value => { error = value; },
    async () => { requests++; if (uiResponse === "network") throw new Error("network"); return uiResponse; }, c.requireLinkedAccount, c.requireLinkedAccounts, (_, body) => body.status,
    ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable", "not_deployed", "invalid_request", "not_found", "conflict", "limit", "mutation_uncertain"]);
}
assert.equal(await functions().mutate(command), false); assert.equal(uncertain, true); assert.equal(error, "mutation_uncertain"); assert.equal(busy, false);
const count = requests; await functions().mutate(command); assert.equal(requests, count, "unknown commit cannot retry a write");
uiResponse = Response.json(empty); await functions().refresh(); assert.equal(uncertain, true, "absence does not prove an in-flight registration failed");
uiResponse = Response.json(list); await functions().refresh(); assert.equal(uncertain, false); assert.equal(unresolved.current, null);
uiResponse = "network"; await functions().mutate(deletion); assert.equal(uncertain, true);
uiResponse = Response.json(list); await functions().refresh(); assert.equal(uncertain, true, "still-present account cannot prove disconnect finished");
uiResponse = Response.json(empty); await functions().refresh(); assert.equal(uncertain, false);
uiResponse = Response.json(account, { status: 201 }); assert.equal(await functions().mutate(command), true); assert.equal(snapshot.data.accounts[0].id, id);

for (const locale of readdirSync("messages").filter(f => f.endsWith(".json"))) {
  const messages = JSON.parse(read(`messages/${locale}`));
  const t = namespace => (key, values = {}) => Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), messages[namespace][key]);
  const ui = load("components/settings/LinkedAccountSettings.tsx", { "next-intl": { useTranslations: t }, "@/lib/linked-accounts": c,
    "@/lib/linked-authentication": auth, "./NaverLinkedAuthentication": { NaverLinkedAuthentication: () => null }, "./GmailLinkedAuthentication": { GmailLinkedAuthentication: () => null }, "./LinkedMailViewer": { LinkedMailViewer: () => null },
    "@/context/linked-accounts-context": { useLinkedAccounts: () => ({ snapshot: { status: "ready", data: list }, busy: false, uncertain: false, error: null, refresh() {}, mutate() {} }) },
    "./SettingsPrimitives": { SettingsPanel: ({ title, children, actions }) => React.createElement("section", null, title, actions, children) },
    "@/components/ui/Tooltip": { Tooltip: ({ children }) => children },
    "@/components/ui/Button": load("components/ui/Button.tsx", { "./utils": load("components/ui/utils.ts") }),
    "@/components/ui/Input": {}, "@/components/ui/CustomSelect": {},
    "@/components/overlay/Modal": {}, "@/components/overlay/ConfirmDialog": {}, "@/components/overlay/DialogActions": {} });
  const html = renderToStaticMarkup(React.createElement(ui.LinkedAccountSettings));
  assert.ok(html.includes(messages.linkedAccounts.add)); assert.ok(html.includes(messages.linkedAccounts.pendingAuth));
  const renderedNote = renderToStaticMarkup(React.createElement("p", { className: "text-sm text-(--text-muted)" }, messages.linkedAccounts.notAuthenticated));
  assert.ok(html.includes(renderedNote)); assert.doesNotMatch(html, /type="password"|localStorage|Bearer/);
  for (const state of ["connected", "temporaryError"]) {
    const data = { ...modern, accounts: [{ ...connected, status: state, capabilities: { ...connected.capabilities, sync: state === "connected" } }] };
    const modernUi = load("components/settings/LinkedAccountSettings.tsx", { "next-intl": { useTranslations: t }, "@/lib/linked-accounts": c,
      "@/lib/linked-authentication": auth, "./NaverLinkedAuthentication": { NaverLinkedAuthentication: () => null }, "./GmailLinkedAuthentication": { GmailLinkedAuthentication: () => null }, "./LinkedMailViewer": { LinkedMailViewer: () => null },
      "@/context/linked-accounts-context": { useLinkedAccounts: () => ({ snapshot: { status: "ready", data }, busy: false, uncertain: false, error: null, refresh() {}, mutate() {} }) },
      "./SettingsPrimitives": { SettingsPanel: ({ title, children, actions }) => React.createElement("section", null, title, actions, children) },
      "@/components/ui/Tooltip": { Tooltip: ({ children }) => children },
      "@/components/ui/Button": load("components/ui/Button.tsx", { "./utils": load("components/ui/utils.ts") }),
      "@/components/ui/Input": {}, "@/components/ui/CustomSelect": {},
      "@/components/overlay/Modal": {}, "@/components/overlay/ConfirmDialog": {}, "@/components/overlay/DialogActions": {} });
    const markup = renderToStaticMarkup(React.createElement(modernUi.LinkedAccountSettings));
    assert.ok(markup.includes(messages.linkedAccountConnection[state]));
    assert.ok(markup.includes(renderToStaticMarkup(React.createElement("p", { className: "text-sm text-(--text-muted)" }, messages.linkedAccountAuth.scope))));
    assert.ok(!markup.includes(renderedNote), "new server contract must not display old server capability claim");
  }
}
const layout = read("app/[locale]/(workspace)/settings/layout.tsx");
assert.match(layout, /await initialLinkedAccounts/);
const sessionContract = load("lib/tastemail/session-contract.ts");
let primaryId = id;
const layoutModule = load("app/[locale]/(workspace)/settings/layout.tsx", {
  "@/context/linked-accounts-context": { LinkedAccountsProvider: () => null },
  "@/lib/tastemail/linked-accounts": { initialLinkedAccounts: async () => ({ status: "ready", data: list }) },
  "@/lib/tastemail/session": { tastemailSessionToken: async () => "synthetic-token" },
  "@/lib/tastemail/page-session": { livePageSession: async () => ({ status: "ready", session: {
    username: "same-name@example.test", apiUrl: "/jmap/api", primaryAccounts: { [sessionContract.MAIL_CAPABILITY]: primaryId }, accounts: { [primaryId]: {} },
  } }) },
  "@/lib/tastemail/session-contract": sessionContract,
  "@/components/ui/Dropdown": { SettingsDropdownPolicy: () => null },
});
const firstLayout = await layoutModule.default({ children: null, params: Promise.resolve({ locale: "ko" }) });
const sameLayout = await layoutModule.default({ children: null, params: Promise.resolve({ locale: "en" }) });
assert.equal(firstLayout.key, sameLayout.key, "same owner must retain pending recovery across locale navigation");
primaryId = "22222222-2222-4222-8222-222222222222";
const differentLayout = await layoutModule.default({ children: null, params: Promise.resolve({ locale: "ko" }) });
assert.notEqual(firstLayout.key, differentLayout.key, "changed primary UUID must remount even when username is reused");
assert.equal(differentLayout.props.ownerId, primaryId);
assert.deepEqual(differentLayout.props.initial, { status: "ready", data: list });
assert.doesNotMatch(provider, /localStorage/);
assert.match(provider, /readLinkedOperationJournal/);
console.log("Linked accounts: strict contracts, safe BFF, errors, unknown-write reconciliation, server initialization and ten-locale UI passed (synthetic only).");

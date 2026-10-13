import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url), read = p => readFileSync(p, "utf8");
function load(path, deps = {}) {
  const exports = {}, js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("exports", "require", js)(exports, name => name in deps ? deps[name] : require(name)); return exports;
}
const accounts = load("lib/linked-accounts.ts"), oauth = load("lib/linked-oauth.ts", { "./linked-accounts": accounts }), auth = load("lib/linked-authentication.ts", { "./linked-accounts": accounts });
const id = "11111111-1111-4111-8111-111111111111", origin = "https://synthetic.example";
const before = { id, provider: "gmail", email: "synthetic@gmail.com", revision: 1, credentialGeneration: 0, status: "pendingAuth", capabilities: { read: false, sync: false, send: false, mutate: false } };
const data = { accounts: [before], limit: 10, authenticationAvailable: { gmail: true, naver: true, tastemail: false } };
const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
for (const [k, v] of Object.entries({ client_id: "synthetic", redirect_uri: oauth.linkedOAuthRedirect(origin), response_type: "code", scope: "https://mail.google.com/", state: "s".repeat(43), access_type: "offline", prompt: "consent", login_hint: before.email, code_challenge: "c".repeat(43), code_challenge_method: "S256" })) authorization.searchParams.set(k, v);
const receipt = { authorizationUrl: authorization.href, expiresIn: 600 };
const source = read("context/linked-accounts-context.tsx"), section = source.slice(source.indexOf("  async function refresh()"), source.indexOf("\n  return <Context.Provider"));
const js = ts.transpileModule(section, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness({ initial = data, pageOrigin = origin, response = () => Response.json(receipt), assignThrows = false } = {}) {
  const state = { snapshot: { status: "ready", data: initial }, busy: false, uncertain: false, error: null, calls: [], navigations: [] };
  const pending = { current: false }, unresolved = { current: null }, generation = { current: 1 };
  const deps = { snapshot: state.snapshot, pending, unresolved, generation,
    setBusy: v => { state.busy = v; }, setSnapshot: v => { state.snapshot = typeof v === "function" ? v(state.snapshot) : v; }, setUncertain: v => { state.uncertain = v; }, setError: v => { state.error = v; },
    fetch: async (...args) => { state.calls.push(args); return response(); }, requireLinkedAccount: accounts.requireLinkedAccount, requireLinkedAccounts: accounts.requireLinkedAccounts, responseFailure: (_, b) => b.status,
    failures: ["unauthorized", "forbidden", "invalid_request", "mutation_uncertain", "conflict", ...auth.LINKED_AUTH_FAILURES],
    linkedAuthenticationCommand: auth.linkedAuthenticationCommand, linkedAuthBefore: auth.linkedAuthBefore, linkedAuthReceipt: auth.linkedAuthReceipt, linkedAuthResolved: auth.linkedAuthResolved,
    linkedOAuthBefore: oauth.linkedOAuthBefore, linkedOAuthRedirect: oauth.linkedOAuthRedirect, linkedOAuthStartReceipt: oauth.linkedOAuthStartReceipt, locales: ["ko", "en"],
    window: { location: { origin: pageOrigin, assign: url => { if (assignThrows) throw new Error("navigation failed"); state.navigations.push(url); } } } };
  return { state, pending, unresolved, generation, ...new Function(...Object.keys(deps), `${js}; return {startOAuth,mutate,refresh};`)(...Object.values(deps)) };
}
for (const options of [{ pageOrigin: "http://localhost:7540" }, { initial: { ...data, authenticationAvailable: false } }]) {
  const h = harness(options); assert.equal(await h.startOAuth(id, "ko"), false); assert.equal(h.state.calls.length, 0);
}
let h = harness(); assert.equal(await h.startOAuth(id, "invalid"), false); assert.equal(h.state.calls.length, 0);
h = harness(); assert.equal(await h.startOAuth(id, "ko"), true); assert.deepEqual(h.state.navigations, [authorization.href]);
assert.deepEqual(JSON.parse(h.state.calls[0][1].body), { expectedRevision: 1, locale: "ko" }); assert.equal(h.state.calls[0][1].cache, "no-store");
assert.equal(h.state.busy, true); await h.startOAuth(id, "ko"); await h.mutate({ method: "DELETE", id, input: { expectedRevision: 1 } }); assert.equal(h.state.calls.length, 1);
for (const response of [() => { throw new Error("network"); }, () => Response.json({ ...receipt, authorizationUrl: "https://untrusted.example" }), () => Response.json(receipt, { status: 201 }), () => Response.json({ status: "conflict" }, { status: 409 })]) {
  h = harness({ response }); assert.equal(await h.startOAuth(id, "ko"), false); assert.equal(h.state.navigations.length, 0); assert.equal(h.state.uncertain, true); assert.equal(h.state.busy, false);
  assert.deepEqual(h.unresolved.current, { kind: "oauthStart", before }); assert.doesNotMatch(JSON.stringify(h.unresolved.current), /authorizationUrl|code_challenge|ssssss/);
  await h.startOAuth(id, "ko"); await h.mutate({ method: "DELETE", id, input: { expectedRevision: 1 } }); assert.equal(h.state.calls.length, 1);
}
h = harness({ response: () => Response.json({ status: "forbidden", uncertain: false }, { status: 403 }) }); await h.startOAuth(id, "ko"); assert.equal(h.state.snapshot.status, "forbidden"); assert.equal(h.state.uncertain, false);
h = harness({ assignThrows: true }); await h.startOAuth(id, "ko"); assert.equal(h.state.uncertain, true);
let finish; h = harness({ response: () => new Promise(resolve => { finish = resolve; }) }); const waiting = h.startOAuth(id, "ko"); h.generation.current++; finish(Response.json(receipt)); await waiting; assert.equal(h.state.navigations.length, 0);
const connected = { ...before, revision: 2, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
assert.equal(auth.linkedAuthResolved(data, { kind: "oauthStart", before }), false);
assert.equal(auth.linkedAuthResolved({ ...data, accounts: [connected] }, { kind: "oauthStart", before }), true);
assert.equal(auth.linkedAuthResolved({ ...data, accounts: [{ ...connected, revision: 3 }] }, { kind: "oauthStart", before }), false);
const Button = load("components/ui/Button.tsx", { "./utils": load("components/ui/utils.ts") }).Button;
for (const file of readdirSync("messages").filter(f => f.endsWith(".json"))) {
  const messages = JSON.parse(read(`messages/${file}`));
  for (const locked of [false, true]) {
    const view = load("components/settings/GmailLinkedAuthentication.tsx", { "next-intl": { useLocale: () => file.slice(0, -5), useTranslations: ns => key => messages[ns][key] },
      "@/context/linked-accounts-context": { useLinkedAccounts: () => ({ snapshot: { status: "ready", data }, busy: locked, uncertain: false }) },
      "@/components/ui/Button": { Button }, "@/components/ui/Tooltip": { Tooltip: ({ children }) => children }, "@/components/overlay/ConfirmDialog": { ConfirmDialog: () => null } });
    const html = renderToStaticMarkup(React.createElement(view.GmailLinkedAuthentication, { account: before })); assert.ok(html.includes(messages.linkedGmailAuth.start)); assert.equal(html.includes('disabled=""'), locked);
    assert.equal(renderToStaticMarkup(React.createElement(view.GmailLinkedAuthentication, { account: { ...before, provider: "naver" } })), "");
  }
}
assert.match(read("components/settings/GmailLinkedAuthentication.tsx"), /<ConfirmDialog tone="default"/);
assert.match(read("components/settings/LinkedAccountSettings.tsx"), /<GmailLinkedAuthentication account=\{account\}/);
console.log("Gmail OAuth start: actual Provider guards/navigation/unknown result/generation and ten-locale SSR passed (synthetic only).");

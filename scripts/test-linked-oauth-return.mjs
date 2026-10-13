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
const accounts = load("lib/linked-accounts.ts"), oauth = load("lib/linked-oauth.ts", { "./linked-accounts": accounts }), returned = load("lib/linked-oauth-return.ts", { "./linked-oauth": oauth });
const locales = ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"];
const Button = load("components/ui/Button.tsx", { "./utils": load("components/ui/utils.ts") }).Button;
let activeLocale = "ko", seed = [], cursor = 0;
const view = load("components/settings/LinkedOAuthReturnView.tsx", {
  react: { ...React, useState: value => [seed[cursor++] ?? value, () => {}], useRef: value => ({ current: value }), useEffect() {} },
  "next-intl": { useLocale: () => activeLocale, useTranslations: namespace => key => {
    const value = JSON.parse(read(`messages/${activeLocale}.json`))[namespace][key]; assert.equal(typeof value, "string"); return value;
  } }, "@/components/ui/Button": { Button }, "@/lib/linked-oauth-return": returned, "@/lib/linked-accounts": accounts, "@/i18n/routing": { locales },
}).LinkedOAuthReturnView;
for (const file of readdirSync("messages").filter(f => f.endsWith(".json"))) {
  activeLocale = file.slice(0, -5);
  for (const status of ["loading", "ready", "busy", "success", "denied", "invalid", "failed", "uncertain"]) {
    cursor = 0; seed = [activeLocale, status];
    const html = renderToStaticMarkup(React.createElement(view));
    assert.ok(html.includes("oauth-return-title"));
    assert.equal((html.match(/<button/g) ?? []).length, ["ready", "denied"].includes(status) ? 1 : 0);
    assert.equal((html.match(/href=/g) ?? []).length, ["success", "invalid", "failed", "uncertain"].includes(status) ? 1 : 0);
    assert.ok(!html.includes("synthetic-code") && !html.includes("access_token") && !html.includes("localStorage"));
  }
}
const source = read("components/settings/LinkedOAuthReturnView.tsx");
const effectText = source.slice(source.indexOf("  useEffect(() => {") + "  useEffect(() => {".length, source.indexOf("  }, []);"));
const state = "s".repeat(43), callback = { state, code: "synthetic-code" };
const captured = { current: null }, loaded = { current: false }, generation = { current: 0 }, pending = { current: false };
let status, language, requests = [], response = Response.json({}), locationAssigned;
const fakeWindow = { location: { pathname: "/ko/oauth-return", hash: `#${new URLSearchParams(callback)}`, assign: path => { locationAssigned = path; } }, history: { replaceState: (_, __, path) => {
  assert.equal(path, "/ko/oauth-return"); assert.equal(captured.current, null, "clear the address before retaining code in memory"); fakeWindow.location.hash = "";
} } };
const effect = new Function("generation", "loaded", "captured", "setStatus", "parseLinkedOAuthFragment", "window", effectText);
const cleanup = effect(generation, loaded, captured, v => { status = v; }, returned.parseLinkedOAuthFragment, fakeWindow);
assert.equal(status, "ready"); assert.deepEqual(captured.current, callback); assert.equal(fakeWindow.location.hash, "");
cleanup(); effect(generation, loaded, captured, v => { status = v; }, returned.parseLinkedOAuthFragment, fakeWindow);
assert.deepEqual(captured.current, callback, "Strict Mode effect replay retains the one captured result without re-reading an empty URL");
const finishText = ts.transpileModule(source.slice(source.indexOf("  async function finish()"), source.indexOf("  return <main")), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const finishFactory = new Function("pending", "captured", "status", "generation", "setStatus", "setReturnLocale", "fetch", "locales", "requireLinkedAccount", "window", `${finishText}; return finish;`);
const fetch = async (url, init) => { assert.equal(captured.current, null, "code removed from ref before dispatch"); requests.push({ url, init }); return response; };
const finish = initial => finishFactory(pending, captured, initial, generation, v => { status = v; }, v => { language = v; }, fetch, locales, accounts.requireLinkedAccount, fakeWindow);
const id = "11111111-1111-4111-8111-111111111111", account = { id, provider: "gmail", email: "synthetic@gmail.com", revision: 2, credentialGeneration: 1, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
captured.current = callback; response = Response.json({ account, locale: "en" });
await finish("ready")();
assert.equal(status, "success"); assert.equal(language, "en");
assert.equal(requests.at(-1).url, "/api/mail/linked-accounts/oauth/complete");
assert.deepEqual(JSON.parse(requests.at(-1).init.body), callback);
const count = requests.length; await finish("ready")(); assert.equal(requests.length, count, "captured code cannot be resubmitted");
captured.current = { state, cancelled: true }; response = Response.json({ cancelled: true, locale: "en" });
await finish("denied")(); assert.equal(locationAssigned, "/en/settings/account");
assert.equal(requests.at(-1).url, "/api/mail/linked-accounts/oauth/cancel"); assert.deepEqual(JSON.parse(requests.at(-1).init.body), { state });
for (const value of [Response.json({ status: "conflict", uncertain: false }, { status: 409 }), Response.json({ status: "mutation_uncertain", uncertain: true }, { status: 502 }), Response.json({ account, locale: "../../untrusted" })]) {
  captured.current = callback; response = value; await finish("ready")();
  assert.equal(status, value.status === 409 ? "failed" : "uncertain");
  assert.equal(captured.current, null);
}
for (const forbidden of [/localStorage/, /sessionStorage/, /console\./, /window\.location\.search/]) assert.ok(!forbidden.test(source));
assert.match(read("next.config.ts"), /incomingRequests/);
assert.match(read("app/api/mail/linked-accounts/oauth/callback/route.ts"), /linkedOAuthReturnRoute/);
console.log("Actual OAuth return controls in ten locales, fragment cleanup/Strict Mode, one submission and cancellation/error flow passed (synthetic only).");

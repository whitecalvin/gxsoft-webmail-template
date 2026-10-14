import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url), read = path => readFileSync(path, "utf8");
function load(path, deps = {}) { const exports = {}, source = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText; new Function("exports", "require", source)(exports, name => name in deps ? deps[name] : require(name)); return exports; }
const accounts = load("lib/linked-accounts.ts"), mail = load("lib/linked-mail.ts", { "./linked-accounts": accounts }), folders = load("lib/linked-folders.ts", { "./linked-accounts": accounts, "./linked-mail": mail });
const jobs = load("lib/linked-sync-jobs.ts", { "./linked-accounts": accounts, "./linked-folders": folders });
const session = load("lib/tastemail/client-session-status.ts"), Button = load("components/ui/Button.tsx", { "./utils": load("components/ui/utils.ts") }).Button;
const id = "11111111-1111-4111-8111-111111111111", account = { id, revision: 2, credentialGeneration: 1, capabilities: { sync: true } };
const receipt = { linkedAccountId: id, revision: 2, credentialGeneration: 1, jobs: [{ folder: "A&-B", label: "A&B", status: "paused", attempts: 2, lastError: "reauthRequired", userPaused: null, controlRevision: null }] };
for (const patch of [{ linkedAccountId: "22222222-2222-4222-8222-222222222222" }, { revision: 3 }, { credentialGeneration: 2 }, { jobs: [{ ...receipt.jobs[0], label: "wrong" }] }]) assert.throws(() => jobs.linkedSyncJobsReceipt({ ...receipt, ...patch }, account));
const english = JSON.parse(read("messages/en.json"));
function view(translations = english, react = React) { return load("components/settings/LinkedSyncJobsPanel.tsx", { react, "next-intl": { useTranslations: namespace => (key, args = {}) => translations[namespace][key]?.replace(/\{(\w+)\}/g, (_, k) => args[k]) }, "@/lib/linked-accounts": accounts, "@/lib/linked-sync-jobs": jobs, "@/lib/tastemail/client-session-status": session, "@/components/ui/Button": { Button }, "@/components/overlay/ConfirmDialog": { ConfirmDialog: () => null }, "@/context/linked-accounts-context": { useLinkedAccounts: () => ({ busy: false, uncertain: false, controlJob() { throw Error("read-only test must not control a job"); } }) } }); }
const oldFetch = globalThis.fetch; let respond, calls = [];
globalThis.fetch = async (...args) => { calls.push(args); return respond(); };
try {
  for (const locale of readdirSync("messages").filter(name => name.endsWith(".json"))) {
    const translations = JSON.parse(read(`messages/${locale}`)), v = view(translations);
    const html = renderToStaticMarkup(React.createElement(v.LinkedSyncJobsPanel, { account }));
    assert.ok(html.includes(translations.linkedSyncJobs.title)); assert.ok(html.includes(translations.linkedSyncJobs.loading)); assert.ok(!html.includes("undefined"));
  }
  assert.equal(calls.length, 0, "SSR never requests jobs");
  const v = view(), signal = new AbortController().signal;
  respond = () => Response.json(receipt); assert.deepEqual(await v.linkedJobsRead(account, signal), receipt);
  assert.equal(calls[0][0], `/api/mail/linked-accounts/${id}/sync/jobs`); assert.equal(calls[0][1].cache, "no-store"); assert.equal(calls[0][1].method, undefined, "only default GET");
  for (const patch of [{ revision: 3 }, { credentialGeneration: 2 }, { linkedAccountId: "22222222-2222-4222-8222-222222222222" }]) { respond = () => Response.json({ ...receipt, ...patch }); await assert.rejects(v.linkedJobsRead(account, signal)); }
  for (const [status, error] of [[401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"]]) { respond = () => new Response(null, { status }); await assert.rejects(v.linkedJobsRead(account, signal), e => e.message === error); }
  respond = () => new Response("x".repeat(256 * 1024 + 1)); await assert.rejects(v.linkedJobsRead(account, signal), e => e.message === "unavailable");
  let values = [], index = 0, effects = [];
  const hooks = { ...React, useState: initial => { const i = index++; if (!(i in values)) values[i] = initial; return [values[i], value => { values[i] = typeof value === "function" ? value(values[i]) : value; }]; }, useEffect: effect => effects.push(effect) };
  const component = view(english, hooks), render = target => { index = 0; effects = []; return component.LinkedSyncJobsPanel({ account: target }); };
  function find(node, predicate) { if (!node || typeof node !== "object") return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props?.children)) { const result = find(child, predicate); if (result) return result; } return null; }
  let finish; respond = () => new Promise(resolve => { finish = resolve; });
  let tree = render(account), cleanup = effects[0](); assert.equal(find(tree, node => node.type === Button).props.disabled, true);
  finish(Response.json(receipt)); await new Promise(resolve => setImmediate(resolve));
  tree = render(account); assert.ok(find(tree, node => node.props?.children === "A&B")); assert.ok(find(tree, node => node.props?.children === english.linkedSyncJobs.reauthRequired));
  const button = find(tree, node => node.type === Button); assert.equal(button.props.disabled, false); button.props.onClick(); cleanup(); tree = render(account); assert.equal(find(tree, node => node.type === Button).props.disabled, true);
  const prior = values[1]; cleanup = effects[0](); cleanup(); finish(Response.json(receipt)); await new Promise(resolve => setImmediate(resolve)); assert.equal(values[1], prior, "late completion after close does not publish");
  const other = { ...account, id: "22222222-2222-4222-8222-222222222222" }; tree = render(other); assert.equal(find(tree, node => node.props?.children === "A&B"), null, "previous account jobs never render in another scope");
  console.log("Linked sync jobs UI: ten-locale request-free SSR, scoped/bounded GET, real effect rendering/refresh/abort and late-result isolation passed (synthetic only).");
} finally { globalThis.fetch = oldFetch; }

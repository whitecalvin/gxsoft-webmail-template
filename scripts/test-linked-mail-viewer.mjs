import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url), read = p => readFileSync(p, "utf8");
function load(path, deps = {}, extra = "") {
  const exports = {}, js = ts.transpileModule(read(path) + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("exports", "require", js)(exports, name => name in deps ? deps[name] : require(name)); return exports;
}
const accounts = load("lib/linked-accounts.ts"), mail = load("lib/linked-mail.ts", { "./linked-accounts": accounts });
const status = load("lib/tastemail/client-session-status.ts"), Button = load("components/ui/Button.tsx", { "./utils": load("components/ui/utils.ts") }).Button;
const id = "11111111-1111-4111-8111-111111111111", folder = "A&-B", item = { uid: 8, uidValidity: 7, subject: "Synthetic subject", sender: "synthetic@example.com", flags: [] };
const page = { linkedAccountId: id, folder, messages: [item] }, detail = { linkedAccountId: id, folder, uid: 8, uidValidity: 7, body: { textBody: "Synthetic only", htmlBody: null, blockedExternalImages: false, preview: "" }, attachments: [] };
let response = Response.json(page), calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => { calls.push(args); return response; };
const account = { id, provider: "naver", email: "synthetic@naver.com", revision: 3, credentialGeneration: 2, status: "connected", capabilities: { read: true, sync: true, send: false, mutate: false } };
const snapshot = { status: "ready", data: { accounts: [account], limit: 10, authenticationAvailable: { gmail: true, naver: true, tastemail: false } } };
const source = read("components/settings/LinkedMailViewer.tsx");
function view(translations, context = {}, react = React) {
  return load("components/settings/LinkedMailViewer.tsx", {
    react, "next-intl": { useTranslations: ns => (key, args = {}) => translations[ns][key]?.replace(/\{(\w+)\}/g, (_, k) => args[k] ?? `{${k}}`) },
    "@/context/linked-accounts-context": { useLinkedAccounts: () => ({ snapshot, busy: false, uncertain: false, ...context }) },
    "@/lib/linked-mail": mail, "@/lib/tastemail/client-session-status": status,
    "@/components/ui/Button": { Button }, "@/components/ui/CustomSelect": { CustomSelect: props => React.createElement("select", props) },
    "@/components/ui/Tooltip": { Tooltip: ({ children }) => children }, "@/components/overlay/Modal": { Modal: ({ children }) => React.createElement("div", { role: "dialog" }, children) },
    "@/components/overlay/ConfirmDialog": { ConfirmDialog: () => null }, "./LinkedHtmlMessageBody": { LinkedHtmlMessageBody: () => null }, "./LinkedAttachmentDownload": { LinkedAttachmentDownload: () => null }, "./LinkedSyncJobsPanel": { LinkedSyncJobsPanel: () => null },
  }, "\nexport { CachedAccountView };\n");
}
try {
  const english = JSON.parse(read("messages/en.json")), v = view(english), signal = new AbortController().signal;
  assert.deepEqual(await v.linkedCachedRead(id, folder, signal), { ...page, nextBeforeUid: null });
  let url = new URL(calls[0][0], "https://synthetic.example"); assert.equal(url.searchParams.get("folder"), folder); assert.equal(calls[0][1].cache, "no-store"); assert.equal(calls[0][1].method, undefined);
  response = Response.json({ ...page, messages: [] }); await v.linkedCachedRead(id, folder, signal, undefined, 8);
  url = new URL(calls.at(-1)[0], "https://synthetic.example"); assert.equal(url.searchParams.get("beforeUid"), "8");
  response = Response.json(detail); assert.deepEqual(await v.linkedCachedRead(id, folder, signal, item), detail);
  url = new URL(calls.at(-1)[0], "https://synthetic.example"); assert.equal(url.pathname, `/api/mail/linked-accounts/${id}/messages/8`); assert.equal(url.searchParams.get("uidValidity"), "7");
  const count = calls.length; await assert.rejects(v.linkedCachedRead("bad", folder, signal), /invalid_request/); assert.equal(calls.length, count);
  for (const patch of [{ linkedAccountId: "different" }, { folder: "different" }, { uidValidity: 9 }, { uid: 9 }]) {
    response = Response.json({ ...detail, ...patch }); await assert.rejects(v.linkedCachedRead(id, folder, signal, item));
  }
  for (const [http, expected] of [[401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"], [502, "unavailable"]]) {
    response = Response.json({}, { status: http }); await assert.rejects(v.linkedCachedRead(id, folder, signal), new RegExp(expected));
  }
  response = Response.json({ status: "not_deployed" }, { status: 404 }); await assert.rejects(v.linkedCachedRead(id, folder, signal), /not_deployed/);
  const abort = new AbortController(); globalThis.fetch = async (_, options) => new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  const waiting = v.linkedCachedRead(id, folder, abort.signal); abort.abort(); await assert.rejects(waiting, /aborted/);
  globalThis.fetch = async (...args) => { calls.push(args); return response; };
  for (const file of readdirSync("messages").filter(f => f.endsWith(".json"))) {
    const translations = JSON.parse(read(`messages/${file}`));
    for (const busy of [false, true]) {
      const ui = view(translations, { busy }); const html = renderToStaticMarkup(React.createElement(ui.LinkedMailViewer, { initialId: id, onClose() {} }));
      assert.ok(html.includes(translations.linkedMail.open)); assert.ok(html.includes(translations.linkedMail.chooseHint)); assert.ok(html.includes(account.email));
      assert.ok(html.includes(translations.linkedMail.folders)); assert.doesNotMatch(html, /iframe|Synthetic subject/);
    }
  }
  assert.equal(calls.length, count + 9, "SSR does not issue folder or mail requests");
  // 실제 효과 함수에서 계정/폴더별 abort cleanup과 늦은 응답 차단을 검사합니다.
  const effects = [], fakeReact = { ...React, useState: init => [typeof init === "function" ? init() : init, () => {}], useRef: init => ({ current: init }), useEffect: fn => effects.push(fn) };
  view(english, {}, fakeReact).CachedAccountView({ account }); effects.forEach(fn => { const cleanup = fn(); cleanup?.(); });
  assert.match(source, /if \(!controller.signal.aborted\) setPage/); assert.match(source, /if \(!controller.signal.aborted\) setDetail/);
  assert.match(source, /key=\{`\$\{account.id\}:\$\{account.revision\}:\$\{account.credentialGeneration\}`\}/);
  assert.match(source, /active.current && result/); assert.match(source, /<ConfirmDialog tone="default"/);
  assert.doesNotMatch(source, /localStorage|\/api\/mail\/flags|\/sync|\/compose|\/move/);
  const renderer = read("components/mail/LiveHtmlMessageBody.tsx");
  assert.match(renderer, /isolatedReadOnly \? imageOverride === true/);
  assert.match(renderer, /if \(isolatedReadOnly \|\| !externalImagesPresent/);
  assert.match(renderer, /if \(isolatedReadOnly \|\| inline.length === 0\)/);
  assert.match(renderer, /!isolatedReadOnly && remoteImages !== "always"/);
  // 실제 UI 이벤트를 실행해 확인 전에는 동기화가 없고 정확한 폴더만 전송함을 검증합니다.
  const values = [], refs = [], mountEffects = []; let stateIndex = 0, refIndex = 0, syncCalls = [], resolveSync, queueCalls = [], queueDeferred = false, resolveQueue;
  const hooks = { ...React,
    useState: initial => { const index = stateIndex++; if (!(index in values)) values[index] = index === 0 ? { folders: [{ value: folder, label: "A&B" }] } : index === 1 ? folder : initial; return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useRef: initial => { const index = refIndex++; return refs[index] ??= { current: initial }; }, useEffect: fn => mountEffects.push(fn) };
  const syncUi = view(english, { syncFolder: async (...args) => { syncCalls.push(args); return new Promise(resolve => { resolveSync = resolve; }); }, queueFolder: async (...args) => { queueCalls.push(args); return queueDeferred ? new Promise(resolve => { resolveQueue = resolve; }) : true; } }, hooks);
  const render = () => { stateIndex = 0; refIndex = 0; return syncUi.CachedAccountView({ account }); };
  function find(node, predicate) { if (!node || typeof node !== "object") return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props?.children)) { const match = find(child, predicate); if (match) return match; } return null; }
  let tree = render(); const unmount = mountEffects[0]();
  assert.equal(find(tree, node => node.type?.name === "LinkedSyncJobsPanel"), null);
  const jobsButton = find(tree, node => node.props?.children === english.linkedSyncJobs.title && typeof node.props?.onClick === "function");
  assert.ok(jobsButton); assert.equal(jobsButton.props["aria-expanded"], false); jobsButton.props.onClick(); tree = render();
  assert.ok(find(tree, node => node.type?.name === "LinkedSyncJobsPanel")); assert.equal(syncCalls.length, 0, "job-list toggle does not execute synchronization");
  const queueButton = find(tree, node => node.props?.children === english.linkedSyncQueue.schedule && typeof node.props?.onClick === "function");
  assert.ok(queueButton); queueButton.props.onClick(); assert.equal(queueCalls.length, 0); tree = render();
  const queueDialog = find(tree, node => node.props?.title === english.linkedSyncQueue.schedule && typeof node.props?.onConfirm === "function");
  assert.ok(queueDialog); assert.ok(queueDialog.props.description.includes(account.email)); assert.ok(queueDialog.props.description.includes("A&B")); assert.equal(queueDialog.props.tone, "warning");
  await queueDialog.props.onConfirm(); assert.deepEqual(queueCalls, [[id, folder]]); assert.equal(values[14], folder); assert.equal(values[15], 1);
  assert.equal(syncCalls.length, 0); const syncButton = find(tree, node => node.props?.children === english.linkedMail.sync && typeof node.props?.onClick === "function"); assert.ok(syncButton); syncButton.props.onClick(); assert.equal(syncCalls.length, 0);
  tree = render(); let dialog = find(tree, node => node.props?.title === english.linkedMail.sync && typeof node.props?.onConfirm === "function"); assert.ok(dialog);
  let syncing = dialog.props.onConfirm(); assert.deepEqual(syncCalls, [[id, folder]]); resolveSync({ folder, messages: 3, cycleComplete: false }); await syncing;
  assert.deepEqual(values[11], { folder, count: 3, complete: false }); assert.deepEqual(values[6], [undefined]);
  tree = render(); find(tree, node => node.props?.children === english.linkedMail.sync && typeof node.props?.onClick === "function").props.onClick(); tree = render(); dialog = find(tree, node => node.props?.title === english.linkedMail.sync && typeof node.props?.onConfirm === "function");
  syncing = dialog.props.onConfirm(); unmount(); resolveSync({ folder, messages: 5, cycleComplete: true }); await syncing; assert.equal(values[11], null, "late sync does not update a closed account view");
  queueDeferred = true; tree = render(); find(tree, node => node.props?.children === english.linkedSyncQueue.schedule && typeof node.props?.onClick === "function").props.onClick(); tree = render();
  const lateQueueDialog = find(tree, node => node.props?.title === english.linkedSyncQueue.schedule && typeof node.props?.onConfirm === "function");
  const queueing = lateQueueDialog.props.onConfirm(); resolveQueue(true); await queueing;
  assert.equal(values[14], null); assert.equal(values[15], 1, "late queue receipt does not refresh jobs after close");
  console.log("Linked mail viewer: exact cached GET identity/cursor, failures/abort, ten-locale initial SSR, no automatic requests and shared isolated renderer guards passed (synthetic only).");
} finally { globalThis.fetch = originalFetch; }

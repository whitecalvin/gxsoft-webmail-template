import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url), read = p => readFileSync(p, "utf8");
function load(path, deps = {}) { const exports = {}, js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText; new Function("exports", "require", js)(exports, n => n === "server-only" ? {} : n in deps ? deps[n] : require(n)); return exports; }
const accounts = load("lib/linked-accounts.ts"), mail = load("lib/linked-mail.ts", { "./linked-accounts": accounts });
const contract = load("lib/linked-attachment.ts", { "./linked-mail": mail });
const id = "11111111-1111-4111-8111-111111111111", identity = { linkedAccountId: id, folder: "A&-B/ +", uid: 9, uidValidity: 7 };
const params = new URLSearchParams({ folder: identity.folder, uidValidity: "7" }), metadata = { index: 0, name: "첨부.txt", size: 3, contentType: "text/plain", disposition: "attachment", cid: null };
assert.deepEqual(contract.linkedAttachmentQuery(id, "9", "0", params), { identity, index: 0 });
for (const index of ["-1", "01", "1024", "1e2", "", "0/../1"]) assert.equal(contract.linkedAttachmentQuery(id, "9", index, params), null);
assert.equal(contract.linkedAttachmentQuery(id, "9", "0", new URLSearchParams({ ...Object.fromEntries(params), token: "secret" })), null);
for (const name of ["../../unsafe\r\n.txt", "..\\unsafe\".txt", "\ud800.txt", "", "a".repeat(9000)]) {
  const header = contract.linkedAttachmentDisposition(name, 0); assert.match(header, /^attachment; filename="attachment-1.bin"; filename\*=UTF-8''/); assert.doesNotMatch(header, /[\r\n]|\.\.\//); assert.ok(header.length < 1600);
}
class LinkedAccountError extends Error { constructor(status) { super(status); this.status = status; } }
let result = new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "application/octet-stream" } }), detail = { ...identity, attachments: [metadata] }, detailCalls = 0, requests = [];
const server = { assertLiveApiConfigured() {}, serviceStatus: code => code === 401 ? "unauthorized" : code === 403 ? "forbidden" : code === 429 ? "rateLimited" : "unavailable", tastemailRequest: async (...args) => { requests.push(args); return result; } };
const adapter = load("lib/tastemail/linked-attachment.ts", { "../linked-attachment": contract, "./linked-mail": { requestLinkedMail: async (...args) => { detailCalls++; assert.equal(args[0], "synthetic-token"); assert.equal(args[1], id); assert.deepEqual(args[2], identity); return detail; } }, "./linked-accounts": { LinkedAccountError }, "./server": server });
let value = await adapter.requestLinkedAttachment("synthetic-token", identity, 0); assert.deepEqual([...value.data], [1, 2, 3]); assert.equal(value.name, metadata.name);
const [path, token, init] = requests.at(-1); assert.equal(token, "synthetic-token"); assert.equal(init.method, "GET"); assert.ok(init.signal instanceof AbortSignal);
const url = new URL(path, "https://synthetic.test"); assert.equal(url.pathname, `/api/user/linked-accounts/${id}/messages/9/attachments/0`); assert.equal(url.searchParams.get("folder"), identity.folder); assert.equal(url.searchParams.get("uidValidity"), "7");
let count = detailCalls; await assert.rejects(adapter.requestLinkedAttachment("synthetic-token", identity, 1024), e => e.status === "invalid_request"); assert.equal(detailCalls, count);
count = requests.length; detail = { ...identity, attachments: [] }; await assert.rejects(adapter.requestLinkedAttachment("synthetic-token", identity, 0), e => e.status === "not_found"); assert.equal(requests.length, count); detail = { ...identity, attachments: [metadata] };
for (const response of [new Response(new Uint8Array([1, 2])), new Response(new Uint8Array([1, 2, 3, 4])), new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "text/html" } }), new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "application/octet-stream", "content-length": "4" } })]) {
  result = response; await assert.rejects(adapter.requestLinkedAttachment("synthetic-token", identity, 0), e => e.status === "unavailable");
}
for (const [http, type, status] of [[401, "", "unauthorized"], [403, "", "forbidden"], [429, "", "rateLimited"], [404, "notFound", "not_found"], [404, "", "not_deployed"], [409, "", "conflict"]]) { result = Response.json({ type }, { status: http }); await assert.rejects(adapter.requestLinkedAttachment("synthetic-token", identity, 0), e => e.status === status); }
let cancelled = false; result = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-type": "application/octet-stream" } });
let controller = new AbortController(), waiting = adapter.requestLinkedAttachment("synthetic-token", identity, 0, controller.signal); await new Promise(resolve => setTimeout(resolve, 0)); controller.abort(); await assert.rejects(waiting, e => e.status === "unavailable"); assert.equal(cancelled, true);
let session = null;
const route = load("lib/tastemail/linked-attachment-route.ts", { "../linked-attachment": contract, "./contact-route": { sameOrigin: r => r.headers.get("origin") === "https://synthetic.test" }, "./session": { tastemailSessionToken: async () => session }, "./server": server, "./linked-accounts": { LinkedAccountError }, "./linked-attachment": adapter });
const req = (headers = {}, query = params, method = "GET") => new Request(`https://synthetic.test/api/mail/linked-accounts/${id}/messages/9/attachments/0?${query}`, { headers, method });
assert.equal((await route.linkedAttachmentRoute(req(), id, "9", "0")).status, 401);
assert.equal((await route.linkedAttachmentRoute(req({ "sec-fetch-site": "cross-site" }), id, "9", "0")).status, 403);
assert.equal((await route.linkedAttachmentRoute(req({ origin: "https://untrusted.test" }), id, "9", "0")).status, 403);
assert.equal((await route.linkedAttachmentRoute(req({}, params, "POST"), id, "9", "0")).status, 405);
assert.equal((await route.linkedAttachmentRoute(req(), id, "9", "01")).status, 400);
session = "synthetic-token"; result = new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "application/octet-stream" } });
value = await route.linkedAttachmentRoute(req(), id, "9", "0"); assert.equal(value.status, 200); assert.equal(value.headers.get("content-type"), "application/octet-stream"); assert.equal(value.headers.get("content-length"), "3"); assert.match(value.headers.get("content-disposition"), /attachment;.*UTF-8''/); assert.equal(value.headers.get("x-content-type-options"), "nosniff"); assert.match(value.headers.get("cache-control"), /private, no-store/); assert.match(value.headers.get("content-security-policy"), /sandbox/); assert.deepEqual([...new Uint8Array(await value.arrayBuffer())], [1, 2, 3]);
const Button = load("components/ui/Button.tsx", { "./utils": load("components/ui/utils.ts") }).Button;
const clientStatus = load("lib/tastemail/client-session-status.ts");
function client(messages, react = React) { return load("components/settings/LinkedAttachmentDownload.tsx", { react, "next-intl": { useTranslations: ns => key => messages[ns][key] }, "@/components/ui/Button": { Button }, "@/components/ui/Tooltip": { Tooltip: ({ children }) => children }, "@/lib/linked-attachment": contract, "@/lib/tastemail/client-session-status": clientStatus }); }
const oldFetch = globalThis.fetch; let fetched = 0;
try {
  globalThis.fetch = async () => { fetched++; return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "application/octet-stream", "content-length": "3" } }); };
  const ui = client(JSON.parse(read("messages/en.json"))); const blob = await ui.linkedAttachmentBlob(identity, metadata, new AbortController().signal); assert.equal(blob.type, "application/octet-stream"); assert.equal(blob.size, 3);
  const sent = fetched; await assert.rejects(ui.linkedAttachmentBlob(identity, { ...metadata, index: -1 }, new AbortController().signal), /invalid_request/); assert.equal(fetched, sent);
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "content-type": "application/octet-stream", "content-length": "3" } }); await assert.rejects(ui.linkedAttachmentBlob(identity, metadata, new AbortController().signal), /unavailable/);
  globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-type": "application/octet-stream", "content-length": "3" } });
  controller = new AbortController(); waiting = ui.linkedAttachmentBlob(identity, metadata, controller.signal); await new Promise(resolve => setTimeout(resolve, 0)); controller.abort(); await assert.rejects(waiting);
  for (const file of readdirSync("messages").filter(f => f.endsWith(".json"))) {
    const messages = JSON.parse(read(`messages/${file}`)), component = client(messages);
    for (const disabled of [false, true]) { const html = renderToStaticMarkup(React.createElement(component.LinkedAttachmentDownload, { identity, attachment: metadata, disabled, failure: s => s })); assert.ok(html.includes(messages.linkedMail.download)); assert.equal(html.includes('disabled=""'), disabled); }
  }
  assert.equal(fetched, sent, "initial rendering never downloads mail");
  // 실제 컴포넌트 클릭 함수를 실행하되 파일 저장 API는 합성 구현으로 대체합니다.
  const effects = [], stateWrites = [];
  const hooks = { ...React, useState: value => [value, next => stateWrites.push(next)], useRef: value => ({ current: value }), useEffect: fn => effects.push(fn) };
  const component = client(JSON.parse(read("messages/en.json")), hooks), tree = component.LinkedAttachmentDownload({ identity, attachment: metadata, disabled: false, failure: s => s });
  let button;
  function find(node) { if (!node || typeof node !== "object") return; if (node.type === Button) button = node; for (const child of React.Children.toArray(node.props?.children)) find(child); }
  find(tree); assert.ok(button); const cleanup = effects[0]();
  let finish, dispatches = 0;
  globalThis.fetch = async () => { dispatches++; return new Promise(resolve => { finish = resolve; }); };
  button.props.onClick(); button.props.onClick(); assert.equal(dispatches, 1, "double click does not dispatch another download");
  const beforeUnmount = stateWrites.length; cleanup();
  finish(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "application/octet-stream", "content-length": "3" } }));
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(stateWrites.length, beforeUnmount, "late download cannot update an unmounted account/message view");
} finally { globalThis.fetch = oldFetch; }
assert.match(read("app/api/mail/linked-accounts/[id]/messages/[uid]/attachments/[index]/route.ts"), /await context.params/);
console.log("Linked attachment: exact identity/index, metadata-bound byte budget, headers/name isolation, errors, stream abort and ten-locale download SSR passed (synthetic only).");

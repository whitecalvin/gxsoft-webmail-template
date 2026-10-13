import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { requireLiveSearchDetail, requireLiveSearchPage } from "../lib/tastemail/search-page.ts";
const message = {
  id: "synthetic", from: { name: "Synthetic", email: "test@example.invalid" }, subject: "Test", preview: "Test",
  body: [], htmlBody: null, detailLoaded: false, blockedExternalImages: false, receivedAt: "2026-10-01T00:00:00Z",
  mailboxName: "Inbox", mailboxRole: "inbox",
};
const page = { position: 0, total: 1, limit: 50, messages: [message] };
const adapter = ts.createSourceFile("mail.ts", readFileSync(new URL("../lib/tastemail/mail.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const search = adapter.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "loadLiveMailSearch");
let projection;
function findProjection(node) {
  if (ts.isCallExpression(node) && node.expression.getText(adapter) === "byId.set") projection = node.arguments[1];
  ts.forEachChild(node, findProjection);
}
findProjection(search);
assert.ok(projection);
const projectionJs = ts.transpileModule(`const projected = ${projection.getText(adapter)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const normalized = { ...message, to: ["to@example.invalid"], cc: ["cc@example.invalid"], bcc: ["bcc@example.invalid"], replyTo: "reply@example.invalid" };
const projected = new Function("email", "displayMailbox", `${projectionJs};return projected;`)(normalized, { name: "Inbox", role: "inbox" });
for (const key of ["to", "cc", "bcc", "replyTo"]) assert.deepEqual(projected[key], normalized[key]);
assert.match(search.getText(adapter), /properties: \["id", "keywords", "receivedAt", "subject", "from", "to", "cc", "bcc", "replyTo"/);
assert.match(search.getText(adapter), /fetchTextBodyValues: false, fetchHTMLBodyValues: false/);
assert.equal(requireLiveSearchPage(page), page);
const recipients = { ...message, to: ["to@example.invalid"], cc: ["cc@example.invalid"], bcc: ["bcc@example.invalid"], replyTo: "reply@example.invalid" };
assert.equal(requireLiveSearchPage({ ...page, messages: [recipients] }).messages[0], recipients);
for (const change of [{ to: "wrong" }, { to: [3] }, { cc: [null] }, { bcc: {} }, { replyTo: [] }]) {
  assert.throws(() => requireLiveSearchPage({ ...page, messages: [{ ...message, ...change }] }), /unavailable/);
}
assert.doesNotThrow(() => requireLiveSearchPage({ position: 0, total: 0, limit: 50, messages: [] }));
assert.doesNotThrow(() => requireLiveSearchPage({ ...page, messages: [{ ...message, attachments: [{ blobId: "synthetic-blob", name: "test.txt", type: "text/plain", size: 1 }] }] }));
for (const value of [null, {}, { ...page, limit: 0 }, { ...page, total: -1 }, { ...page, position: 0.5 }, { ...page, messages: null },
  { ...page, total: 2, messages: [message, message] }]) assert.throws(() => requireLiveSearchPage(value), /unavailable/);
for (const change of [{ from: null }, { receivedAt: "invalid" }, { body: null }, { body: [{}] }, { mailboxRole: 1 },
  { htmlBody: {} }, { attachments: [{}] }, { attachments: [{ blobId: "x", name: "x", type: "x", size: -1 }] }, { detailLoaded: "false" }]) {
  assert.throws(() => requireLiveSearchPage({ ...page, messages: [{ ...message, ...change }] }), /unavailable/);
}

// Exercise actual component handlers, including stale/aborted success and errors.
const source = ts.createSourceFile("LiveMailSearch.tsx", readFileSync(new URL("../components/search/LiveMailSearch.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = [];
function visit(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ["then", "catch"].includes(node.expression.name.text) && ts.isArrowFunction(node.arguments[0])) callbacks.push(node.arguments[0]);
  ts.forEachChild(node, visit);
}
visit(source);
function compile(node, bindings) {
  const js = ts.transpileModule(`const handler = ${node.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return handler;`)(...Object.values(bindings));
}
const parse = callbacks.find((node) => node.getText(source).includes("requireLiveSearchPage"));
assert.ok(parse);
const parser = compile(parse, { requireLiveSearchPage });
assert.deepEqual(await parser(Response.json(page)), page);
await assert.rejects(parser(Response.json({})), /unavailable/);
const detail = { ...message, folder: "inbox", to: ["test@example.invalid"], unread: false, starred: false, detailLoaded: true };
assert.equal(requireLiveSearchDetail({ message: detail }, "synthetic"), detail);
const detailParse = callbacks.find(node => node.getText(source).includes("requireLiveSearchDetail"));
assert.ok(detailParse);
const detailParser = compile(detailParse, { requireLiveSearchDetail, pendingDetailId: "synthetic" });
assert.deepEqual(await detailParser(Response.json({ message: detail })), detail);
for (const change of [{ id: "wrong" }, { detailLoaded: false }, { body: null }, { body: [{}] }, { htmlBody: {} },
  { to: "wrong" }, { unread: "false" }, { starred: null }, { folder: "wrong" }, { receivedAt: "bad" },
  { from: {} }, { subject: [] }, { preview: null }, { blockedExternalImages: "false" }, { sizeBytes: -1 },
  { cc: [null] }, { attachments: [{}] }, { attachments: [{ blobId: "blob", name: "x", type: "text/plain", size: 1, cid: {} }] }]) {
  const payload = { message: { ...detail, ...change } };
  assert.throws(() => requireLiveSearchDetail(payload, "synthetic"), /unavailable/);
  await assert.rejects(detailParser(Response.json(payload)), /unavailable/);
}
const completions = callbacks.filter((node) => ["result", "message", "error"].includes(node.parameters[0]?.name.getText(source)));
assert.equal(completions.length, 4);
for (const callback of completions) {
  compile(callback, { controller: { signal: { aborted: true } } })(new Error("old response"));
}
console.log("Search projection: page/detail formats and exact IDs validated before caching; actual parsers and aborted list/detail callbacks checked.");

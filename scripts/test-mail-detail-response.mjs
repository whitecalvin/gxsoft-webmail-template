import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { requireLiveSearchDetail as requireLiveMailDetail } from "../lib/tastemail/search-page.ts";
import { clientMailFailure } from "../lib/tastemail/client-session-status.ts";

const message = {
  id: "synthetic", from: { name: "Synthetic", email: "test@example.invalid" },
  subject: "Test", preview: "Test", body: [], to: [], receivedAt: "2026-10-04T00:00:00Z",
  folder: "inbox", unread: false, starred: false, detailLoaded: true,
};

// Extract the actual personal/shared response callbacks, not a duplicate model.
for (const path of ["context/mail-context.tsx", "components/mail/LiveSharedMailboxes.tsx"]) {
  const source = ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "then" && ts.isArrowFunction(node.arguments[0]) &&
        node.arguments[0].getText(source).includes("requireLiveMailDetail")) callback = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback, `${path}: detail response must use the shared validator`);
  const js = ts.transpileModule(`const handler = ${callback.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const parse = new Function("requireLiveMailDetail", "pendingDetailId", "clientMailFailure",
    `${js}; return handler;`)(requireLiveMailDetail, message.id, clientMailFailure);
  assert.deepEqual(await parse(Response.json({ message })), message);
  for (const change of [
    { id: "wrong" }, { detailLoaded: false }, { body: null }, { body: [{}] }, { htmlBody: {} },
    { to: "wrong" }, { from: null }, { unread: "false" }, { starred: null },
    { folder: "wrong" }, { receivedAt: "bad" }, { subject: [] }, { preview: null },
    { sizeBytes: -1 }, { cc: [null] }, { attachments: [{}] },
  ]) await assert.rejects(parse(Response.json({ message: { ...message, ...change } })), /unavailable/);
  await assert.rejects(parse(new Response("invalid-json")), /unavailable/);
  for (const [status, error] of [[401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"], [503, "retryable"]]) {
    await assert.rejects(parse(Response.json({ error }, { status })), new RegExp(error));
  }
}
console.log("Personal/shared detail callbacks: malformed responses rejected before cache; HTTP failures preserved.");

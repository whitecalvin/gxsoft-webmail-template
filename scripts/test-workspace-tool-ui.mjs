import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { mailReplyDraft } from "../lib/mail-reply.ts";

const require = createRequire(import.meta.url);
function renderTool(file, exported, values, props = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const states = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useState") states.push(node.name.elements[0].getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let index = 0;
  const actions = [];
  const deps = {
    react: { ...React, useState: initial => { const name = states[index++]; return [Object.hasOwn(values, name) ? values[name] : typeof initial === "function" ? initial() : initial, () => {}]; }, useEffect() {}, useMemo: fn => fn(), useRef: current => ({ current }) },
    "next-intl": { useTranslations: () => (key, args) => args ? `${key}:${Object.values(args).join(",")}` : key, useLocale: () => "en" },
    "@/components/layout/WorkspaceLayout": { WorkspaceLayout: ({ children }) => React.createElement("main", null, children) },
    "@/components/layout/useMobilePane": { useMobilePane() {} },
    "@/components/toast/SystemErrorNotice": { SystemErrorNotice: () => null },
    "@/components/overlay/ConfirmDialog": { ConfirmDialog: ({ title }) => React.createElement("div", { role: "dialog" }, title) },
    "@/context/mail-context": { useMail: () => ({ openCompose: draft => actions.push(draft) }) },
    "@/lib/tastemail/client-session-status": {},
  };
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("exports", "require", code)(exports, name => deps[name] ?? require(name));
  return renderToStaticMarkup(React.createElement(exports[exported], props));
}
const contact = { id: "c1", displayName: "Synthetic contact", email: "contact@example.test" };
for (const selectedId of [null, "c1"]) {
  const html = renderTool("components/contacts/LiveContacts.tsx", "LiveContacts", { selectedId }, { initialContacts: [contact] });
  assert.match(html, new RegExp(`<aside[^>]+class="${selectedId ? "block" : "hidden lg:block"}`));
  if (selectedId) {
    assert.match(html, /hidden lg:block[^\"]*flex-1 overflow-y-auto/);
    assert.match(html, /backToList/);
    assert.match(html, /newMail/);
  }
}
const approval = { id: "a1", title: "Synthetic approval", requesterUsername: "requester", createdAt: "2026-10-07T00:00:00Z", state: "pending", isMyTurn: true, description: "Details", steps: [] };
for (const mobileDetail of [false, true]) {
  const html = renderTool("components/approvals/LiveApprovals.tsx", "LiveApprovals", { status: "ready", items: [approval], selectedId: "a1", mobileDetail });
  assert.match(html, new RegExp(`<article class="${mobileDetail ? " " : "hidden lg:block"}`));
  assert.match(html, /sticky bottom-0/);
  assert.match(html, /backToList/);
  assert.match(html, /tabular-nums/);
}
const email = { folder: "inbox", from: { email: "sender@example.test" }, replyTo: "reply@example.test", to: ["shared@example.test", "other@example.test", "OTHER@example.test"], cc: ["reply@example.test", "cc@example.test"], bcc: ["secret@example.test"], subject: "Subject", messageId: ["parent-id"], references: ["earlier-id"], htmlBody: "<p>body</p>", attachments: [{ blobId: "private" }] };
const reply = mailReplyDraft(email, "shared@example.test", false, "quoted");
assert.equal(reply.fromAddress, "shared@example.test");
assert.equal(reply.to, "reply@example.test");
assert.equal(reply.cc, undefined);
assert.deepEqual(reply.inReplyTo, ["parent-id"]);
assert.deepEqual(reply.references, ["earlier-id", "parent-id"]);
const all = mailReplyDraft(email, "shared@example.test", true, "quoted");
assert.equal(all.cc, "other@example.test, cc@example.test");
for (const draft of [reply, all]) for (const key of ["bcc", "attachments", "htmlBody", "previousDraftId"]) assert.equal(draft[key], undefined);
assert.equal(mailReplyDraft({ ...email, subject: "re: existing" }, "shared@example.test", false, "").subject, "re: existing");
assert.equal(mailReplyDraft({ ...email, folder: "sent", replyTo: undefined, from: { email: "shared@example.test" } }, "shared@example.test", false, "").to, "other@example.test");
const calendar = readFileSync(new URL("../components/calendar/LiveCalendar.tsx", import.meta.url), "utf8");
assert.match(calendar, /\(creating \|\| editingEvent\) && !confirmUpdateEvent \? <Modal/);
assert.match(calendar, /max-h-\[calc\(100dvh-2rem\)\] overflow-y-auto/);
assert.match(calendar, /<Switch on=\{allDay\}/);
assert.doesNotMatch(calendar, /type="checkbox"/);
console.log("Workspace tools: mobile list/detail rendering, approval actions, safe reply recipients/threading and calendar editor passed.");

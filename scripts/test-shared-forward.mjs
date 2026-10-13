import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { forwardedMailContent } from "../lib/mail-draft.ts";

const source = ts.createSourceFile("shared.tsx", readFileSync(new URL("../components/mail/LiveSharedMailboxes.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "forwardSelectedMessage") callback = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(callback, "actual shared forwarding callback must exist");
const executable = ts.transpileModule(callback, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const selected = { id: "synthetic-shared-account", address: "shared@example.test", rights: { mayRead: true, mayWrite: true, maySend: true } };
const message = { id: "synthetic-email", detailLoaded: true, subject: "Synthetic HTML", from: { name: "Sender", email: "sender@example.test" },
  body: ["Synthetic body"], bodyText: "Complete synthetic body", htmlBody: '<p><strong>Synthetic</strong><img src="cid:test@example.test"></p>',
  attachments: [{ blobId: "synthetic-blob", name: "test.png", type: "image/png", size: 100, disposition: "inline", cid: "test@example.test" }] };
function run(overrides = {}) {
  const state = { selected, message, pageStatus: "ready", flagBusy: false, flagUncertain: false, mutationInFlight: { current: false }, composingAccountId: null, ...overrides };
  const calls = [];
  const keys = Object.keys(state);
  const fn = new Function(...keys, "setComposeInitial", "setComposingAccountId", "forwardedMailContent", "reading", "mailList", `${executable}\nforwardSelectedMessage();`);
  fn(...keys.map(key => state[key]), draft => calls.push({ draft }), accountId => calls.push({ accountId }), forwardedMailContent, () => "Original message", () => "No subject");
  return calls;
}
const result = run();
assert.equal(result.length, 2);
assert.equal(result[1].accountId, selected.id);
const draft = result[0].draft;
assert.equal(draft.fromAddress, selected.address);
assert.equal(draft.to, "");
assert.equal(draft.subject, "FWD: Synthetic HTML");
assert.ok(draft.htmlBody.includes(message.htmlBody));
assert.ok(draft.body.includes(message.bodyText));
assert.deepEqual(draft.attachments, message.attachments);
assert.notEqual(draft.attachments[0], message.attachments[0]);
for (const key of ["previousDraftId", "cc", "bcc", "inReplyTo", "references"]) assert.equal(draft[key], undefined);
for (const rightsKey of ["mayRead", "mayWrite", "maySend"]) {
  assert.deepEqual(run({ selected: { ...selected, rights: { ...selected.rights, [rightsKey]: false } } }), []);
}
for (const override of [{ selected: null }, { message: null }, { message: { ...message, detailLoaded: false } },
  { pageStatus: "loading" }, { pageStatus: "forbidden" }, { flagBusy: true }, { flagUncertain: true },
  { mutationInFlight: { current: true } }, { composingAccountId: selected.id }]) assert.deepEqual(run(override), []);
assert.equal(run({ message: { ...message, subject: "FWD: Existing" } })[0].draft.subject, "FWD: Existing");
const plain = run({ message: { ...message, subject: "", htmlBody: null, attachments: undefined } })[0].draft;
assert.equal(plain.subject, "FWD: No subject");
assert.equal(plain.htmlBody, undefined);
assert.deepEqual(plain.attachments, []);
console.log("Shared forwarding account/permission/detail guards and HTML/CID preservation: passed");

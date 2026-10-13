import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../lib/mail-draft.ts", import.meta.url), "utf8");
const exports = {};
new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
const { savedDraftChanged } = exports;
const initial = { previousDraftId: "qa", fromAddress: "self@example.test", to: "one@example.test, two@example.test", cc: "", bcc: "", subject: "QA", body: "v1", htmlBody: "<p>v1</p>", attachments: [{ blobId: "blob", name: "qa.txt", type: "text/plain", size: 1 }] };
assert.equal(savedDraftChanged(initial, structuredClone(initial)), false);
assert.equal(savedDraftChanged(initial, { ...initial, fromAddress: " SELF@EXAMPLE.TEST ", to: "one@example.test,two@example.test", attachments: [{ ...initial.attachments[0], id: "editor-only", ext: "txt", disposition: "attachment", cid: null }] }), false);
for (const patch of [{ subject: "changed" }, { body: "v2" }, { htmlBody: "<b>v1</b>" }, { htmlBody: null }, { to: "" }, { cc: "other@example.test" }, { bcc: "other@example.test" }, { fromAddress: "other@example.test" }, { attachments: [] }, { attachments: [{ ...initial.attachments[0], cid: "new-cid" }] }]) {
  assert.equal(savedDraftChanged(initial, { ...initial, ...patch }), true, JSON.stringify(patch));
}
assert.equal(savedDraftChanged(initial, { ...initial, body: "changed" }), true);
assert.equal(savedDraftChanged(initial, { ...initial, body: "v1" }), false, "reverted edits must not prompt");
const modal = readFileSync(new URL("../components/compose/ComposeModal.tsx", import.meta.url), "utf8");
assert.match(modal, /if \(hasUnsavedChanges \|\| submissionUncertain \|\| uploadFailed\)/);
assert.match(modal, /if \(!bodyTouched\.current\) setBaselineHtml\(next\)/);
console.log("Saved draft changes: unchanged/reverted content, UI-only metadata, addresses, body/HTML/attachments and uncertainty guards passed.");

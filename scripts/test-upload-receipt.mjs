import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { requireUploadReceipt } from "../lib/tastemail/upload-receipt.ts";
import { remainingFailedUploadNames } from "../lib/tastemail/upload-failures.ts";

const file = { name: "synthetic.txt", size: 120, type: "text/plain" };
const valid = { name: file.name, size: file.size, type: file.type, blobId: "u:11111111-1111-4111-8111-111111111111" };
assert.deepEqual(requireUploadReceipt(valid, file), valid);
for (const value of [null, [], {}, { ...valid, blobId: "" }, { ...valid, blobId: "m:invalid" },
  { ...valid, type: " " }, { ...valid, name: "other.txt" }, { ...valid, size: 119 },
  { ...valid, size: 0 }, { ...valid, size: -1 }, { ...valid, size: 120.5 }, { ...valid, size: NaN }]) {
  assert.throws(() => requireUploadReceipt(value, file), /unavailable/);
}

// Execute actual addFiles: an invalid receipt must remain failed, not become an attachment.
const source = ts.createSourceFile("ComposeModal.tsx", readFileSync(new URL("../components/compose/ComposeModal.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "addFiles") handler = node.initializer;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(handler);
const javascript = ts.transpileModule(`const handler = ${handler.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
async function scenario(payload, status = 201, duplicate = false) {
  let attachments = [], failed = [], error = null, uploading = false;
  let requests = 0;
  const bindings = {
    submissionUncertainRef: { current: false }, submissionCompletedRef: { current: false }, canSelectAttachments: true, mode: "live", attachments, uploading: false, uploadingRef: { current: false }, submittingRef: { current: false }, maxAttachmentBytes: 1024,
    MAX_ATTACHMENT_BYTES: 1024, sharedAccountId: "shared-test-account",
    requireUploadReceipt, remainingFailedUploadNames,
    clientMailFailure: (status) => status === 403 ? "forbidden" : "retryable",
    fetch: async () => { requests += 1; return Response.json(payload, { status }); },
    setAttachments: (fn) => { attachments = fn(attachments); },
    setFailedUploadNames: (fn) => { failed = fn(failed); },
    setComposeError: (value) => { error = value; },
    setUploading: (value) => { uploading = value; },
  };
  const run = new Function(...Object.keys(bindings), `${javascript}; return handler;`)(...Object.values(bindings));
  const pending = run([file]);
  if (duplicate) assert.deepEqual(await run([file]), []);
  await pending;
  return { attachments, failed, error, uploading, requests };
}
const accepted = await scenario(valid);
assert.equal(accepted.attachments.length, 1);
assert.deepEqual(accepted.failed, []);
assert.equal(accepted.uploading, false);
const duplicate = await scenario(valid, 201, true);
assert.equal(duplicate.requests, 1);
assert.equal(duplicate.attachments.length, 1);
for (const [payload, status, expectedError] of [[{ ...valid, size: 119 }, 201, "unavailable"], [{}, 201, "unavailable"], [{}, 403, "forbidden"], [{}, 503, "retryable"]]) {
  const result = await scenario(payload, status);
  assert.equal(result.attachments.length, 0);
  assert.deepEqual(result.failed, [file.name]);
  assert.equal(result.error, expectedError);
  assert.equal(result.uploading, false);
}
console.log("Upload receipt: exact file size/name validated; actual composer blocks malformed and failed uploads.");

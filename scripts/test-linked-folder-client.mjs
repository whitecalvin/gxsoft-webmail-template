import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url), read = p => readFileSync(p, "utf8");
function load(path, deps = {}) {
  const exports = {}, js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", js)(exports, name => name in deps ? deps[name] : require(name)); return exports;
}
const accounts = load("lib/linked-accounts.ts"), mail = load("lib/linked-mail.ts", { "./linked-accounts": accounts });
const folders = load("lib/linked-folders.ts", { "./linked-accounts": accounts, "./linked-mail": mail });
const auth = load("lib/linked-authentication.ts", { "./linked-accounts": accounts });
const id = "11111111-1111-4111-8111-111111111111";
const before = { id, email: "synthetic@naver.com", provider: "naver", status: "connected", revision: 3, credentialGeneration: 2, capabilities: { read: true, sync: true, send: false, mutate: false } };
const data = { accounts: [before], limit: 10, authenticationAvailable: { naver: true, gmail: true, tastemail: false } };
const receipt = folders.requireLinkedFolders({ encoding: "imapModifiedUtf7", folders: ["INBOX", "&ZeVnLIqe-", "A&-B"] }, before);
assert.deepEqual(folders.linkedFoldersReceipt({ ...receipt, secret: "not projected" }, before), receipt);
for (const patch of [{ linkedAccountId: "22222222-2222-4222-8222-222222222222" }, { revision: 4 }, { credentialGeneration: 3 }, { encoding: "utf8" }, { folders: [receipt.folders[0], receipt.folders[0]] }, { folders: [{ value: "INBOX", label: "other" }] }, { folders: [{ value: "日本語", label: "日本語" }] }, { folders: Array(101).fill(receipt.folders[0]) }]) {
  assert.throws(() => folders.linkedFoldersReceipt({ ...receipt, ...patch }, before));
}
// LIST now delegates to the durable engine; serialization/journal/fencing are covered
// by test-linked-operation-provider.mjs instead of asserting the removed /folders POST.
const source = ts.createSourceFile("provider.tsx", read("context/linked-accounts-context.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let fn;
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === "loadFolders") fn = node; ts.forEachChild(node, visit); }
visit(source); assert.ok(fn);
const js = ts.transpileModule(fn.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const calls = [];
let operation = { ...receipt, phase: "confirmed" };
const loadFolders = new Function("performOperation", `${js};return loadFolders;`)(async (target, action) => { calls.push({ target, action }); return operation; });
assert.deepEqual(await loadFolders(id), receipt);
assert.deepEqual(calls, [{ target: id, action: { kind: "list" } }]);
for (const phase of ["pending", "unknown", "partial", "failed"]) {
  operation = { ...receipt, phase }; assert.equal(await loadFolders(id), null);
}
operation = null; assert.equal(await loadFolders(id), null);
assert.doesNotMatch(fn.getText(source), /fetch\(|\/folders|linkedFoldersBefore|linkedFoldersReceipt/);
assert.equal(auth.linkedAuthResolved(data, { kind: "folders", before }), false);
assert.equal(auth.linkedAuthResolved({ ...data, accounts: [{ ...before, status: "temporaryError" }] }, { kind: "folders", before }), false);
console.log("Linked folder client: strict folder projection, durable LIST delegation and non-confirmed result suppression passed; engine locking/fencing is covered separately (synthetic only).");

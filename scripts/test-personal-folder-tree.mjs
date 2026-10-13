import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(path) {
  const exports = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", js)(exports);
  return exports;
}
const { personalFolderTree, childFolderName } = load("../lib/personal-folder-tree.ts");
const { personalFolderInput } = load("../lib/tastemail/personal-folder-contract.ts");
const box = (id, name, role = null) => ({ id, name, role, totalEmails: 0, unreadEmails: 0, usedBytes: 0, quotaBytes: 0 });
const tree = personalFolderTree([
  box("child", "Work/Project/Reports"), box("parent", "Work"),
  box("middle", "Work/Project"), box("other", "Private"),
  box("special", "Inbox", "inbox"), box("legacy", "INBOX"),
]);
assert.equal(tree.length, 2);
assert.equal(tree[0].mailbox.id, "parent");
assert.equal(tree[0].children[0].mailbox.id, "middle");
assert.equal(tree[0].children[0].children[0].label, "Reports");
assert.equal(tree[0].children[0].children[0].mailbox.id, "child");
const missing = personalFolderTree([box("leaf", "Missing/Leaf")]);
assert.equal(missing[0].mailbox, null);
assert.equal(missing[0].children[0].mailbox.id, "leaf");
assert.equal(childFolderName("Work/Project", " Reports "), "Work/Project/Reports");
assert.equal(childFolderName("", "News"), "News");
assert.equal(childFolderName("Work", "Nested/Leaf"), null);
assert.equal(childFolderName("Work", " "), null);
assert.deepEqual(personalFolderInput({ operation: "create", name: childFolderName("Work", "Reports") }), { operation: "create", name: "Work/Reports" });
assert.equal(personalFolderInput({ operation: "create", name: childFolderName("Work", "a".repeat(256)) }), null);
assert.equal(personalFolderInput({ operation: "create", name: childFolderName("Work", "Bad\nName") }), null);
console.log("folder tree: nested paths, missing ancestors, built-ins, parent selection and server input bounds passed");

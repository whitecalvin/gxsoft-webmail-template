import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const helper = readFileSync(new URL("../lib/mail-selection.ts", import.meta.url), "utf8");
const exports = {};
new Function("exports", ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
const select = exports.selectMailRows;
const ids = ["a", "b", "c", "d"];
assert.deepEqual(select([], "b", null, false, ids), ["b"]);
assert.deepEqual(select(["b"], "b", "b", false, ids), []);
assert.deepEqual(select(["a"], "d", "b", true, ids), ids);
assert.deepEqual(select([], "a", "c", true, ids), ["a", "b", "c"]);
assert.deepEqual(select([], "b", "missing", true, ids), ["b"]);
assert.deepEqual(select(["a"], "foreign-page", "a", true, ids), ["a"]);

// Execute the actual bulk dispatcher with confirmed-operation spies, not server writes.
const source = readFileSync(new URL("../components/mail/MailList.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("list.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let runBulk;
const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "runBulk") runBulk = node.initializer; ts.forEachChild(node, visit); };
visit(tree); assert.ok(runBulk);
// Both selection controls use custom icons with the star button's visual treatment.
const checkboxNodes = [];
function inspectCheckbox(node) {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === "button" && node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === "role" && attribute.initializer?.getText(tree) === '"checkbox"')) checkboxNodes.push(node);
  ts.forEachChild(node, inspectCheckbox);
}
inspectCheckbox(tree);
assert.equal(checkboxNodes.length, 2);
for (const node of checkboxNodes) {
  const attributes = node.attributes.getText(tree);
  assert.match(attributes, /aria-checked/);
  assert.match(attributes, /rounded-\(--radius-app\)/);
  assert.match(attributes, /hover:text-\(--color-accent\)/);
  assert.match(attributes, /focus-visible:outline-offset-2/);
  assert.match(attributes, /w-6/);
  assert.doesNotMatch(attributes, /lg:size-9/);
  assert.match(attributes, /pointer:coarse\)\]:w-8/);
  assert.doesNotMatch(attributes, /pointer:coarse\)\]:size-11/);
  assert.doesNotMatch(attributes, /hover:bg-/);
}
const js = ts.transpileModule(`const action = ${runBulk.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function run(action, destination, { blocked = false, folder = "inbox" } = {}) {
  const calls = [];
  const rows = [{ id: "a", starred: false }, { id: "b", starred: true }];
  const names = ["bulkBlocked", "selectedRows", "activeFolder", "selectionView", "checkedIds", "setBulkDelete", "setRead", "toggleStar", "moveToTrash", "moveToCustomMailbox", "moveToFolder", "clearChecked"];
  const spy = name => (...args) => calls.push([name, ...args]);
  const fn = new Function(...names, `${js}; return action;`)(blocked, rows, folder, "view", ["a", "b"], spy("confirm"), spy("read"), spy("star"), spy("trash"), spy("custom"), spy("move"), spy("clear"));
  fn(action, destination); return calls;
}
assert.deepEqual(run("unread"), [["read", "a", false], ["read", "b", false], ["clear"]]);
assert.deepEqual(run("star"), [["star", "a"], ["clear"]]);
assert.deepEqual(run("move", { mailboxId: "nested" }), [["custom", "a", "nested"], ["custom", "b", "nested"], ["clear"]]);
assert.deepEqual(run("move", "archive"), [["move", "a", "archive"], ["move", "b", "archive"], ["clear"]]);
assert.deepEqual(run("delete"), [["trash", "a"], ["trash", "b"], ["clear"]]);
assert.deepEqual(run("delete", undefined, { folder: "trash" }), [["confirm", { view: "view", ids: ["a", "b"] }]]);
assert.deepEqual(run("delete", undefined, { blocked: true }), []);
console.log("mail selection: toggle, ranges, page boundary, bulk flags/moves, uncertainty guard and permanent-delete confirmation passed");

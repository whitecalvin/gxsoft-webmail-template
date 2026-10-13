import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../context/settings-context.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("settings.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "trustImageSender") callback = node.initializer.arguments[0];
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(callback);
const compiled = ts.transpileModule(`const action = ${callback.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let saved = { inbox: { remoteImages: "never", remoteImageSenders: [] }, unrelated: "saved" };
let draft = structuredClone(saved), succeed = true, writes = 0;
const controller = {
  edit: update => { draft = update(draft); },
  save: async () => { writes++; if (!succeed) return false; saved = structuredClone(draft); return true; },
};
const clean = () => JSON.stringify(saved) === JSON.stringify(draft);
const action = new Function("controller", "accountAddress", "cleanForImmediateSave", `${compiled}; return action;`)(controller, "test@example.test", clean);
assert.equal(await action(" TEST@example.test ", " Sender@example.test "), true);
assert.deepEqual(saved.inbox.remoteImageSenders, ["sender@example.test"]);
assert.equal(saved.inbox.remoteImages, "never");
assert.equal(await action("test@example.test", "sender@example.test"), true);
assert.equal(saved.inbox.remoteImageSenders.length, 1);
const beforeForeign = writes;
assert.equal(await action("other@example.test", "sender@example.test"), false);
assert.equal(writes, beforeForeign, "another account cannot be mutated");
assert.equal(await action("test@example.test", "sender@example.test", false), true);
assert.deepEqual(saved.inbox.remoteImageSenders, []);
draft.unrelated = "unsaved draft";
assert.equal(await action("test@example.test", "sender@example.test"), false);
assert.equal(draft.unrelated, "unsaved draft");
draft = structuredClone(saved); succeed = false;
assert.equal(await action("test@example.test", "sender@example.test"), false);
assert.deepEqual(saved.inbox.remoteImageSenders, [], "failed save must not grant trusted-sender status");
assert.deepEqual(draft.inbox.remoteImageSenders, ["sender@example.test"], "draft survives failure");
assert.equal(await action("", "sender@example.test"), false);
console.log("image sender settings: server-confirmed save, account isolation, revoke, deduplication and unsaved draft preservation passed");

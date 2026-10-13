import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the real component handler, not a duplicate model of its guards.
const source = ts.createSourceFile("ComposeEditor.tsx", readFileSync(new URL("../components/compose/ComposeEditor.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "handleImageFile") handler = node.initializer;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(handler);
const javascript = ts.transpileModule(`const handler = ${handler.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

async function scenario({ replaceDuringUpload = false, replaceDuringRead = false, disconnected = false, live = true, failed = false } = {}) {
  const original = { isConnected: !disconnected };
  const richRef = { current: original };
  const readers = [];
  const inserted = [];
  class Reader {
    result = "data:image/png;base64,synthetic";
    readAsDataURL() { readers.push(this); }
  }
  const upload = async () => {
    if (replaceDuringUpload) { original.isConnected = false; richRef.current = { isConnected: true }; }
    return failed ? null : "synthetic@gxwebmail";
  };
  const document = { createElement: () => ({ dataset: {}, style: {}, outerHTML: "synthetic image" }) };
  const run = new Function("mode", "onInlineImageUpload", "richRef", "FileReader", "document", "richExec", "allowInlineImages", `${javascript}; return handler;`)("rich", live ? upload : undefined, richRef, Reader, document, (...args) => inserted.push(args), true);
  await run({ target: { files: [{ name: "synthetic.png" }], value: "chosen" } });
  if (replaceDuringRead) { original.isConnected = false; richRef.current = { isConnected: true }; }
  for (const reader of readers) reader.onload();
  return inserted.length;
}
assert.equal(await scenario(), 1);
assert.equal(await scenario({ replaceDuringUpload: true }), 0);
assert.equal(await scenario({ replaceDuringRead: true }), 0);
assert.equal(await scenario({ disconnected: true }), 0);
assert.equal(await scenario({ failed: true }), 0);
assert.equal(await scenario({ live: false }), 1);
assert.equal(await scenario({ live: false, replaceDuringRead: true }), 0);
console.log("Real composer image handler: stale upload/read results ignored; live/mock insertion preserved.");

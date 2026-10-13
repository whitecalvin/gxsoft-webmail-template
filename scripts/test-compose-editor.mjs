import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { composeLinkUrl } from "../lib/compose-link.ts";

test("composer links only allow absolute web/mail URLs without credentials", () => {
  assert.equal(composeLinkUrl(" https://example.test/한글?q=a&b=2 "), "https://example.test/%ED%95%9C%EA%B8%80?q=a&b=2");
  assert.equal(composeLinkUrl("mailto:hello@example.test"), "mailto:hello@example.test");
  assert.equal(composeLinkUrl("http://example.test"), "http://example.test/");
  for (const input of ["", "javascript:alert(1)", "data:text/html,test", "//example.test", "/relative", "https://u:p@example.test", "https://example.test/\npath", "mailto:"]) {
    assert.equal(composeLinkUrl(input), null, input);
  }
});

// 실제 컴포넌트 실행 함수로 툴바가 본문 바깥의 선택을 변경하지 않는지 확인한다.
const source = ts.createSourceFile("ComposeEditor.tsx", readFileSync(new URL("../components/compose/ComposeEditor.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
let pasteHandler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "richExec") handler = node.initializer;
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "handlePaste") pasteHandler = node.initializer;
  ts.forEachChild(node, visit);
}

test("rich paste sanitizes HTML without importing images and falls back to plain text", () => {
  assert.ok(pasteHandler);
  const js = ts.transpileModule(`const handler = ${pasteHandler.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  for (const [html, sanitized, expected] of [["<b>test</b>", "<b>test</b>", ["insertHTML", "<b>test</b>"]], ["<script>test</script>", "", ["insertText", "fallback"]], ["", "", ["insertText", "fallback"]]]) {
    const calls = [];
    const sanitizeCalls = [];
    let prevented = false;
    const run = new Function("editableDraftHtml", "richExec", `${js}; return handler;`)((...args) => { sanitizeCalls.push(args); return sanitized; }, (...args) => calls.push(args));
    run({ preventDefault: () => { prevented = true; }, clipboardData: { getData: (type) => type === "text/html" ? html : "fallback" } });
    assert.equal(prevented, true);
    assert.deepEqual(calls, [expected]);
    assert.deepEqual(sanitizeCalls, html ? [[html, false]] : []);
  }
});
visit(source);
assert.ok(handler);
const js = ts.transpileModule(`const handler = ${handler.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
test("disabled rich editor ignores formatting commands", () => {
  const run = new Function(`const disabled = true; ${js}; return handler;`)();
  assert.doesNotThrow(() => run("bold"));
});
for (const inside of [true, false]) {
  test(`rich command restores only editor-owned selection (${inside}) and synchronizes both bodies`, () => {
    const calls = [];
    const range = { startContainer: "start", endContainer: "end", commonAncestorContainer: "root", cloneRange() { return this; } };
    const selection = { rangeCount: 1, getRangeAt: () => range, removeAllRanges: () => calls.push("clear"), addRange: () => calls.push("restore") };
    const editor = { focus: () => calls.push("focus"), contains: () => inside, innerText: "test" };
    const document = { execCommand: (...args) => calls.push(args), queryCommandState: (cmd) => cmd === "underline" };
    const run = new Function("richRef", "savedRange", "window", "document", "onChange", "onHtmlChange", "serializedRichHtml", "setActiveFormats", `const disabled = false; ${js}; return handler;`)(
      { current: editor }, { current: range }, { getSelection: () => selection }, document,
      (text) => calls.push(text), (html) => calls.push(html), () => "<u>test</u>", (formats) => calls.push(formats),
    );
    run("underline");
    assert.equal(calls.includes("restore"), inside);
    assert.ok(calls.includes("test"));
    assert.ok(calls.includes("<u>test</u>"));
    assert.ok(calls.some((call) => Array.isArray(call) && call[0] === "underline"));
  });
}

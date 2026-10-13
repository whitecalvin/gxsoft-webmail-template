import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const source = ts.createSourceFile("body.tsx", readFileSync(new URL("../components/mail/LiveHtmlMessageBody.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "htmlDocument");
assert.ok(fn);
const scope = {};
vm.runInNewContext(ts.transpileModule(fn.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, scope);
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=";
for (const external of [false, true]) {
  const html = scope.htmlDocument(`<img src="${png}" alt="Synthetic logo">`, new Map(), external);
  assert.ok(html.includes(`src="${png}"`));
  assert.ok(html.includes(external ? "img-src data: https:" : "img-src data:;"));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes("frame-src 'none'"));
  assert.ok(!html.includes("script-src 'unsafe-inline'"));
}
console.log("Embedded PNG remains in the actual mail document with remote images blocked; iframe CSP remains restricted.");

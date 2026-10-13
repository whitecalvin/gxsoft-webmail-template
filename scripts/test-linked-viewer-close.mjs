import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
function load(path, deps) {
  const exports = {}, code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("exports", "require", code)(exports, name => name in deps ? deps[name] : require(name)); return exports;
}
const utils = load("components/ui/utils.ts", {});
const Button = load("components/ui/Button.tsx", { "./utils": utils }).Button;
const Tooltip = load("components/ui/Tooltip.tsx", { "./utils": utils, "@/lib/tooltip-position.mjs": { tooltipPosition() {} } }).Tooltip;
test("actual linked viewer close uses the header flex child's auto margin and preserves ten-locale accessible names/callback", () => {
  const source = ts.createSourceFile("viewer.tsx", readFileSync("components/settings/LinkedMailViewer.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let node; function visit(n) { if (ts.isJsxElement(n) && n.openingElement.tagName.getText(source) === "Tooltip" && n.openingElement.getText(source).includes('common("close")')) node = n; ts.forEachChild(n, visit); } visit(source); assert.ok(node);
  const code = ts.transpileModule(`const element=(${node.getText(source)});`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const locale of ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
    const close = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).common.close;
    let clicks = 0; const onClose = () => { clicks++; };
    const element = new Function("require", "exports", "Tooltip", "Button", "X", "common", "onClose", `${code};return element;`)(require, {}, Tooltip, Button, () => null, () => close, onClose);
    assert.equal(element.props.className, "ml-auto shrink-0"); assert.equal(element.props.content, close);
    assert.equal(element.props.children.props["aria-label"], close); assert.equal(element.props.children.props.onClick, onClose);
    element.props.children.props.onClick(); assert.equal(clicks, 1);
    const html = renderToStaticMarkup(element);
    assert.ok(html.startsWith('<span class="inline-flex ml-auto shrink-0">')); assert.ok(html.includes(`aria-label="${close}"`)); assert.equal(html.includes("title="), false);
  }
});

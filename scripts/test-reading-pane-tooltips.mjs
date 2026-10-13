import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.createSourceFile("ReadingPane.tsx", readFileSync(new URL("../components/mail/ReadingPane.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let buttons = 0;
let dropdowns = 0;
const attribute = (opening, name) => opening.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(source) === name);
function visit(node, inHeader = false, tooltip = null) {
  if (ts.isJsxElement(node)) {
    const tag = node.openingElement.tagName.getText(source);
    if (tag === "header") inHeader = true;
    if (tag === "Tooltip") tooltip = node.openingElement;
    if (inHeader && tag === "button") {
      buttons++;
      assert.ok(tooltip, "each reading header icon must use shared Tooltip");
      assert.equal(attribute(tooltip, "content").initializer.getText(source), attribute(node.openingElement, "aria-label").initializer.getText(source));
      assert.equal(attribute(tooltip, "side").initializer.text, "bottom");
      assert.equal(attribute(node.openingElement, "title"), undefined);
    }
  }
  if (inHeader && ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "Dropdown") {
    dropdowns++;
    assert.ok(tooltip);
    assert.equal(attribute(tooltip, "content").initializer.getText(source), attribute(node, "label").initializer.getText(source));
    assert.match(attribute(tooltip, "className").initializer.text, /ml-auto hidden.*lg:inline-flex/);
  }
  ts.forEachChild(node, child => visit(child, inHeader, tooltip));
}
visit(source);
assert.equal(buttons, 9, "loading back, back, draft, reply pair, forward, read, star, delete");
assert.equal(dropdowns, 1);
console.log("Reading header: nine icon paths and move trigger have matching translated custom tooltips.");

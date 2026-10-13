import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Exercise the real resize callback with synthetic layout measurements only.
const source = readFileSync(new URL("../components/mail/LiveHtmlMessageBody.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("LiveHtmlMessageBody.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let resize;
let layoutHelper;
let measurementStart;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "setMailBodyLayout") layoutHelper = node.getText(file);
  if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "measuredFrameWidth") measurementStart = node.getStart(file);
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "resize" && declaration.initializer && ts.isArrowFunction(declaration.initializer)) resize = node;
    }
  }
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(resize && measurementStart !== undefined, "mail resize callback must exist");
const callback = ts.transpileModule(`${layoutHelper ?? ""}\n${source.slice(measurementStart, resize.end)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const frame = { clientWidth: 720 };
const style = {
  widthPriority: "",
  setProperty(name, value, priority) { this[name] = value; if (name === "width") this.widthPriority = priority; },
  removeProperty(name) { delete this[name]; if (name === "width") this.widthPriority = ""; },
};
const body = { style, scrollHeight: 1200, get scrollWidth() { return Math.max(640, frame.clientWidth); } };
const frameDocument = { documentElement: { scrollHeight: 1200, style: {} } };
body.ownerDocument = frameDocument;
let height = 512;
const runResize = new Function("frame", "body", "frameDocument", "setFrameHeight", `${callback}\nreturn resize;`)(
  frame, body, frameDocument, (update) => { height = update(height); },
);
for (const [width, overflow, expectedHeight] of [[720, false, 1200], [640, false, 1200], [360, true, 1220], [390, true, 1220], [720, false, 1200]]) {
  frame.clientWidth = width;
  runResize();
  assert.equal(body.style.transform, "", `text must not shrink at ${width}px`);
  assert.equal(style.widthPriority, overflow ? "important" : "", "measured width overrides email CSS and resets on expansion");
  if (overflow) assert.equal(style.width, "640px", "overflow retains the full source width");
  assert.equal(frameDocument.documentElement.style.overflowX, overflow ? "auto" : "hidden");
  assert.equal(height, expectedHeight, `height at ${width}px`);
}
frame.clientWidth = 0;
runResize();
assert.equal(height, 1200, "hidden frame preserves its last measurement");
console.log("mail frame resize: fixed-width content keeps readable text and horizontal scrolling after viewport changes");

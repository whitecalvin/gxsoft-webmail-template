import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../components/ui/Dropdown.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("Dropdown.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let position;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "positionMenu") position = node.initializer;
  ts.forEachChild(node, visit);
}
visit(tree); assert.ok(position);
const js = ts.transpileModule(`const position = ${position.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
for (const overlay of [false, true]) {
  for (const iconOnly of [false, true]) {
  for (const [natural, trigger, minimum, viewport, naturalExpected] of [[150, 94, 0, 1280, 150], [90, 140, 0, 1280, 140], [90, 40, 200, 390, 200], [900, 40, 180, 390, 374], [300, 264.5, 200, 1280, 300], [900, 600, 200, 390, 374]]) {
    const expected = iconOnly ? naturalExpected : Math.min(trigger, viewport - 16);
    const menu = { style: {}, getBoundingClientRect: () => ({ width: natural }), offsetHeight: 120, clientHeight: 118, scrollHeight: 118 };
    const rect = { width: trigger, left: viewport - trigger - 10, right: viewport - 10, top: 100, bottom: 144 };
    const run = new Function("triggerRef", "menuRef", "rootRef", "window", "menuMinWidth", "align", "overlay", "iconOnly", "contentWidth", `${js}; return position;`)(
      { current: { getBoundingClientRect: () => rect } }, { current: menu }, { current: { getBoundingClientRect: () => rect } }, { innerWidth: viewport, innerHeight: 844 }, minimum, "left", overlay, iconOnly, iconOnly);
    run(); assert.equal(menu.style.width, `${expected}px`);
    assert.equal(menu.style.maxWidth, `${viewport - 16}px`);
    const left = parseFloat(menu.style.left) + (overlay ? 0 : rect.left);
    assert.ok(left >= 8 && left + expected <= viewport - 8, "Keep expanded menus in the viewport");
  }
  }
}
assert.match(source, /min-w-0 flex-1 truncate/);
assert.doesNotMatch(source, /whitespace-normal break-words/);
assert.match(source, /<Tooltip content=\{option.label\}/);
assert.match(source, /value !== option.value && "invisible"/);
assert.doesNotMatch(source, /className="truncate">\{option.label\}/);
console.log("Dropdown width: default selects match trigger width, icon actions use intrinsic width, viewport clamp and single-line/check slots passed");

for (const file of ["GeneralMailSettingsViews", "LiveThemeSettings", "LiveSignatureSettings", "LiveMailRules"]) {
  const settings = ts.createSourceFile(file, readFileSync(new URL(`../components/settings/${file}.tsx`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function inspect(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ["Dropdown", "CustomSelect"].includes(node.tagName.getText(settings))) {
      assert.match(node.attributes.getText(settings), /align="right"/, `${file}: every settings dropdown anchors to the right`);
    }
    ts.forEachChild(node, inspect);
  }
  inspect(settings);
}
for (const overlay of [false, true]) {
  const rect = { width: 94, left: 500, right: 594, top: 100, bottom: 144 };
  const menu = { style: {}, getBoundingClientRect: () => ({ width: 150 }), offsetHeight: 120, clientHeight: 118, scrollHeight: 118 };
  new Function("triggerRef", "menuRef", "rootRef", "window", "menuMinWidth", "align", "overlay", "iconOnly", "contentWidth", `${js}; return position;`)(
    { current: { getBoundingClientRect: () => rect } }, { current: menu }, { current: { getBoundingClientRect: () => rect } }, { innerWidth: 1280, innerHeight: 844 }, 0, "right", overlay, false, false)();
  assert.equal(parseFloat(menu.style.left) + (overlay ? 0 : rect.left) + parseFloat(menu.style.width), rect.right);
}
console.log("Settings dropdowns: right alignment coverage and inline/overlay right-edge geometry passed");
assert.match(source, /const SETTINGS_POLICY = \{ align: "right", contentWidth: true \}/);
assert.match(readFileSync(new URL("../app/[locale]/(workspace)/settings/layout.tsx", import.meta.url), "utf8"), /<SettingsDropdownPolicy>\{children\}<\/SettingsDropdownPolicy>/);
for (const overlay of [false, true]) {
  for (const [natural, trigger, viewport] of [[150, 94, 1280], [72, 264, 1280], [900, 94, 390]]) {
    const rect = { width: trigger, left: viewport - trigger - 10, right: viewport - 10, top: 100, bottom: 144 };
    const menu = { style: {}, getBoundingClientRect: () => ({ width: natural }), offsetHeight: 120, clientHeight: 118, scrollHeight: 118 };
    new Function("triggerRef", "menuRef", "rootRef", "window", "menuMinWidth", "align", "overlay", "iconOnly", "contentWidth", `${js}; return position;`)(
      { current: { getBoundingClientRect: () => rect } }, { current: menu }, { current: { getBoundingClientRect: () => rect } }, { innerWidth: viewport, innerHeight: 844 }, 0, "right", overlay, false, true)();
    const width = Math.min(natural, viewport - 16);
    assert.equal(menu.style.width, `${width}px`, "Settings menu uses content width, never trigger width");
    const left = parseFloat(menu.style.left) + (overlay ? 0 : rect.left);
    assert.equal(left, Math.max(8, rect.right - width), "Right anchoring yields to the viewport safety margin only");
    assert.ok(left + width <= viewport - 8);
  }
}
console.log("Settings policy: intrinsic width for shorter/longer labels, right anchoring, portal/inline and mobile clamp passed");

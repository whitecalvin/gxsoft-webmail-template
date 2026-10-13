import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import ts from "typescript";
import { tooltipPosition } from "../lib/tooltip-position.mjs";

const viewport = { left: 0, top: 0, width: 390, height: 844 };
const tooltip = { width: 200, height: 30 };
const anchor = { left: 260, right: 292, top: 100, bottom: 132, width: 32 };
assert.deepEqual(tooltipPosition(anchor, tooltip, viewport, "bottom"), { left: 176, top: 140 });
assert.equal(tooltipPosition({ ...anchor, left: 358, width: 32 }, tooltip, viewport, "top").left, 182);
assert.equal(tooltipPosition({ ...anchor, left: 0 }, tooltip, viewport, "top").left, 8);
assert.equal(tooltipPosition({ ...anchor, top: 8, bottom: 40 }, tooltip, viewport, "top").top, 48);
assert.equal(tooltipPosition({ ...anchor, top: 790, bottom: 822 }, tooltip, viewport, "bottom").top, 752);
const offset = { left: 20, top: 50, width: 320, height: 400 };
assert.deepEqual(tooltipPosition({ ...anchor, top: 52, bottom: 84 }, tooltip, offset, "top"), { left: 132, top: 92 });
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/ui/Tooltip.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function render(open) {
  const updates = [];
  let stateIndex = 0;
  const exports = {};
  const modules = {
    react: { ...React, useId: () => "tooltip-test", useRef: () => ({ current: false }), useEffect: () => {},
      useState: () => [stateIndex++ === 0 ? open : { left: 8, top: 50 }, value => updates.push(value)] },
    "react-dom": { createPortal: (node, target) => ({ node, target }) },
    "@/lib/tooltip-position.mjs": { tooltipPosition },
    "./utils": { cn: (...values) => values.filter(Boolean).join(" ") },
  };
  new Function("require", "exports", "document", compiled)(name => modules[name] ?? require(name), exports, { body: "body" });
  return { tree: exports.Tooltip({ content: "편지함 관리: aaaa", children: React.createElement("button", null, "Menu") }), updates };
}
const closed = render(false);
assert.equal(closed.tree.props.children[1], null, "SSR does not access body or show an idle tooltip");
closed.tree.props.onFocus();
assert.deepEqual(closed.updates, [null, true], "keyboard focus opens the tooltip");
const opened = render(true);
const portal = opened.tree.props.children[1];
assert.equal(portal.target, "body", "tooltip escapes ancestor overflow clipping");
assert.equal(portal.node.props.role, "tooltip");
assert.match(portal.node.props.className, /fixed/);
assert.match(portal.node.props.className, /whitespace-normal/);
opened.tree.props.onFocus();
assert.deepEqual(opened.updates, [], "focus while already hovered must not hide the measured tooltip");
opened.tree.props.onClick();
assert.deepEqual(opened.updates, [false], "click dismisses the tooltip before opening a menu");
console.log("Tooltip: positioning, body portal, SSR, focus, and click tests passed.");

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const exports = {};
const modules = {
  react: React, "react/jsx-runtime": jsx,
  "react-dom": { createPortal: () => { throw Error("Closed tooltip must not create a portal"); } },
  "@/lib/tooltip-position.mjs": { tooltipPosition: () => { throw Error("SSR must not position a tooltip"); } },
  "./utils": { cn: (...values) => values.filter(Boolean).join(" ") },
};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../components/ui/Tooltip.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports, require: name => { assert.ok(name in modules, name); return modules[name]; } });

test("shared tooltip preserves default and responsive visibility without conflicting base display", () => {
  for (const [className, expected] of [
    [undefined, "inline-flex"], ["shrink-0", "inline-flex shrink-0"],
    ["lg:hidden", "inline-flex lg:hidden"], ["hidden", "hidden"],
    ["ml-auto hidden shrink-0 lg:inline-flex", "ml-auto hidden shrink-0 lg:inline-flex"],
  ]) {
    const html = renderToStaticMarkup(React.createElement(exports.Tooltip, { content: "Move", className },
      React.createElement("button", { "aria-label": "Move", disabled: true }, "Move")));
    assert.ok(html.startsWith(`<span class="${expected}">`), html);
    assert.ok(html.includes('aria-label="Move" disabled=""'));
    assert.ok(!html.includes('role="tooltip"'));
  }
});

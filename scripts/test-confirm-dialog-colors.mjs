import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    assert.ok(["react", "react/jsx-runtime", "lucide-react"].includes(name), `Unexpected dependency ${name}`);
    return require(name);
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const utils = load("../components/ui/utils.ts", {});
const button = load("../components/ui/Button.tsx", { "./utils": utils });
const { ConfirmDialog } = load("../components/overlay/ConfirmDialog.tsx", {
  "next-intl": { useTranslations: () => key => key },
  "./Modal": { Modal: ({ children }) => React.createElement("section", null, children) },
  "./DialogActions": { DialogActions: ({ children }) => React.createElement("div", null, children) },
  "@/components/ui/Button": button,
  "@/components/ui/Input": { Input: ({ ...props }) => React.createElement("input", props) },
});
for (const tone of ["default", "warning", "alert", "destructive"]) {
  for (const state of [{}, { confirmDisabled: true }, { requireTypedText: "test-only" }]) {
    const html = renderToStaticMarkup(React.createElement(ConfirmDialog, {
      tone, title: "Synthetic confirmation", confirmLabel: "confirm-action", onConfirm() {}, onCancel() {}, ...state,
    }));
    const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    const confirm = buttons.find(match => match[2] === "confirm-action");
    assert.ok(confirm);
    const classes = confirm[1].match(/class="([^"]+)"/)?.[1].split(" ") ?? [];
    assert.ok(classes.includes(tone === "destructive" ? "bg-(--status-danger)" : "bg-(--color-primary-solid)"));
    assert.ok(classes.includes("text-white"));
    assert.ok(!classes.includes("bg-background"), "Never combine solid confirm fill with secondary background");
    assert.ok(!classes.includes("text-foreground"), "Never combine secondary and solid text colors");
    assert.doesNotMatch(confirm[1], /style=/, "Use the common Button variant without a separate inline color");
    assert.equal(/disabled=""/.test(confirm[1]), !!state.confirmDisabled || !!state.requireTypedText);
    assert.ok(classes.includes("hover:brightness-105"));
    if (tone !== "alert") {
      const cancel = buttons.find(match => match[2] === "cancel");
      assert.ok(cancel); assert.match(cancel[1], /bg-background/); assert.doesNotMatch(cancel[1], /disabled=""/);
    }
  }
}
console.log("Common confirmation colors passed: four tones, enabled/disabled/typed states, solid fill/text, hover and secondary cancel. Synthetic SSR only.");

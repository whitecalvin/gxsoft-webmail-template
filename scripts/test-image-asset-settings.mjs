import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
function load(file, deps) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(id => { if (id in deps) return deps[id]; assert.equal(id, "react/jsx-runtime"); return require(id); }, mod, mod.exports);
  return mod.exports;
}
const helper = load("../lib/image-assets.ts", {});
let states = [], refs = [], stateIndex = 0, refIndex = 0, effects = [], refreshes = 0;
const hooks = { useState: initial => { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; }, useRef: initial => { const i = refIndex++; return refs[i] ??= { current: initial }; }, useEffect: effect => effects.push(effect) };
const Button = () => null, ImageFilePicker = () => null, ConfirmDialog = () => null;
const ui = load("../components/settings/ImageAssetSettings.tsx", { react: hooks, "next-intl": { useTranslations: () => key => key }, "@/i18n/navigation": { useRouter: () => ({ refresh() { refreshes++; } }) }, "@/context/image-assets-context": { useImageAssets: () => ({ avatar: { revision: 3, image: null } }) }, "@/lib/image-assets": helper, "@/components/ui/ImageFilePicker": { ImageFilePicker }, "@/components/ui/Button": { Button }, "@/components/overlay/ConfirmDialog": { ConfirmDialog } });
function find(node, predicate) { if (!node || typeof node !== "object") return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, predicate); if (found) return found; } return null; }
function render() { stateIndex = refIndex = 0; effects = []; return ui.ImageAssetSettings({ scope: "avatar" }); }
const button = (tree, text) => find(tree, node => node.type === Button && node.props.children === text);
const previousFetch = globalThis.fetch;
const file = new File(["synthetic"], "test.png", { type: "image/png" });
const calls = []; let mode = "unknown";
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url, init });
  if (init.method) {
    if (mode === "unknown") throw new Error("synthetic disconnect");
    if (mode === "conflict") return Response.json({}, { status: 409 });
    if (mode === "unauthorized") return Response.json({}, { status: 401 });
    if (mode === "forbidden") return Response.json({}, { status: 403 });
    if (mode === "rateLimited") return Response.json({}, { status: 429 });
    const query = new URL(url, "http://localhost").searchParams;
    return Response.json({ requestId: query.get("requestId"), previousRevision: 3, revision: 4, operation: "replace", image: null });
  }
  return Response.json({ revision: 4, image: null });
};
const tick = () => new Promise(resolve => setImmediate(resolve));
try {
  let tree = render(); const cleanup = effects[0]();
  assert.equal(button(tree, "save").props.disabled, true);
  find(tree, node => node.type === ImageFilePicker).props.onChange(file);
  tree = render(); const save = button(tree, "save").props.onClick;
  save(); save(); await tick();
  assert.equal(calls.length, 1, "Double click writes once");
  const original = calls[0]; tree = render();
  assert.ok(find(tree, node => node.props?.role === "alert" && node.props.children === "unknown"));
  assert.equal(find(tree, node => node.type === ImageFilePicker).props.disabled, true);
  mode = "success"; button(tree, "retrySame").props.onClick(); await tick();
  assert.equal(calls[1].url, original.url); assert.equal(calls[1].init.body, file);
  assert.equal(calls[2].init.method, undefined, "Receipt success reloads current metadata");
  assert.equal(refreshes, 1); tree = render(); assert.ok(find(tree, node => node.props?.role === "status" && node.props.children === "saved"));
  find(tree, node => node.type === ImageFilePicker).props.onChange(file); tree = render(); mode = "conflict";
  button(tree, "save").props.onClick(); await tick(); tree = render(); assert.equal(button(tree, "save").props.disabled, true);
  button(tree, "reload").props.onClick(); await tick(); tree = render(); assert.equal(button(tree, "save").props.disabled, false);
  cleanup();
  for (const reason of ["unauthorized", "forbidden", "rateLimited"]) {
    states = []; refs = []; tree = render(); const close = effects[0]();
    find(tree, node => node.type === ImageFilePicker).props.onChange(file); tree = render(); mode = reason;
    button(tree, "save").props.onClick(); await tick(); tree = render();
    assert.ok(find(tree, node => node.props?.role === "alert" && node.props.children === reason), `Distinct ${reason} message`);
    assert.equal(button(tree, "retrySame"), null, "Known rejection is not an unknown committed result");
    if (reason !== "rateLimited") assert.equal(button(tree, "save").props.disabled, true);
    close();
  }
  states = []; refs = []; tree = render(); const end = effects[0]();
  find(tree, node => node.type === ImageFilePicker).props.onChange(file); tree = render(); mode = "success";
  button(tree, "save").props.onClick(); end(); await tick(); assert.equal(refreshes, 1, "Unmounted settings never refresh or publish a save result");
} finally { globalThis.fetch = previousFetch; }
console.log("Image settings: duplicate lock, unknown-result same-request retry, conflict reload, 401/403/429 isolation, exact receipt, metadata refresh and unmount isolation passed. Synthetic only.");

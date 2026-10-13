import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    assert.ok(["react", "react/jsx-runtime", "lucide-react"].includes(name)); return require(name);
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const helper = load("../lib/local-image-file.ts");
const limits = { mimeTypes: ["image/png", "image/jpeg", "image/webp"], maxBytes: 100, maxWidth: 64, maxHeight: 64, maxPixels: 4096 };
const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "synthetic.png", { type: "image/png" });
const savedDecoder = globalThis.createImageBitmap;
let closed = 0, decoded = 0;
globalThis.createImageBitmap = async () => { decoded++; return { width: 32, height: 32, close() { closed++; } }; };
try {
  assert.deepEqual(await helper.inspectLocalImage(png, limits), { width: 32, height: 32 });
  assert.equal(closed, 1);
  for (const [file, reason] of [
    [new File(["<svg/>"], "x.png", { type: "image/svg+xml" }), "format"],
    [new File(["<html/>"], "x.png", { type: "image/png" }), "format"],
    [new File([], "x.png", { type: "image/png" }), "size"],
    [new File([new Uint8Array(101)], "x.png", { type: "image/png" }), "size"],
  ]) await assert.rejects(helper.inspectLocalImage(file, limits), error => error.reason === reason);
  assert.equal(decoded, 1, "Reject invalid size/type/signature before decoding");
  globalThis.createImageBitmap = async () => ({ width: 65, height: 1, close() { closed++; } });
  await assert.rejects(helper.inspectLocalImage(png, limits), error => error.reason === "dimensions");
  assert.equal(closed, 2);
  globalThis.createImageBitmap = async () => { throw new Error("synthetic decode failure"); };
  await assert.rejects(helper.inspectLocalImage(png, limits), error => error.reason === "decode");
  const previousTimer = globalThis.setTimeout;
  let expire, finish;
  globalThis.setTimeout = callback => { expire = callback; return undefined; };
  globalThis.createImageBitmap = () => new Promise(resolve => { finish = resolve; });
  try {
    const pending = helper.inspectLocalImage(png, limits);
    await new Promise(resolve => setImmediate(resolve)); expire();
    await assert.rejects(pending, error => error.reason === "decode");
    finish({ width: 32, height: 32, close() { closed++; } });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(closed, 3, "Late decoder resources are released after timeout");
  } finally { globalThis.setTimeout = previousTimer; }
} finally { globalThis.createImageBitmap = savedDecoder; }

const Button = ({ children, leadingIcon, ...props }) => React.createElement("button", props, leadingIcon, children);
const props = { limits, label: "Image", chooseLabel: "Choose file", clearLabel: "Clear", previewAlt: "Preview", errors: { format: "format", size: "size", dimensions: "dimensions", decode: "decode" }, onChange() {} };
const picker = load("../components/ui/ImageFilePicker.tsx", { "./Button": { Button }, "@/lib/local-image-file": helper });
const html = renderToStaticMarkup(React.createElement(picker.ImageFilePicker, props));
assert.match(html, /type="file"/); assert.match(html, /accept="image\/png,image\/jpeg,image\/webp"/);
assert.doesNotMatch(html, /<img|blob:|type="submit"/);
let states = [], refs = [], stateIndex = 0, refIndex = 0, effects = [];
const hooks = { ...React, useId: () => "picker", useState: initial => { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
  useRef: initial => { const i = refIndex++; return refs[i] ??= { current: initial }; }, useEffect: effect => effects.push(effect) };
let finishSelection;
const interactive = load("../components/ui/ImageFilePicker.tsx", { react: hooks, "./Button": { Button }, "@/lib/local-image-file": { ...helper, inspectLocalImage: () => new Promise(resolve => { finishSelection = resolve; }) } });
const events = [], urls = [];
const previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL;
URL.createObjectURL = () => { urls.push("create"); return "blob:synthetic"; };
URL.revokeObjectURL = url => urls.push(url);
function find(node, predicate) { if (!node || typeof node !== "object") return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props?.children)) { const result = find(child, predicate); if (result) return result; } return null; }
function render() { stateIndex = refIndex = 0; effects = []; return interactive.ImageFilePicker({ ...props, onChange: file => events.push(file) }); }
try {
  let tree = render(); let cleanup = effects[0]();
  const target = { files: [png], value: "synthetic" };
  find(tree, node => node.type === "input").props.onChange({ currentTarget: target }); assert.equal(target.value, "");
  finishSelection({ width: 32, height: 32 }); await new Promise(resolve => setImmediate(resolve));
  tree = render(); assert.equal(find(tree, node => node.type === "img").props.src, "blob:synthetic"); assert.deepEqual(events, [png]);
  find(tree, node => node.type === Button && node.props.children === "Clear").props.onClick();
  assert.deepEqual(urls, ["create", "blob:synthetic"]); assert.deepEqual(events, [png, null]);
  tree = render(); find(tree, node => node.type === "input").props.onChange({ currentTarget: { files: [png], value: "" } });
  cleanup(); finishSelection({ width: 32, height: 32 }); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, [png, null], "Selection after unmount never publishes a file or creates a preview");
  assert.deepEqual(urls, ["create", "blob:synthetic"]);
} finally { URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke; }
console.log("Local image picker passed: file bounds/signatures, synthetic decoding/pixel limits, bitmap cleanup, SSR, selection/clear, object URL disposal and late-result isolation. No network or server writes.");

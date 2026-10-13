import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import imports from "lucide-react/dynamicIconImports.mjs";
import * as catalog from "../lib/mailbox-icon-catalog.mjs";

assert.deepEqual(catalog.LUCIDE_ICON_NAMES, Object.keys(imports).sort(), "catalog must match the installed package exactly");
assert.equal(catalog.mailboxIconName("shopping"), "shopping-bag");
assert.equal(catalog.mailboxIconName("lucide:alarm-clock"), "alarm-clock");
assert.equal(catalog.mailboxIconName("lucide:__proto__"), null);
assert.equal(catalog.mailboxIconName("unknown-package:folder"), null);
assert.ok(catalog.searchMailboxIcons("메일").includes("mail"));
assert.ok(catalog.searchMailboxIcons("FOLDER OPEN").includes("folder-open"));
assert.equal(catalog.searchMailboxIcons("not-an-icon-zzzzz").length, 0);
assert.equal(catalog.searchMailboxIcons("", "uninstalled").length, 0);

const require = createRequire(import.meta.url);
let preload = async () => () => null;
const source = readFileSync(new URL("../components/mail/MailboxIconPicker.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function render({ query = "", value = "heart", locale = "ko", trigger = false, packageId = "lucide", change, recovery } = {}) {
  const strings = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const states = trigger ? [true] : [query, packageId, 80, false, false, value];
  let index = 0, chosen, closed = 0;
  const updates = [];
  const exports = {};
  const modules = {
    react: { ...React, useMemo: fn => fn(), useEffect: () => {}, useRef: value => ({ current: value }), useState: () => {
      const state = states[index++]; return [state, next => updates.push(typeof next === "function" ? next(state) : next)];
    } },
    "react-dom": { createPortal: (node, target) => ({ portal: true, node, target }) },
    "next/dynamic": { default: () => props => React.createElement("svg", { "data-icon": props.name }) },
    "./MailboxGlyph": { default: props => React.createElement("svg", { "data-icon": props.name }) },
    "@/lib/mailbox-glyph-loader": { preloadMailboxGlyph: (...args) => preload(...args) },
    "next-intl": { useTranslations: ns => (key, values = {}) => {
      assert.equal(typeof strings[ns][key], "string");
      return strings[ns][key].replace(/\{(\w+)\}/g, (_, key) => String(values[key]));
    } },
    "@/components/overlay/Modal": { Modal: props => React.createElement("div", { role: "dialog", "aria-modal": true, "aria-label": props.ariaLabel }, props.children) },
    "@/components/overlay/DialogActions": { DialogActions: ({ children }) => React.createElement("div", { "data-dialog-actions": true }, children) },
    "@/components/ui/Button": { Button: ({ leadingIcon, variant, size, loading, children, ...props }) => { void variant; void size; void loading; return React.createElement("button", props, leadingIcon, children); } },
    "@/components/ui/Input": { Input: ({ leadingIcon, ...props }) => { void leadingIcon; return React.createElement("input", props); } },
    "@/components/ui/Tooltip": { Tooltip: ({ children }) => children },
    "@/lib/mailbox-icon-catalog.mjs": catalog,
  };
  new Function("require", "exports", "document", compiled)(name => modules[name] ?? require(name), exports, { body: "body" });
  const props = { label: "Synthetic mailbox icon", value, recovery, defaultIcon: () => React.createElement("svg"), onChange: next => { chosen = next; return change?.(next); }, onClose: () => { closed++; }, children: React.createElement("svg") };
  const tree = trigger ? exports.MailboxIconPickerTrigger(props) : exports.MailboxIconPicker(props);
  const elements = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.props) { elements.push(node); visit(node.props.children); }
  }
  visit(tree);
  return { tree, elements, updates, get chosen() { return chosen; }, get closed() { return closed; } };
}
const apply = picker => picker.elements.find(node => node.props.children === "적용" || node.props.children === "Apply" || node.props.variant === "primary").props.onClick();
for (const locale of ["ko", "en", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
  const modal = render({ locale });
  assert.match(renderToStaticMarkup(modal.tree), /role="dialog"/);
  const buttons = modal.elements.filter(node => node.props["aria-pressed"] !== undefined);
  assert.equal(buttons.length, 80, "initial rendering is bounded, not the whole library");
  assert.match(buttons[0].props.className, /min-w-11/);
  await buttons[0].props.onClick();
  assert.equal(modal.chosen, undefined, "selection only previews; it never saves immediately");
  await apply(modal);
  assert.equal(modal.chosen, `lucide:${catalog.LUCIDE_ICON_NAMES[0]}`);
}
const search = render({ query: "메일", value: "lucide:mail" });
assert.ok(search.elements.some(node => node.props["aria-label"] === "Lucide: mail" && node.props["aria-pressed"] === true));
const empty = render({ query: "not-an-icon-zzzzz" });
assert.equal(empty.elements.filter(node => node.props["aria-pressed"] !== undefined).length, 0);
const modal = render();
let prevented = false, stopped = false;
modal.tree.props.onKeyDownCapture({ key: "Escape", preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
assert.ok(prevented && stopped && modal.closed === 1, "Escape stays inside the modal");
const more = modal.elements.find(node => node.props.children === "더 보기");
more.props.onClick(); assert.deepEqual(modal.updates, [160]);
const input = modal.elements.find(node => node.props.type === "search");
input.props.onChange({ target: { value: "folder" } }); assert.deepEqual(modal.updates.slice(-2), ["folder", 80]);
const reset = modal.elements.find(node => node.props.children === "기본 아이콘");
reset.props.onClick(); assert.equal(modal.chosen, undefined); await apply(modal); assert.equal(modal.chosen, "default");
const trigger = render({ trigger: true });
assert.equal(trigger.tree.props.children[1].portal, true);
assert.equal(trigger.tree.props.children[1].target, "body");
assert.ok(trigger.elements.some(node => node.props["aria-haspopup"] === "dialog"));
console.log("Icon picker: installed catalog, Korean/English search, 10 locales, bounded grid, selection, portal, Escape and reset passed");
for (const packageId of ["phosphor", "emoji"]) {
  const picker = render({ packageId });
  const options = picker.elements.filter(node => node.props["aria-pressed"] !== undefined);
  assert.equal(options.length, 80);
  await options[0].props.onClick();
  await apply(picker);
  assert.ok(picker.chosen.startsWith(`${packageId}:`));
  assert.ok(catalog.mailboxIconEntry(picker.chosen));
}
assert.equal(catalog.mailboxIconEntry("phosphor:acorn").packageId, "phosphor");
assert.equal(catalog.mailboxIconEntry("emoji:grinning").native, "😀");
assert.equal(catalog.mailboxIconEntry("emoji:<script>"), null);
assert.equal(catalog.mailboxIconEntry("phosphor:__proto__"), null);
assert.ok(catalog.searchMailboxIcons("하트", "phosphor").includes("heart"));
assert.ok(catalog.searchMailboxIcons("웃음", "emoji").includes("grinning"));
assert.ok(catalog.searchMailboxIcons("😀", "emoji").includes("grinning"));
const tabs = render().elements.filter(node => node.props.role === "tab");
assert.equal(tabs.length, 3);
tabs[2].props.onClick();
const selected = render({ value: "emoji:grinning", packageId: "emoji", query: "grinning" });
assert.ok(selected.elements.some(node => node.props["aria-pressed"] === true));
console.log("Phosphor and emoji tabs: search, bounded grid, validated values and selected states passed");
const emojiData = require("@emoji-mart/data");
const emojiPack = catalog.ICON_PACKAGES.find(pack => pack.id === "emoji");
assert.equal(emojiPack.names.length, Object.values(emojiData.emojis).reduce((count, emoji) => count + emoji.skins.length, 0));
for (const emoji of Object.values(emojiData.emojis)) {
  emoji.skins.forEach((skin, index) => assert.equal(catalog.mailboxIconEntry(`emoji:${index ? `${emoji.id}--skin-${index + 1}` : emoji.id}`).native, skin.native));
}
const { imports: phosphorImports } = await import("../lib/phosphor-mailbox-imports.mjs");
assert.deepEqual(Object.keys(phosphorImports), catalog.ICON_PACKAGES.find(pack => pack.id === "phosphor").names);
const acorn = await phosphorImports.acorn();
assert.match(renderToStaticMarkup(React.createElement(acorn.default)), /<svg/);
const glyphSource = readFileSync(new URL("../components/mail/MailboxGlyph.tsx", import.meta.url), "utf8");
const glyphCompiled = ts.transpileModule(glyphSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const glyphExports = {};
new Function("require", "exports", glyphCompiled)(name => name === "@/lib/mailbox-icon-catalog.mjs" ? catalog
  : name === "@/context/mailbox-icon-context" ? { useInitialMailboxGlyphs: () => ({}) }
  : name === "@/lib/mailbox-glyph-loader" ? { loadedMailboxGlyph: () => null, subscribeMailboxGlyphs: () => () => {} }
  : name === "react" ? { ...React, useSyncExternalStore: (_subscribe, snapshot) => snapshot() }
  : name === "next/dynamic" ? { default: () => props => React.createElement("svg", { "data-name": props.name }) } : require(name), glyphExports);
assert.match(renderToStaticMarkup(glyphExports.default({ packageId: "emoji", name: "grinning" })), /😀/);
assert.equal(glyphExports.default({ packageId: "emoji", name: "<script>" }), null);
console.log("Installed data: all 3395 emoji variants, Phosphor import registry and actual glyph rendering passed");
const cancelled = render();
cancelled.elements.find(node => node.props["aria-pressed"] !== undefined).props.onClick();
assert.equal(cancelled.chosen, undefined, "preview does not replace the saved icon");
cancelled.tree.props.onKeyDownCapture({ key: "Escape", preventDefault() {}, stopPropagation() {} });
assert.equal(cancelled.chosen, undefined, "closing discards a preview without writing");
const resetPending = render();
resetPending.elements.find(node => node.props["aria-pressed"] !== undefined).props.onClick();
resetPending.elements.find(node => node.props.children === "기본 아이콘").props.onClick();
assert.equal(resetPending.chosen, undefined, "reset is also a preview");
await apply(resetPending);
assert.equal(resetPending.chosen, "default");
console.log("Preview selection: explicit apply, Escape cancellation and default preview passed.");
preload = async () => () => null;
let finishSave, writes = 0;
const delayed = render({ change: () => { writes++; return new Promise(resolve => { finishSave = resolve; }); } });
const option = delayed.elements.find(node => node.props["aria-pressed"] !== undefined);
option.props.onClick();
const pendingSave = apply(delayed);
await Promise.resolve(); await Promise.resolve();
assert.equal(writes, 1);
await apply(delayed);
assert.equal(writes, 1, "duplicate selections cannot start parallel writes");
delayed.tree.props.onKeyDownCapture({ key: "Escape", preventDefault() {}, stopPropagation() {} });
assert.equal(delayed.closed, 0, "saving cannot be dismissed as though it were cancelled");
finishSave(false); await pendingSave;
assert.ok(delayed.updates.includes(true), "rejected receipt leaves an error instead of closing");
const failed = render({ change: () => Promise.reject(new Error("synthetic failure")) });
await failed.elements.find(node => node.props["aria-pressed"] !== undefined).props.onClick();
await apply(failed);
assert.equal(failed.closed, 0);
const asyncTrigger = render({ trigger: true, change: () => new Promise(resolve => { finishSave = resolve; }) });
const pickerProps = asyncTrigger.tree.props.children[1].node.props;
const saveInTrigger = pickerProps.onChange("lucide:mail");
assert.equal(asyncTrigger.updates.length, 0, "modal waits for server acknowledgment");
finishSave(false); await saveInTrigger;
assert.equal(asyncTrigger.updates.length, 0, "false acknowledgment must keep the picker open");
const lateTrigger = render({ trigger: true, change: () => new Promise(resolve => { finishSave = resolve; }) });
const lateProps = lateTrigger.tree.props.children[1].node.props;
const lateSave = lateProps.onChange("lucide:mail");
lateProps.onClose();
lateTrigger.elements.find(node => node.props["aria-haspopup"] === "dialog").props.onClick();
const beforeLate = lateTrigger.updates.length;
finishSave(true); await lateSave;
assert.equal(lateTrigger.updates.length, beforeLate, "old save cannot close a newly opened picker");
assert.doesNotMatch(source, /\btitle=/, "picker tooltips must use the shared custom tooltip");
console.log("Async picker saves: acknowledgment, failure, duplicate-write lock, reopen race and custom tooltips passed.");
const recovery = React.createElement("div", { role: "status" }, "Synthetic recovery");
const recoveryTrigger = render({ trigger: true, recovery });
assert.equal(recoveryTrigger.tree.props.children[1].node.props.recovery, recovery, "portal keeps the server recovery UI");
assert.match(renderToStaticMarkup(render({ recovery }).tree), /Synthetic recovery/);
console.log("Picker recovery: trigger portal forwarding and modal rendering passed.");
const rejectedWithRecovery = render({ recovery, change: () => false });
rejectedWithRecovery.elements.find(node => node.props["aria-pressed"] !== undefined).props.onClick();
await apply(rejectedWithRecovery);
assert.equal(rejectedWithRecovery.closed, 0);
assert.equal(rejectedWithRecovery.updates.filter(value => value === true).length, 1,
  "server recovery owns rejected-save feedback; picker must not add a duplicate failure");

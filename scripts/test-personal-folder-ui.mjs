import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { personalFolderInput } from "../lib/tastemail/personal-folder-contract.ts";
import { personalFolderTree } from "../lib/personal-folder-tree.ts";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const id = "11111111-1111-4111-8111-111111111111";
const box = (name = "Work", extra = {}) => ({ id, name, role: null, totalEmails: 0, unreadEmails: 0, usedBytes: 0, quotaBytes: 1024, ...extra });
function render({ locale = "en", open = true, target = "", pending = false, uncertain = false, confirm = false, mailboxes = [box()], request } = {}) {
  const messages = JSON.parse(readFileSync(new URL(`messages/${locale}.json`, root), "utf8"));
  const states = [open, target, target ? "Work" : "New folder", request?.parentPath ?? "", null, confirm, request?.kind ?? "mailbox"];
  let index = 0;
  const cache = new Map();
  const renderedOptions = [];
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const code = ts.transpileModule(readFileSync(new URL(path, root), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const exports = {};
    const scopedRequire = name => {
      if (name === "react-dom") return { createPortal: node => node };
      if (name === "@/components/overlay/Modal" || name === "./Modal") return { Modal: props => React.createElement("div", { role: "dialog", "aria-label": props.ariaLabel, "aria-labelledby": props.labelledBy }, props.children) };
      if (name === "@/components/overlay/DialogActions" || name === "./DialogActions") return load("components/overlay/DialogActions.tsx");
      if (name === "@/components/overlay/ConfirmDialog") return load("components/overlay/ConfirmDialog.tsx");
      if (name === "./InboxContextMenu") return { InboxContextMenu: props => React.createElement("div", {}, props.children, React.createElement("button", { "aria-label": props.menuLabel, "aria-expanded": false }, "+")) };
      if (name === "@/components/ui/Tooltip" || name === "./Tooltip") return { Tooltip: props => props.children };
      if (name === "./PersonalFolderIcon") return { rememberCreatedMailboxKind: () => {} };
      if (name === "@/context/mailbox-icon-context") return { useServerMailboxIcons: () => ({ required: false, matched: false }) };
      if (name === "react" && path.endsWith("PersonalFolderManager.tsx")) return { ...React, useState: () => [states[index++], () => {}] };
      if (name === "next-intl") return { useTranslations: namespace => key => { assert.equal(typeof messages[namespace]?.[key], "string", `${locale}:${namespace}.${key}`); return messages[namespace][key]; } };
      if (name === "@/context/mail-context") return { useMail: () => ({ mailboxes, folderChangePending: pending, folderChangeUncertain: uncertain, changeFolder: async () => {}, refreshMailbox: () => {} }) };
      if (name === "@/lib/tastemail/personal-folder-contract") return { personalFolderInput };
      if (name === "@/components/ui/CustomSelect") {
        const select = load("components/ui/CustomSelect.tsx");
        return { ...select, CustomSelect: props => { renderedOptions.push(...select.customSelectOptions(props.children)); return React.createElement(select.CustomSelect, props); } };
      }
      if (name.startsWith("@/components/ui/")) return load(`${name.slice(2)}.tsx`);
      if (name === "./Dropdown") return load("components/ui/Dropdown.tsx");
      if (name === "./Dropdown.module.css") return {};
      if (name === "@/lib/personal-folder-tree") return { personalFolderTree, childFolderName: (parent, name) => parent ? `${parent}/${name}` : name };
      if (name === "./utils" || name === "../ui/utils") return load("components/ui/utils.ts");
      return require(name);
    };
    vm.runInNewContext(code, { exports, require: scopedRequire, document: { body: {} } }); cache.set(path, exports); return exports;
  }
  const { PersonalFolderManager } = load("components/mail/PersonalFolderManager.tsx");
  return { html: renderToStaticMarkup(React.createElement(PersonalFolderManager, { compact: false, request })), t: messages.personalFolders, tree: messages.folderTree, renderedOptions };
}
const buttons = html => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attrs, body]) => ({ attrs, body }));
const isDisabled = button => /(?:^|\s)disabled(?:=|\s|$)/.test(button.attrs);

test("context dialogs leave no padded placeholder in the mailbox tree", () => {
  for (const kind of ["rename", "folder", "mailbox"]) {
    const options = { request: { kind, ...(kind === "rename" ? { mailboxId: id } : {}) }, target: kind === "rename" ? id : "" };
    assert.match(render(options).html, /^<div role="dialog"/);
    assert.doesNotMatch(render(options).html, /class="min-w-0 pt-2"/);
    assert.equal(render({ ...options, open: false }).html, "");
  }
  assert.match(render({ open: false }).html, /^<div class="min-w-0 pt-2"/);
});

test("rename prioritizes the name input for modal focus and selects its existing text", () => {
  const { html } = render({ target: id, request: { kind: "rename", mailboxId: id } });
  assert.match(html, /<input[^>]*data-modal-autofocus="true"/);
  assert.doesNotMatch(render().html, /data-modal-autofocus/);
  const text = readFileSync(new URL("components/mail/PersonalFolderManager.tsx", root), "utf8");
  const ast = ts.createSourceFile("manager.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === "onFocus") handler = node.initializer.expression.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(handler);
  for (const target of [id, ""]) {
    let selected = 0;
    new Function("target", `return (${handler});`)(target)({ currentTarget: { select() { selected++; } } });
    assert.equal(selected, target ? 1 : 0);
  }
});

test("sidebar creation trigger opens mailbox form directly and blocks busy writes", () => {
  const text = readFileSync(new URL("components/mail/PersonalFolderManager.tsx", root), "utf8");
  const ast = ts.createSourceFile("manager.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "openCreateMailbox") callback = node.initializer.getText(ast); ts.forEachChild(node, visit); }
  visit(ast);
  assert.ok(callback);
  for (const [disabled, busy] of [[false, false], [true, false], [false, true]]) {
    const changes = {};
    const bindings = { disabled, inFlight: { current: busy } };
    for (const field of ["Kind", "Target", "Name", "Parent", "Status", "ConfirmDelete", "Open"]) bindings[`set${field}`] = value => { changes[field] = value; };
    new Function(...Object.keys(bindings), `return (${callback});`)(...Object.values(bindings))();
    assert.deepEqual(changes, disabled || busy ? {} : { Kind: "mailbox", Target: "", Name: "", Parent: "", Status: null, ConfirmDelete: false, Open: true });
  }
});

test("create closes only after confirmed creation and kind persistence; retry closes without recreating", async () => {
  const text = readFileSync(new URL("components/mail/PersonalFolderManager.tsx", root), "utf8");
  const ast = ts.createSourceFile("manager.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = {};
  function visit(node) { if (ts.isFunctionDeclaration(node) && ["submit", "retryKind"].includes(node.name?.text)) functions[node.name.text] = node.getText(ast); ts.forEachChild(node, visit); }
  visit(ast);
  for (const kind of ["folder", "mailbox"]) for (const result of [true, false, "error"]) {
    let created = 0, closed = 0, kindCalls = 0;
    const bindings = { disabled: false, inFlight: { current: false }, deleteBlocked: false, selected: null,
      folders: [], parent: "", paths: [], name: "Synthetic", target: "", kind,
      personalFolderInput, childFolderName: (_, value) => value, accountAddress: "synthetic@example.test", account: "synthetic@example.test",
      icons: { required: true, saveCreatedKind: async () => { kindCalls++; if (result === "error") throw new Error("retryable"); return result; } },
      changeFolder: async () => { created++; return id; }, t: key => key, live: key => key, kindNotice: key => key,
      setStatus() {}, setCreatedKind() {}, setName() {}, setKindSaving() {}, setTarget() {}, setParent() {}, setConfirmDelete() {},
      setOpen: value => { if (!value) closed++; }, onClose() {}, createdKind: { id, account: "synthetic@example.test", kind } };
    const compile = key => new Function(...Object.keys(bindings), `${ts.transpileModule(functions[key], { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText}; return ${key};`)(...Object.values(bindings));
    await compile("submit")("create");
    assert.equal(created, 1);
    assert.equal(kindCalls, kind === "folder" ? 1 : 0, "default mailbox needs no secondary icon-settings write");
    assert.equal(closed, kind === "mailbox" || result === true ? 1 : 0);
    await compile("retryKind")();
    assert.equal(created, 1, "type retry must not create a second mailbox");
    assert.equal(closed, kind === "mailbox" || result === true ? 2 : 0);
    if (kind === "mailbox") assert.equal(kindCalls, 0, "existing default-mailbox recovery closes without an icon API request");
  }
});
test("actual components render all ten languages and theme primitives", () => {
  for (const locale of ["en", "ko", "de", "es", "fr", "it", "pt", "ja", "zh", "zh-hant"]) {
    const { html, t } = render({ locale });
    assert.ok(html.includes(t.newMailbox)); assert.ok(html.includes(t.name));
    assert.match(html, /role="dialog"/); assert.match(html, /<label/);
    assert.match(html, /--color-primary-solid/); assert.match(html, /--radius-app/);
    assert.match(html, /focus-visible:ring/); assert.match(html, /<input[^>]*required/);
    assert.equal(isDisabled(buttons(html).find(button => button.attrs.includes('type="submit"'))), false);
  }
});
test("closed manager has no hidden editable form", () => {
  const { html, t } = render({ open: false }); assert.match(html, /aria-expanded="false"/);
  assert.ok(html.includes(`aria-label="${t.newMailbox}"`));
  assert.match(html, /aria-haspopup="dialog"/);
  assert.equal(buttons(html).length, 1);
  assert.equal(html.includes("<form"), false); assert.equal(html.includes("<select"), false);
});
test("folder selector label excludes options and targets the custom combobox", () => {
  const { html, tree } = render();
  const [, selectId] = html.match(/<button[^>]*\bid="([^"]+)"[^>]*role="combobox"/);
  const labels = [...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)];
  const label = labels.find(([, attrs]) => attrs.includes(`for="${selectId}"`));
  assert.ok(label);
  assert.equal(label[2], tree.parent);
  assert.equal(label[2].includes("<option"), false);
});
test("built-in mailboxes never become editable options", () => {
  const { html, renderedOptions } = render({ mailboxes: [box(), box("Inbox", { id: "inbox", role: "inbox" }), box("INBOX", { id: "legacy" }), box("Sent", { id: "sent", role: "sent" })] });
  assert.ok(renderedOptions.some(option => option.value === "Work"));
  assert.equal(renderedOptions.some(option => ["Inbox", "INBOX", "Sent"].includes(option.label)), false);
  assert.doesNotMatch(html, /<select/);
});
test("pending mutation disables input, select and submit", () => {
  const { html } = render({ pending: true });
  assert.match(html, /<input[^>]*disabled/); assert.match(html, /<button[^>]*role="combobox"[^>]*disabled/);
  assert.match(html, /aria-busy="true"/); assert.ok(isDisabled(buttons(html).find(button => button.attrs.includes('type="submit"'))));
});
test("uncertain result blocks writes but leaves read-only refresh enabled", () => {
  const { html, t } = render({ uncertain: true }); assert.ok(html.includes(t.uncertain)); assert.match(html, /role="status"/);
  assert.match(html, /<input[^>]*disabled/);
  const controls = buttons(html); assert.ok(isDisabled(controls.find(button => button.attrs.includes('type="submit"'))));
  assert.equal(isDisabled(controls.at(-1)), false);
});
test("nonempty folder and parent with descendants cannot be deleted", () => {
  for (const mailboxes of [[box("Work", { totalEmails: 1 })], [box(), box("Work/Child", { id: "child" })]]) {
    const { html, t } = render({ target: id, mailboxes });
    assert.ok(html.includes(t.emptyOnly));
    assert.ok(isDisabled(buttons(html).find(button => button.body === t.delete)));
  }
});
test("empty folder deletion displays a separate confirmation with target name", () => {
  const { html, t } = render({ target: id, confirm: true });
  assert.match(html, /aria-labelledby="confirm-dialog-title"/); assert.ok(html.includes(t.confirm));
  assert.equal(buttons(html).filter(button => button.body === t.delete).length, 1);
  assert.doesNotMatch(html, /<form/);
  assert.ok(buttons(html).some(button => button.body === t.cancel));
});

test("creation dialogs use distinct titles and include missing ancestor paths", () => {
  for (const kind of ["folder", "mailbox"]) {
    const { html, t, renderedOptions } = render({ request: { kind, parentPath: "Parent" }, mailboxes: [box("Parent/Child")] });
    assert.ok(html.includes(`aria-label="${t[kind === "folder" ? "newFolder" : "newMailbox"]}"`));
    assert.ok(renderedOptions.some(option => option.value === "Parent"));
    assert.equal(renderedOptions.some(option => option.value === id), false);
  }
});

test("delete context opens confirmation without a rename form", () => {
  const { html, t } = render({ target: id, confirm: true, request: { kind: "delete", mailboxId: id } });
  assert.ok(html.includes(t.delete));
  assert.match(html, /aria-labelledby="confirm-dialog-title"/);
  assert.doesNotMatch(html, /<form/);
});

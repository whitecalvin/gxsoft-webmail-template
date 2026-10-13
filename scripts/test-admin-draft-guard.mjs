import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { adminDraftDestination } from "../lib/admin-draft-navigation.ts";
test("navigation distinguishes real route changes from same-document and foreign links", () => {
  const current = "https://mail.example.test/ko/admin/users?q=qa";
  assert.equal(adminDraftDestination("#form", current), null);
  assert.equal(adminDraftDestination("https://other.example.test/", current), null);
  assert.equal(adminDraftDestination("/ko/admin/groups", current), "/ko/admin/groups");
  assert.equal(adminDraftDestination("/ko/admin/users?q=next#form", current), "/ko/admin/users?q=next#form");
});
function fixture({ dirty = true, busy = false } = {}) {
  const state = [{ form: { dirty, busy } }, null], effects = [], docEvents = new Map(), windowEvents = new Map(), pushes = [];
  let cursor = 0;
  class Element {}
  class Anchor extends Element {
    constructor(href, options = {}) { super(); this.href = href; this.target = options.target ?? ""; this.download = options.download ?? false; this.drawer = options.drawer ?? null; }
    hasAttribute(name) { return name === "download" && this.download; }
    closest(selector) { return selector === "a[href]" ? this : this.drawer; }
  }
  class Dialog extends Element { open = true; clicks = 0; querySelector() { return { click: () => { this.clicks++; } }; } close() { this.open = false; } }
  const location = { href: "https://mail.example.test/ko/admin/users" };
  const history = { state: { fixture: 1 }, pushState(value, _title, href) { this.state = value; location.href = href; } };
  const modules = {
    react: { createContext: () => ({ Provider: "provider" }), useCallback: fn => fn, useRef: value => ({ current: value }), useState: initial => { const index = cursor++; if (state[index] === undefined) state[index] = initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; }, useEffect: fn => effects.push(fn) },
    "react/jsx-runtime": jsx, "next/navigation": { useRouter: () => ({ push: href => pushes.push(href) }) },
    "next-intl": { useTranslations: () => key => key },
    "@/components/overlay/ConfirmDialog": { ConfirmDialog: () => null },
    "@/lib/admin-draft-navigation": { adminDraftDestination },
  };
  const exports = {}, source = readFileSync(new URL("../components/admin/AdminDraftGuard.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: name => modules[name], URL, Element, HTMLAnchorElement: Anchor, HTMLDialogElement: Dialog,
    document: { querySelector: () => null, addEventListener: (name, fn) => docEvents.set(name, fn), removeEventListener: name => docEvents.delete(name) },
    window: { location, history, addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: name => windowEvents.delete(name) },
  });
  const render = () => { cursor = 0; return exports.AdminDraftGuard({ children: "fixture" }); };
  const initial = render(), cleanup = effects.splice(0).map(effect => effect()).filter(Boolean);
  const event = (anchor, overrides = {}) => ({ target: anchor, defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides });
  return { state, pushes, docEvents, windowEvents, location, history, Anchor, Dialog, event, context: initial.props.value,
    dialog: () => render().props.children[1]?.props,
    cleanup: () => cleanup.forEach(fn => fn()),
  };
}
test("cancel keeps the current form and confirmation performs only the chosen action", () => {
  const f = fixture(), e = f.event(new f.Anchor("https://mail.example.test/ko/admin/groups"));
  f.docEvents.get("click")(e); assert.equal(e.prevented, true); assert.equal(f.pushes.length, 0);
  f.dialog().onCancel(); assert.equal(f.state[1], null); assert.equal(f.pushes.length, 0);
  f.docEvents.get("click")(e); f.dialog().onConfirm(); assert.deepEqual(f.pushes, ["/ko/admin/groups"]);
  f.cleanup(); assert.equal(f.docEvents.size, 0); assert.equal(f.windowEvents.size, 0);
});
test("downloads, modified clicks, new tabs and hash navigation do not discard a form", () => {
  const f = fixture();
  for (const [anchor, options] of [[new f.Anchor("https://mail.example.test/ko/admin/groups"), { ctrlKey: true }], [new f.Anchor("https://mail.example.test/ko/admin/groups", { target: "_blank" }), {}], [new f.Anchor("https://mail.example.test/ko/admin/groups", { download: true }), {}], [new f.Anchor("https://mail.example.test/ko/admin/users#form"), {}]]) {
    const e = f.event(anchor, options); f.docEvents.get("click")(e); assert.equal(e.prevented, undefined);
  }
  assert.equal(f.state[1], null);
});
test("mobile drawer leaves the native top layer before showing the common confirmation", () => {
  const f = fixture(), drawer = new f.Dialog();
  f.docEvents.get("click")(f.event(new f.Anchor("https://mail.example.test/ko/admin/groups", { drawer })));
  assert.equal(drawer.open, false); assert.equal(drawer.clicks, 1); assert.ok(f.dialog()); assert.equal(f.pushes.length, 0);
});
test("programmatic refresh and filter actions are guarded, but harmless local actions can proceed", () => {
  const f = fixture(); let actions = 0;
  f.context.requestAction(() => actions++); assert.equal(actions, 0); f.dialog().onCancel(); assert.equal(actions, 0);
  f.context.requestAction(() => actions++); f.dialog().onConfirm(); assert.equal(actions, 1);
  f.context.requestAction(() => actions++, false); assert.equal(actions, 2);
});
test("pending mutations block navigation and unload; history returns to the protected route", () => {
  const busy = fixture({ busy: true }); let actions = 0;
  busy.context.requestAction(() => actions++); assert.equal(actions, 0); assert.equal(busy.state[1], null);
  const unload = { preventDefault() { this.prevented = true; } }; busy.windowEvents.get("beforeunload")(unload); assert.equal(unload.prevented, true); assert.equal(unload.returnValue, "");
  const f = fixture(); f.location.href = "https://mail.example.test/ko/admin/groups"; f.windowEvents.get("popstate")();
  assert.equal(f.location.href, "https://mail.example.test/ko/admin/users"); assert.equal(f.pushes.length, 0); f.dialog().onConfirm(); assert.deepEqual(f.pushes, ["/ko/admin/groups"]);
});
test("the draft registry contains only flags and independent forms are removed independently", () => {
  const f = fixture();
  f.context.register("other", { dirty: true, busy: false }); f.context.register("form", null);
  assert.deepEqual(JSON.parse(JSON.stringify(f.state[0])), { other: { dirty: true, busy: false } });
  f.context.register("other", null); assert.deepEqual(JSON.parse(JSON.stringify(f.state[0])), {});
  const source = readFileSync(new URL("../components/admin/AdminDraftGuard.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|window.confirm/); assert.match(source, /<ConfirmDialog tone="warning"/);
});

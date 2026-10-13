import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { SystemErrorToasts } from "../lib/system-error-toasts.ts";

const require = createRequire(import.meta.url);
function compile(path, dependencies) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("exports", "require", code)(exports, name => dependencies[name] ?? require(name));
  return exports;
}
for (const mobile of [false, true]) {
  const effects = [], pushed = [], dismissed = [];
  let actions = 0;
  const notice = compile("components/toast/SystemErrorNotice.tsx", {
    react: { ...React, useSyncExternalStore: () => mobile, useRef: current => ({ current }), useEffect: effect => effects.push(effect) },
    "@/context/toast-context": { useToast: () => ({ acquireSystemError: (message, options) => { pushed.push(["error", message, options]); return () => dismissed.push("error-id"); } }) },
  });
  const element = notice.SystemErrorNotice({ message: "Server unavailable", actionLabel: "Retry", onAction: () => actions++ });
  assert.equal(renderToStaticMarkup(element), "");
  const cleanup = effects.map(effect => effect());
  assert.equal(pushed.length, 1);
  {
    assert.equal(pushed[0][0], "error");
    assert.equal(pushed[0][1], "Server unavailable");
    pushed[0][2].onAction();
    assert.equal(actions, 1);
    cleanup.forEach(fn => fn?.());
    assert.deepEqual(dismissed, ["error-id"]);
  }
}
const stack = compile("components/toast/ToastStack.tsx", {
  react: { ...React, useSyncExternalStore: () => true },
  "react-dom": { createPortal: children => children },
  "next-intl": { useTranslations: () => key => key },
  "@/context/toast-context": { useToast: () => ({ toasts: [{ id: "test", tone: "error", title: "Failure" }], dismiss() {} }) },
  "@/components/ui/Toast": { Toast: () => React.createElement("div", null, "Failure") },
});
globalThis.document = { body: {} };
const html = renderToStaticMarkup(React.createElement(stack.ToastStack));
delete globalThis.document;
assert.match(html, /fixed bottom-\[calc\(4\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
assert.match(html, /z-\(--layer-toast\)/);
assert.match(html, /lg:bottom-4/);
const toast = readFileSync(new URL("../components/ui/Toast.tsx", import.meta.url), "utf8");
assert.match(toast, /tone === "error" \|\| tone === "warning" \? "alert" : "status"/);
assert.match(toast, /bg-\(--status-danger-bg\)/);
assert.doesNotMatch(toast, /className="truncate/);
console.log("mobile system errors: responsive toast, retry, recovery cleanup, safe-area clearance and error styling passed");

// Sidebar failures are toast-only even in compact/desktop layouts; only the
// persistent sidebar owns them, so opening a drawer cannot double-notify.
const effects = [], pushed = [];
const noticeOnly = compile("components/toast/SystemErrorNotice.tsx", {
  react: { ...React, useSyncExternalStore: () => false, useRef: current => ({ current }), useEffect: effect => effects.push(effect) },
  "@/context/toast-context": { useToast: () => ({ acquireSystemError: (...args) => { pushed.push(args); return () => {}; } }) },
});
assert.equal(noticeOnly.SystemErrorNotice({ message: "Failure", toastOnly: true }), null);
effects.forEach(effect => effect());
assert.equal(pushed.length, 1);
const sidebar = readFileSync(new URL("../components/layout/WorkspaceSidebar.tsx", import.meta.url), "utf8");
assert.match(sidebar, /mailboxError && !mobile \? <SystemErrorNotice toastOnly/);

const { Toast } = compile("components/ui/Toast.tsx", {
  "@/types/overlay": {},
  "./IconButton": { IconButton: ({ label, onClick }) => React.createElement("button", { "aria-label": label, onClick }, "Close") },
});
const styles = new Set();
for (const tone of ["success", "info", "warning", "error", "notice", "undo"]) {
  const element = Toast({ title: "Synthetic message", tone, toneLabel: `type-${tone}`, actionLabel: "Retry", onAction() {}, onDismiss() {} });
  const markup = renderToStaticMarkup(element);
  assert.match(markup, new RegExp(`data-toast-tone="${tone}"`));
  assert.ok(markup.includes(`type-${tone}`));
  assert.equal(element.props.role, ["error", "warning"].includes(tone) ? "alert" : "status");
  styles.add(element.props.className);
  assert.match(markup, /min-h-11/);
}
assert.equal(styles.size, 6);
const context = readFileSync(new URL("../context/toast-context.tsx", import.meta.url), "utf8");
assert.match(context, /warning: 8000/);
assert.match(context, /notice: 6000/);
assert.match(context, /error: null/);
console.log("toast variants: distinct colors, icons, localized labels, severity roles, persistent errors and sidebar single owner passed");

const notifications = [], removals = [], retries = [];
const registry = new SystemErrorToasts((message, action) => { notifications.push({ message, action }); return `id-${notifications.length}`; }, id => removals.push(id));
const releaseSidebar = registry.acquire("Unavailable", { actionLabel: "Retry", onAction: () => retries.push("sidebar") });
const releasePage = registry.acquire("Unavailable", { actionLabel: "Retry", onAction: () => retries.push("page") });
assert.equal(notifications.length, 1);
notifications[0].action.onAction(); assert.deepEqual(retries, ["sidebar"]);
releaseSidebar(); assert.equal(removals.length, 0);
notifications[0].action.onAction(); assert.deepEqual(retries, ["sidebar", "page"]);
releasePage(); assert.deepEqual(removals, ["id-1"]);
releasePage(); assert.equal(removals.length, 1);
const releaseNew = registry.acquire("Unavailable", {});
assert.equal(notifications.length, 2);
const releaseOther = registry.acquire("Permission denied", {});
assert.equal(notifications.length, 3);
releaseNew(); releaseOther();
for (const path of ["components/files/LiveFiles.tsx", "components/calendar/LiveCalendar.tsx", "components/contacts/LiveContacts.tsx", "components/mail/LiveSharedMailboxes.tsx", "components/mail/ScheduledSubmissions.tsx", "components/layout/LiveSessionUnavailable.tsx"]) {
  assert.match(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), /SystemErrorNotice/);
}
console.log("system errors: desktop/mobile toast only, shared ownership, retry handover, recovery, repeated episodes and page coverage passed");

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";

function compile(file, modules) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Intl, Date, AbortController, AbortSignal,
    require: name => { assert.ok(name in modules, name); return modules[name]; },
    fetch: () => { throw Error("Initial SSR must not fetch from the browser"); },
  });
  return exports;
}
const snapshot = {
  mfa: { totpEnabled: false, recoveryCodesRemaining: 0, enrollmentAvailable: false },
  sessions: [{ id: "synthetic-session", createdAt: "2026-10-13T00:00:00Z", lastUsedAt: "2026-10-13T00:00:00Z", expiresAt: "2026-10-14T00:00:00Z", userAgent: "Synthetic <device>", remoteAddress: null, current: true }],
  events: [{ id: 1, occurredAt: "2026-10-13T00:00:00Z", eventType: "synthetic_<event>", remoteAddress: null }],
};
test("security initial loader skips absent credentials and returns only projected state or closed errors", async () => {
  let token = null, result = snapshot, calls = 0;
  class ServiceError extends Error { constructor(status) { super(status); this.status = status; } }
  const { initialLiveSecurity } = compile("../lib/tastemail/security-initial.ts", {
    "server-only": {}, react: { cache: fn => fn }, "./session": { tastemailSessionToken: async () => token },
    "./security": { SecurityServiceError: ServiceError, loadLiveSecurity: async value => { calls++; assert.equal(value, "synthetic-token"); if (result instanceof Error) throw result; return result; } },
  });
  assert.equal((await initialLiveSecurity()).status, "unauthorized"); assert.equal(calls, 0);
  token = "synthetic-token";
  const ready = await initialLiveSecurity(); assert.equal(ready.snapshot, snapshot); assert.equal(ready.status, "ready");
  assert.ok(!JSON.stringify(ready).includes(token));
  for (const status of ["unauthorized", "forbidden", "rateLimited", "retryable", "unavailable"]) {
    result = new ServiceError(status); const failure = await initialLiveSecurity();
    assert.equal(failure.status, status); assert.equal(failure.snapshot, null);
  }
  result = Error("private diagnostic must not escape");
  assert.equal(JSON.stringify(await initialLiveSecurity()), '{"status":"retryable","snapshot":null}');
});
test("security SSR renders existing data in ten locales without loading flash or duplicate mount GET", () => {
  for (const locale of ["ko","en","de","es","fr","it","pt","ja","zh","zh-hant"]) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const effects = [];
    const { LiveSecurity } = compile("../components/settings/LiveSecurity.tsx", {
      react: { ...React, useEffect: fn => effects.push(fn) }, "react/jsx-runtime": jsx,
      "next-intl": { useLocale: () => locale, useTranslations: namespace => createTranslator({ locale, messages, namespace }) },
      "@/components/layout/WorkspaceLayout": { WorkspaceLayout: ({ children }) => children },
      "@/components/overlay/ConfirmDialog": { ConfirmDialog: () => null },
      "@/components/toast/SystemErrorNotice": { SystemErrorNotice: ({ message }) => React.createElement("p", null, message) },
      "@/context/toast-context": { useToast: () => ({}) },
      "@/context/settings-context": { useSettings: () => ({ saved: { locale: { timezone: "Asia/Seoul" } } }) },
      "@/lib/tastemail/client-session-status": { clientMailFailure() {}, clientMutationFailure() {} },
      "./SettingsHeaderTitle": { SettingsHeaderTitle: () => null }, "./LiveMfaEnrollment": { LiveMfaEnrollment: () => null },
    });
    const html = renderToStaticMarkup(React.createElement(LiveSecurity, { initial: { status: "ready", snapshot } }));
    assert.ok(html.includes("Synthetic &lt;device&gt;")); assert.ok(html.includes("synthetic_&lt;event&gt;"));
    assert.ok(!html.includes(messages.liveService.loading));
    assert.ok(html.includes(new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(snapshot.sessions[0].lastUsedAt))));
    effects.forEach(effect => effect());
    for (const status of ["unauthorized","forbidden","rateLimited","retryable","unavailable"]) {
      effects.length = 0;
      const failure = renderToStaticMarkup(React.createElement(LiveSecurity, { initial: { status, snapshot: null } }));
      const escaped = renderToStaticMarkup(React.createElement("span", null, messages.liveService[status])).slice(6, -7);
      assert.ok(failure.includes(escaped)); assert.ok(!failure.includes("Synthetic"));
      effects.forEach(effect => effect());
    }
  }
});
test("both security routes and the settings accordion receive authenticated initial state", async () => {
  const initial = { status: "ready", snapshot };
  for (const path of ["../app/[locale]/(workspace)/settings/security/page.tsx", "../app/[locale]/(workspace)/security/page.tsx"]) {
    const { default: Page } = compile(path, {
      "react/jsx-runtime": jsx, "@/components/settings/LiveSecurity": { LiveSecurity: () => null },
      "@/lib/tastemail/security-initial": { initialLiveSecurity: async () => initial },
    });
    assert.equal((await Page()).props.initial, initial);
  }
  let calls = 0;
  const { default: Landing } = compile("../app/[locale]/(workspace)/settings/page.tsx", {
    "react/jsx-runtime": jsx, "@/components/settings/SettingsLanding": { SettingsLanding: () => null },
    "next/navigation": { redirect: () => { throw Error("redirect"); } },
    "@/lib/settings-navigation": { SETTINGS_NAV: [{ key: "security" }] },
    "@/lib/tastemail/security-initial": { initialLiveSecurity: async () => { calls++; return initial; } },
  });
  const props = { params: Promise.resolve({ locale: "ko" }), searchParams: Promise.resolve({}) };
  assert.equal((await Landing(props)).props.initialSecurity, initial); assert.equal(calls, 1);
  await assert.rejects(Landing({ ...props, searchParams: Promise.resolve({ tab: "security" }) }), /redirect/);
  assert.equal(calls, 1);
  assert.match(readFileSync(new URL("../components/settings/SettingsLanding.tsx", import.meta.url), "utf8"), /<LiveSecurity embedded initial=\{initialSecurity\}/);
});

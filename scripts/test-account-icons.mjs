import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToString } from "react-dom/server";
import { mailboxIconEntry } from "../lib/mailbox-icon-catalog.mjs";
import * as catalog from "../lib/mailbox-icon-catalog.mjs";
import { accountIconKey } from "../lib/mailbox-icon-preferences.ts";

const source = readFileSync(new URL("../components/mail/AccountIcon.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
let account = " First@example.test ", initial = {}, notifications = 0;
let server = { required: false, matched: false, preferences: {}, update: async () => false };
let avatarImage = null;
const storage = new Map(), mirrored = [];
const browser = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, dispatchEvent: () => notifications++ };
const modules = {
  react: { useEffect: () => {}, useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
  "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
  "next-intl": { useTranslations: () => key => key },
  "lucide-react": { UserRound: "UserRound", Users: "Users" },
  "@/context/mailbox-icon-context": { useInitialMailboxIcons: () => initial, useServerMailboxIcons: () => server },
  "@/context/mail-context": { useMail: () => ({ accountAddress: account }) },
  "@/context/image-assets-context": { useImageAssets: () => ({ avatar: avatarImage }) },
  "@/components/ui/Avatar": { Avatar: "Avatar" },
  "./MailboxIconPicker": { MailboxIconPickerTrigger: "Picker" },
  "@/lib/mailbox-icon-catalog.mjs": { mailboxIconEntry },
  "@/lib/mailbox-icon-preferences": { accountIconKey, mirrorMailboxIconPreferences: update => mirrored.push(update) },
  "next/dynamic": { default: () => "DynamicGlyph" },
  "./MailboxGlyph": { default: "DynamicGlyph" },
  "./IconPreferenceRecovery": { IconPreferenceRecovery: "Recovery" },
};
function load(realReact = false) {
  const exports = {};
  new Function("require", "exports", "window", compiled)(key => realReact && key === "react" ? React : realReact && key === "react/jsx-runtime" ? jsxRuntime : modules[key], exports, realReact ? undefined : browser);
  return exports.AccountIcon;
}
const AccountIcon = load();
const profile = () => AccountIcon({ name: "First", editable: true });
const shared = id => AccountIcon({ name: "Shared", targetAccountId: id, editable: true });
avatarImage = { revision: 1, image: { url: "/api/mail/images/avatar/00000000-0000-4000-8000-000000000001" } };
assert.equal(profile().props.children.type, "Avatar");
assert.equal(profile().props.children.props.src, avatarImage.image.url);
assert.notEqual(shared("shared-a").props.children.type, "Avatar", "Own avatar is never shown for a shared account");
avatarImage = null;
assert.equal(profile().props.value, "default");
profile().props.onChange("emoji:grinning");
assert.equal(profile().props.value, "emoji:grinning");
assert.equal(storage.get(accountIconKey("first@example.test")), "emoji:grinning");
shared("shared-a").props.onChange("phosphor:acorn");
assert.equal(shared("shared-a").props.value, "phosphor:acorn");
assert.equal(shared("shared-b").props.value, "default");
assert.equal(profile().props.value, "emoji:grinning");
account = "second@example.test";
assert.equal(profile().props.value, "default");
assert.equal(shared("shared-a").props.value, "default");
profile().props.onChange("lucide:heart");
account = "first@example.test";
assert.equal(profile().props.value, "emoji:grinning");
const count = notifications;
profile().props.onChange("emoji:<script>");
assert.equal(notifications, count);
assert.equal(profile().props.value, "emoji:grinning");
shared("shared-a").props.onChange("default");
assert.equal(shared("shared-a").props.value, "default");
assert.deepEqual(mirrored.at(-1), { [accountIconKey(account, "shared:shared-a")]: "default" });
account = "second@example.test";
assert.equal(profile().props.value, "lucide:heart");
account = null;
assert.notEqual(profile().type, "Picker");
account = "first@example.test";
initial = { [accountIconKey(account)]: "emoji:grinning", [accountIconKey(account, "shared:shared-a")]: "emoji:heart" };
const ServerIcon = load(true);
assert.match(renderToString(React.createElement(ServerIcon, { name: "First" })), /😀/u);
assert.match(renderToString(React.createElement(ServerIcon, { name: "Shared", targetAccountId: "shared-a" })), /❤️/u);
account = "second@example.test";
assert.doesNotMatch(renderToString(React.createElement(ServerIcon, { name: "Second" })), /😀|❤️/u);
console.log("account icons: owner/target isolation, picker persistence/reset, invalid input, unauthenticated guard and real SSR emoji passed");
account = "first@example.test";
let serverWrites = [];
server = { required: true, matched: true, preferences: { [accountIconKey(account)]: "emoji:100" }, update: async changes => { serverWrites.push(changes); return false; } };
assert.equal(profile().props.value, "emoji:100", "authoritative server setting wins over stale local choice");
const mirrorCount = mirrored.length;
assert.equal(await profile().props.onChange("lucide:mail"), false);
assert.equal(profile().props.value, "emoji:100", "failed server save keeps old icon");
assert.equal(mirrored.length, mirrorCount, "server writes must not fall back to browser persistence");
assert.deepEqual(serverWrites[0], [{ target: { type: "profile" }, icon: "lucide:mail" }]);
assert.match(renderToString(React.createElement(ServerIcon, { name: "First" })), /💯/u);
await shared("00000000-0000-0000-0000-000000000002").props.onChange("emoji:heart");
assert.equal(serverWrites.at(-1)[0].target.type, "sharedAccount");
server = { ...server, matched: false, update: async () => false };
assert.equal(await profile().props.onChange("lucide:mail"), false);
assert.equal(mirrored.length, mirrorCount);

// Render the actual provider/hook and actual client controller without invoking a network.
const cache = new Map();
function loadProviderModule(file) {
  const path = resolve(file);
  if (cache.has(path)) return cache.get(path);
  const exported = {}; cache.set(path, exported);
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", code)(name => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name.endsWith("mailbox-icon-catalog.mjs")) return catalog;
    const target = name.startsWith("@/") ? resolve(name.slice(2)) : resolve(dirname(path), name);
    for (const extension of [".ts", ".tsx"]) {
      try { readFileSync(`${target}${extension}`); } catch { continue; }
      return loadProviderModule(`${target}${extension}`);
    }
    throw new Error(`Unexpected provider import ${name}`);
  }, exported);
  return exported;
}
const context = loadProviderModule("context/mailbox-icon-context.tsx");
const authoritative = { revision: 0, catalogVersion: "gxmail-20261008-lucide1.41.0-phosphor2.1.10-emoji1.2.1", availableTargets: [{ type: "profile" }], preferences: [{ target: { type: "profile" }, icon: "emoji:100" }], defaultIcon: "default", defaultDisplayKind: "mailbox" };
let probed;
function Probe({ owner }) {
  const state = context.useServerMailboxIcons(owner);
  probed = state;
  return React.createElement("i", { "data-matched": state.matched, "data-required": state.required }, state.preferences[accountIconKey(owner)] ?? "absent");
}
function providerMarkup(owner, preferences = authoritative) {
  return renderToString(React.createElement(context.MailboxIconProvider, { initialPreferences: {}, initialServer: { account: "first@example.test", preferences }, serverRequired: true }, React.createElement(Probe, { owner })));
}
assert.match(providerMarkup("first@example.test"), /data-matched="true"[^>]*>emoji:100/);
assert.match(providerMarkup("second@example.test"), /data-matched="false"[^>]*>absent/);
assert.match(providerMarkup("first@example.test", { ...authoritative, preferences: [] }), />default</);
console.log("Server profile/shared icons: actual provider SSR, authoritative defaults, account isolation, failed acknowledgment and no local save fallback passed.");

const { IconPreferencesClient } = loadProviderModule("lib/icon-preferences-client.ts");
const originalUpdate = IconPreferencesClient.prototype.update;
const resetWrites = [];
IconPreferencesClient.prototype.update = async function(changes) { resetWrites.push(changes); return false; };
const mixed = { ...authoritative, availableTargets: [...authoritative.availableTargets, { type: "system", role: "inbox" }, { type: "mailbox", id: "00000000-0000-0000-0000-000000000003" }],
  preferences: [...authoritative.preferences, { target: { type: "system", role: "inbox" }, icon: "emoji:100" }, { target: { type: "mailbox", id: "00000000-0000-0000-0000-000000000003" }, icon: "emoji:heart", displayKind: "folder" }] };
providerMarkup("first@example.test", mixed);
assert.equal(await probed.resetSystemIcons(), false);
assert.deepEqual(resetWrites[0], [{ target: { type: "system", role: "inbox" }, icon: "default" }], "system reset must not erase profile, personal icons or folder kinds");
providerMarkup("second@example.test", mixed);
assert.equal(await probed.resetSystemIcons(), false);
assert.equal(resetWrites.length, 1);
providerMarkup("first@example.test", authoritative);
assert.equal(await probed.resetSystemIcons(), true, "no system overrides needs no mutation");
assert.equal(resetWrites.length, 1);
IconPreferencesClient.prototype.update = originalUpdate;
console.log("system reset: actual provider target isolation, kind preservation, acknowledgment and no-op passed");
const originalRefresh = IconPreferencesClient.prototype.refresh;
let reads = 0;
IconPreferencesClient.prototype.refresh = async function() { reads++; return true; };
providerMarkup("first@example.test");
assert.equal(await probed.refresh(), true);
assert.equal(reads, 1);
providerMarkup("second@example.test");
assert.equal(await probed.refresh(), null, "foreign account must refresh authenticated SSR, not the old controller");
assert.equal(reads, 1);
IconPreferencesClient.prototype.refresh = originalRefresh;
console.log("Provider recovery: matched controller read and foreign-owner isolation passed");

// Exercise actual provider prop updates and layout effects without remounting or a browser/network.
let retained, initialized = false, finishProviderWrite;
const layoutEffects = [], instances = [];
class HarnessController extends IconPreferencesClient {
  constructor(owner, preferences) {
    super(owner, preferences, () => new Promise(done => { finishProviderWrite = done; }));
    instances.push(this);
  }
}
const providerCode = ts.transpileModule(readFileSync("context/mailbox-icon-context.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const harnessModules = {
  react: { ...React, useState: init => { if (!initialized) { initialized = true; retained = init(); } return [retained, next => { retained = next; }]; },
    useEffect() {}, useLayoutEffect: fn => layoutEffects.push(fn), useMemo: fn => fn(), useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
  "react/jsx-runtime": jsxRuntime,
  "@/lib/icon-preferences-client": { IconPreferencesClient: HarnessController },
  "@/lib/mailbox-icon-snapshot": loadProviderModule("lib/mailbox-icon-snapshot.ts"),
};
const harness = {};
new Function("require", "exports", providerCode)(name => { if (!(name in harnessModules)) throw new Error(name); return harnessModules[name]; }, harness);
const renderProvider = preferences => harness.MailboxIconProvider({ initialPreferences: {}, initialServer: { account: "first@example.test", preferences }, serverRequired: true, children: null });
const flushLayout = () => { while (layoutEffects.length) layoutEffects.shift()(); };
renderProvider(authoritative); flushLayout();
renderProvider({ ...authoritative, revision: 2 });
assert.equal(instances.length, 1, "same-account refresh must not remount the provider/controller");
assert.equal(retained.getSnapshot().snapshot.revision, 0, "no external-store publication during render");
flushLayout();
assert.equal(retained.getSnapshot().snapshot.revision, 2, "layout effect reconciles before painting");
const providerWrite = retained.update([{ target: { type: "profile" }, icon: "emoji:grinning" }]);
renderProvider({ ...authoritative, revision: 4 }); flushLayout();
assert.equal(retained.getSnapshot().snapshot.revision, 2, "prop refresh does not replace an in-flight write");
finishProviderWrite(Response.json({ ...authoritative, revision: 3, preferences: [{ target: { type: "profile" }, icon: "emoji:grinning" }] }));
assert.equal(await providerWrite, true);
renderProvider({ ...authoritative, revision: 4 }); flushLayout();
assert.equal(retained.getSnapshot().snapshot.revision, 4, "ready-state reconciliation can proceed after acknowledgment");
renderProvider(authoritative); flushLayout();
assert.equal(retained.getSnapshot().snapshot.revision, 4, "older server props never roll back newer data");
console.log("Actual provider updates: retained controller, layout timing, write exclusion and stale-prop protection passed.");
initialized = false;
harness.MailboxIconProvider({ initialPreferences: {}, initialServer: null, serverRequired: true, children: null });
flushLayout();
assert.equal(retained, null);
renderProvider(authoritative);
assert.ok(retained, "new SSR props initialize a previously missing controller");
flushLayout();
assert.equal(retained.getSnapshot().account, "first@example.test");
assert.equal(retained.getSnapshot().status, "ready", "manual SSR refresh can recover an initially missing controller");
console.log("Initial SSR failure recovery: successful refreshed snapshot initializes the controller passed.");

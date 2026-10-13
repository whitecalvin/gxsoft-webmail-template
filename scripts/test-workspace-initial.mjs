import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { initialCalendarRange } from "../lib/workspace-initial-data.ts";

const source = readFileSync(new URL("../lib/tastemail/workspace-initial.ts", import.meta.url), "utf8");
let token = "account-a", fail = false;
let rsc = false, sessionReads = 0;
const calls = [];
const exports = {};
const loader = name => async value => { calls.push([name, value]); if (fail) throw new Error("forbidden"); return [{ id: `${name}:${value}` }]; };
new Function("exports", "require", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports, name => {
  if (name === "server-only") return {};
  if (name === "next/headers") return { headers: async () => new Headers(rsc ? { rsc: "1" } : {}) };
  if (name === "./server") return { tastemailRequest: async (_path, value) => Response.json({ username: `${value}@example.test` }) };
  if (name === "./session") return { tastemailSessionToken: async () => { sessionReads++; return token; } };
  if (name === "./session-contract") return { validLiveJmapSession: value => typeof value?.username === "string" };
  if (name === "./calendar") return { loadLiveEvents: loader("events") };
  if (name === "./contacts") return { loadLiveContacts: loader("contacts") };
  if (name === "./shared-mailboxes") return { loadLiveSharedMailboxes: loader("shared") };
  if (name === "../workspace-initial-data") return { initialCalendarRange };
  throw new Error(name);
});
assert.equal((await exports.loadInitialCalendar()).username, "account-a@example.test");
assert.equal((await exports.loadInitialContacts())[0].id, "contacts:account-a");
token = "account-b";
assert.equal((await exports.loadInitialSharedMailboxes())[0].id, "shared:account-b");
fail = true; assert.equal(await exports.loadInitialContacts(), null);
const count = calls.length;
token = null; assert.equal(await exports.loadInitialContacts(), null);
assert.equal(calls.length, count);
token = "account-a"; fail = false; rsc = true;
const sessionCount = sessionReads;
for (const load of [exports.loadInitialCalendar, exports.loadInitialContacts, exports.loadInitialSharedMailboxes]) {
  assert.equal(await load(), null);
}
assert.equal(calls.length, count, "internal navigation must not repeat server data queries");
assert.equal(sessionReads, sessionCount, "internal navigation leaves authentication to CSR APIs");
rsc = false;
assert.equal((await exports.loadInitialContacts())[0].id, "contacts:account-a", "full reload still provides SSR data");
const range = initialCalendarRange(new Date("2026-09-30T16:00:00Z"));
assert.equal(range.date, "2026-10-01"); assert.equal(range.month, "2026-10");
assert.ok(Date.parse(range.from) < Date.parse("2026-09-17T00:00:00Z"));
assert.ok(Date.parse(range.to) > Date.parse("2026-11-15T00:00:00Z"));

for (const [file, bindings] of [
  ["components/calendar/LiveCalendar.tsx", { initialRequestKey: { current: "2026-10|0" }, key: "2026-10|0" }],
  ["components/contacts/LiveContacts.tsx", { initialContacts: [], attempt: 0 }],
  ["components/mail/LiveSharedMailboxes.tsx", { initialItems: [], attempt: 0 }],
]) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  const visit = node => { if (!effect && ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect") effect = node.arguments[0]; ts.forEachChild(node, visit); };
  visit(tree); assert.ok(effect);
  const compiled = ts.transpileModule(`const handler = ${effect.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  // No remaining bindings are necessary: SSR data must return before any fetch.
  new Function(...Object.keys(bindings), `${compiled}; handler();`)(...Object.values(bindings));
}
for (const route of ["calendar", "contacts", "mailboxes"]) {
  const page = readFileSync(new URL(`../app/[locale]/(workspace)/${route}/page.tsx`, import.meta.url), "utf8");
  assert.doesNotMatch(page, /use client/); assert.match(page, /await loadInitial/);
}
console.log("workspace SSR/CSR: initial HTML data, CSR navigation, account isolation, fallback and no duplicate initial fetch passed");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as shortcuts from "../lib/mail-shortcuts.ts";

const source = readFileSync(new URL("../lib/user-settings.ts", import.meta.url), "utf8");
const exports = {};
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function("exports", "require", compiled)(exports, name => {
  if (name === "./mail-image-policy") return { normalizeImageSenders: () => ({}) };
  if (name === "./mail-shortcuts") return shortcuts;
  throw new Error(name);
});
const { DEFAULT_USER_SETTINGS, mergeStoredSettings } = exports;
assert.equal(DEFAULT_USER_SETTINGS.inbox.showMailboxCounts, true);
assert.equal(DEFAULT_USER_SETTINGS.inbox.showMailboxStorage, true);
for (const counts of [true, false]) for (const storage of [true, false]) {
  const roundTrip = JSON.parse(JSON.stringify({ version: 1, inbox: { showMailboxCounts: counts, showMailboxStorage: storage } }));
  const merged = mergeStoredSettings(roundTrip);
  assert.equal(merged.inbox.showMailboxCounts, counts);
  assert.equal(merged.inbox.showMailboxStorage, storage);
}
for (const inbox of [{}, { showMailboxCounts: "false", showMailboxStorage: null }]) {
  const migrated = mergeStoredSettings({ version: 1, inbox });
  assert.equal(migrated.inbox.showMailboxCounts, true);
  assert.equal(migrated.inbox.showMailboxStorage, true);
}
const sidebar = readFileSync(new URL("../components/layout/WorkspaceSidebar.tsx", import.meta.url), "utf8");
assert.match(sidebar, /saved.inbox.showMailboxCounts \?/);
assert.match(sidebar, /saved.inbox.showMailboxStorage && storage/);
console.log("mailbox display settings: independent persistence, legacy defaults, boolean validation and built-in gates passed");

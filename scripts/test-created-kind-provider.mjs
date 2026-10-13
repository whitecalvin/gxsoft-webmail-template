import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../context/mailbox-icon-context.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const account = "owner@test.invalid", id = "11111111-1111-4111-8111-111111111111";
let state, mode = "ready", reads = 0, writes = [];
const base = () => ({ account, status: "ready", snapshot: { availableTargets: [{ type: "mailbox", id }], preferences: [{ target: { type: "mailbox", id }, icon: "emoji:100" }] } });
state = base();
const controller = { subscribe() {}, getSnapshot: () => state, refresh: async () => {
  reads++;
  if (mode === "switch") state = { ...state, account: "foreign@test.invalid" };
  if (mode === "missing") state = { ...state, snapshot: { ...state.snapshot, availableTargets: [] } };
  if (mode === "freshIcon") state = { ...state, snapshot: { ...state.snapshot, preferences: [{ target: { type: "mailbox", id }, icon: "lucide:heart" }] } };
  return mode !== "failed";
}, update: async changes => { writes.push(changes); return true; } };
const mocks = {
  react: { createContext: () => ({}), useContext: () => ({ controller, required: true }), useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useMemo: fn => fn() },
  "react/jsx-runtime": {}, "@/lib/icon-preferences-client": {}, "@/lib/mailbox-icon-snapshot": { snapshotMailboxIconPreferences: () => ({}) },
};
const exported = {};
new Function("require", "exports", code)(name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; }, exported);
assert.equal(await exported.useServerMailboxIcons("foreign@test.invalid").saveCreatedKind(id, "folder"), false);
assert.equal(reads, 0);
assert.equal(await exported.useServerMailboxIcons(account).saveCreatedKind(id, "folder"), true);
assert.deepEqual(writes, [[{ target: { type: "mailbox", id }, icon: "emoji:100", displayKind: "folder" }]]);
mode = "freshIcon";
assert.equal(await exported.useServerMailboxIcons(account).saveCreatedKind(id, "mailbox"), true);
assert.equal(writes.at(-1)[0].icon, "lucide:heart", "preserve the fresh concurrent icon choice");
for (mode of ["switch", "missing", "failed"]) {
  state = base(); const before = writes.length;
  assert.equal(await exported.useServerMailboxIcons(account).saveCreatedKind(id, "folder"), false);
  assert.equal(writes.length, before, `${mode}: do not send a type write`);
}
console.log("Created kind provider: read-before-write, owner-switch/access guards, fresh icon preservation and failed refresh tests passed (synthetic).");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../components/settings/IconPreferenceImport.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const account = "synthetic@test.invalid", id = "11111111-1111-4111-8111-111111111111";
const change = { target: { type: "mailbox", id }, icon: "emoji:100", displayKind: "folder" };
const snapshot = { revision: 3, availableTargets: [change.target] };
const states = [], refs = []; let slot = 0, refSlot = 0, calls = 0, finish;
const reads = [], notices = [];
let owner = account, status = "ready", outcome = true;
const server = { required: true, matched: true, status, snapshot, importChoices: async (revision, changes) => {
  assert.equal(revision, 3); assert.deepEqual(changes, [change]); calls++;
  return new Promise(done => { finish = () => done(outcome); });
} };
const jsx = (type, props) => ({ type, props });
const mocks = {
  react: { useId: () => "preview-heading", useEffect() {}, useRef: value => refs[refSlot++] ?? (refs[refSlot - 1] = { current: value }),
    useState: value => { const index = slot++; if (!(index in states)) states[index] = value; return [states[index], next => { states[index] = next; notices.push(next); }]; } },
  "react/jsx-runtime": { jsx, jsxs: jsx }, "react-dom": { createPortal: node => node },
  "next-intl": { useTranslations: () => key => key },
  "@/context/mail-context": { useMail: () => ({ accountAddress: owner, mailboxes: [{ id, name: "Synthetic folder" }] }) },
  "@/context/mailbox-icon-context": { useServerMailboxIcons: () => server },
  "@/lib/icon-preference-import": { planIconPreferenceImport: (accountValue, value, local) => {
    assert.equal(accountValue, account); assert.equal(value, snapshot);
    assert.equal(Object.keys(local).length, 2);
    return { changes: [change], remaining: 1, skipped: 0, blocked: null };
  } },
  "@/lib/mailbox-icon-snapshot": { iconPreferenceKey: (address, target) => `${address}:${target.id}` },
  "@/lib/tastemail/icon-preferences-contract": { iconTargetKey: target => target.id },
  "@/components/ui/Button": { Button: "Button" }, "@/components/overlay/Modal": { Modal: "Modal" },
  "@/components/overlay/DialogActions": { DialogActions: "DialogActions" },
};
const exported = {};
new Function("require", "exports", "window", "document", code)(name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; }, exported,
  { localStorage: { getItem: key => { reads.push(key); return key.startsWith("gxmail:folder-kind") ? "folder" : "emoji:100"; } } }, { body: "body" });
function render() { slot = 0; refSlot = 0; return exported.IconPreferenceImport(); }
const modal = () => render().props.children[3];
const confirm = () => modal().props.children.props.children[3].props.children[0];
assert.equal(reads.length, 0); assert.equal(render().props.children[3], null);
render().props.children[1].props.onClick();
assert.deepEqual(reads, [`${account}:${id}`, `gxmail:folder-kind:v1:synthetic%40test.invalid:${id}`]);
assert.equal(calls, 0, "preview is read-only");
assert.equal(modal().props.children.props.children[2].props.children[0].props.children[0].props.children, "Synthetic folder");
const button = confirm(); button.props.onClick(); button.props.onClick();
assert.equal(calls, 1);
assert.equal(modal().props.dismissible, false);
modal().props.onClose(); assert.notEqual(states[2], null, "pending upload cannot be dismissed");
finish(); await new Promise(done => setImmediate(done));
assert.equal(states[2], null); assert.equal(states[1], "success");
assert.equal(calls, 1, "remaining batch must not upload automatically");
render().props.children[1].props.onClick(); snapshot.revision = 4;
assert.equal(confirm().props.disabled, true);
confirm().props.onClick(); await new Promise(done => setImmediate(done));
assert.equal(states[1], "stale"); assert.equal(calls, 1);
snapshot.revision = 3; render().props.children[1].props.onClick(); owner = "foreign@test.invalid";
assert.equal(render().props.children[3], null, "foreign account cannot see old preview");
owner = account; server.status = "uncertain";
assert.equal(render().props.children[1].props.disabled, true);
server.required = false; assert.equal(render(), null);
console.log("Icon import UI: read-only scoped preview, named targets, explicit acknowledgment, duplicate/dismiss locks, no batch loop, stale revision and owner hiding passed (synthetic only).");

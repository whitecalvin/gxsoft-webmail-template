import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const jsx = (type, props) => ({ type, props });
const id = "11111111-1111-4111-8111-111111111111", account = "synthetic@test.invalid";
const states = [], lock = { current: false }; let index = 0, creates = 0, saves = 0, local = 0, saveResult = false;
const mocks = {
  react: { useId: () => "synthetic", useRef: () => lock, useState: initial => { const slot = index++; if (!(slot in states)) states[slot] = initial; return [states[slot], value => { states[slot] = value; }]; } },
  "react/jsx-runtime": { jsx, jsxs: jsx }, "react-dom": { createPortal: node => node },
  "next-intl": { useTranslations: () => key => key }, "lucide-react": {},
  "@/context/mail-context": { useMail: () => ({ accountAddress: account, mailboxes: [], changeFolder: async () => { creates++; return id; }, folderChangePending: false, folderChangeUncertain: false }) },
  "@/context/mailbox-icon-context": { useServerMailboxIcons: () => ({ required: true, saveCreatedKind: async (mailboxId, kind) => { saves++; assert.equal(mailboxId, id); assert.equal(kind, "folder"); return saveResult; } }) },
  "@/lib/tastemail/personal-folder-contract": { personalFolderInput: input => input },
  "@/lib/personal-folder-tree": { personalFolderTree: () => [], childFolderName: (_parent, name) => name },
  "./PersonalFolderIcon": { rememberCreatedMailboxKind: () => local++ },
  "./InboxContextMenu": { InboxContextMenu: "Menu" }, "@/components/ui/CustomSelect": { CustomSelect: "Select" },
  "@/components/overlay/Modal": { Modal: "Modal" }, "@/components/ui/Button": { Button: "Button" }, "@/components/ui/Input": { Input: "Input" },
  "@/components/overlay/DialogActions": { DialogActions: "DialogActions" },
  "@/components/overlay/ConfirmDialog": { ConfirmDialog: "ConfirmDialog" },
  "@/components/ui/Tooltip": { Tooltip: "Tooltip" },
};
const exported = {};
new Function("require", "exports", "document", compile("../components/mail/PersonalFolderManager.tsx"))(name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; }, exported, { body: {} });
const render = () => { index = 0; return exported.PersonalFolderManager({ compact: false, request: { kind: "folder" } }); };
function find(node, predicate) {
  if (!node) return null;
  if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return null; }
  if (typeof node !== "object") return null;
  return predicate(node) ? node : find(node.props?.children, predicate);
}
find(render(), node => node.type === "Input").props.onChange({ target: { value: "Synthetic folder" } });
const form = find(render(), node => node.type === "form");
form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} });
await new Promise(done => setImmediate(done));
assert.equal(creates, 1); assert.equal(saves, 1); assert.equal(local, 0);
assert.equal(states[4], "pending");
find(render(), node => node.type === "form").props.onSubmit({ preventDefault() {} });
await new Promise(done => setImmediate(done)); assert.equal(creates, 1, "failed kind save must not recreate a confirmed mailbox");
saveResult = true;
const retry = find(render(), node => node.type === "Button" && node.props.children === "retry");
retry.props.onClick(); retry.props.onClick();
await new Promise(done => setImmediate(done));
assert.equal(creates, 1); assert.equal(saves, 2); assert.equal(states[7], null); assert.equal(states[4], "saved");
console.log("Created kind flow: confirmed creation is never repeated, partial failure remains visible, kind-only retry is serialized, no local fallback (synthetic).");

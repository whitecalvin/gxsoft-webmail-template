import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../components/settings/MailboxIconSettings.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
let resetResult = false, writes = 0, localResets = 0;
const pending = { current: false }, notices = [];
const mocks = {
  react: { useRef: () => pending, useState: () => [false, () => {}] },
  "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  "next-intl": { useTranslations: () => key => key },
  "@/context/mail-context": { useMail: () => ({ accountAddress: "synthetic@test.invalid" }) },
  "@/context/mailbox-icon-context": { useServerMailboxIcons: () => ({ required: true, resetMailboxIcons: async () => { writes++; return resetResult; } }) },
  "@/context/toast-context": { useToast: () => ({ success: value => notices.push(["success", value]), error: value => notices.push(["error", value]) }) },
  "@/components/mail/PersonalFolderIcon": { resetMailboxIcons: () => localResets++ },
  "@/components/ui/Button": { Button: "Button" },
  "./SettingsPrimitives": { SettingsPanel: "Panel" },
  "@/components/mail/IconPreferenceRecovery": { IconPreferenceRecovery: "Recovery" },
  "./IconPreferenceImport": { IconPreferenceImport: "Import" },
};
const exported = {};
new Function("require", "exports", code)(name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; }, exported);
const button = () => exported.MailboxIconSettings().props.children[2];
await button().props.onClick();
assert.equal(localResets, 0);
assert.deepEqual(notices, [["error", "resetError"]], "server failure must never acknowledge a local-only reset");
resetResult = true;
const control = button();
await Promise.all([control.props.onClick(), control.props.onClick()]);
assert.equal(writes, 2, "duplicate click cannot resubmit pending reset");
assert.equal(localResets, 1);
assert.deepEqual(notices.at(-1), ["success", "resetSuccess"]);
assert.equal(pending.current, false);
console.log("mailbox icon settings: server acknowledgment, failure preservation and duplicate suppression passed");

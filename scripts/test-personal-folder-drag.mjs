import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as contract from "../lib/tastemail/personal-folder-contract.ts";

const require = createRequire(import.meta.url);
function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, TextEncoder, require: name => name in mocks ? mocks[name] : require(name) });
  return exports;
}
const { folderDropChange } = load("../lib/personal-folder-drag.ts", { "./tastemail/personal-folder-contract": contract });
const id = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const box = (n, name, role = null) => ({ id: id(n), name, role, totalEmails: 0, unreadEmails: 0, usedBytes: 0, quotaBytes: 1024 });
const items = [box(1, "Inbox", "inbox"), box(2, "Work"), box(3, "Clients"), box(4, "Work/Contracts"), box(5, "Work/Contracts/2026"), box(6, "Personal")];
const kinds = { [id(2)]: "folder", [id(3)]: "folder", [id(4)]: "mailbox", [id(6)]: "mailbox" };
const change = (source, target, data = items, types = kinds) => folderDropChange(data, types, id(source), target);
assert.deepEqual(change(4, "Clients"), { operation: "rename", mailboxId: id(4), name: "Clients/Contracts" });
assert.deepEqual(change(2, "Clients"), { operation: "rename", mailboxId: id(2), name: "Clients/Work" });
assert.deepEqual(change(4, ""), { operation: "rename", mailboxId: id(4), name: "Contracts" });
for (const [source, target] of [[2, "Work"], [2, "Work/Contracts/2026"], [4, "Work"], [1, "Clients"], [4, "Inbox"], [2, ""], [4, "Missing"]]) {
  assert.equal(change(source, target), null, `${source} -> ${target}`);
}
assert.equal(change(4, "Personal").name, "Personal/Contracts");
assert.equal(change(2, "Personal").name, "Personal/Work");
assert.equal(change(4, "Personal/Sub", [...items, box(7, "Personal/Sub/Child")]).name, "Personal/Sub/Contracts");
assert.equal(change(4, "Inbox/Sub", [...items, box(7, "Inbox/Sub/Child")]), null);
assert.ok(change(4, "Virtual", [...items, box(7, "Virtual/Child")]));
assert.equal(change(4, "Clients", [...items, box(7, "Clients/Contracts")]), null);
assert.equal(change(2, "Clients", [...items, box(7, "Clients/Work/Contracts/2026")]), null);
assert.equal(change(2, "X".repeat(240), [...items, box(7, "X".repeat(240))]), null);

// Actual component handlers, using synthetic data only: no browser or server writes.
function controller({ write = async () => {}, pending = false, uncertain = false, account = "synthetic@test.invalid", selected = null, nodeIndex = 1, serverIcons = { required: false, matched: false } } = {}) {
  const states = []; const messages = [];
  let stateIndex = 0;
  const jsx = (type, props) => ({ type, props });
  const { PersonalFolderTree } = load("../components/mail/PersonalFolderTree.tsx", {
    react: { useId: () => "synthetic", useEffect() {}, useRef: value => ({ current: value }), useState: value => [stateIndex++ === 0 && selected ? { id: selected, account } : value, next => states.push(next)], useSyncExternalStore: (_subscribe, _client, server) => server() },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next-intl": { useLocale: () => "en", useTranslations: () => key => key },
    "lucide-react": {},
    "@/context/settings-context": { useSettings: () => ({ saved: { inbox: { showMailboxCounts: true, showMailboxStorage: true } } }) },
    "@/context/mail-context": { useMail: () => ({ mailboxes: items, accountAddress: account, changeFolder: write, folderChangePending: pending, folderChangeUncertain: uncertain }) },
    "@/lib/personal-folder-tree": { personalFolderTree: data => [{ path: data[nodeIndex].name, label: data[nodeIndex].name, mailbox: data[nodeIndex], children: [] }] },
    "@/components/ui/Tooltip": { Tooltip: props => props.children },
    "./PersonalFolderIcon": { kindKey: (_account, key) => key },
    "@/lib/personal-folder-drag": { folderDropChange },
    "@/context/mailbox-icon-context": { useInitialMailboxIcons: () => kinds, useServerMailboxIcons: () => serverIcons },
    "@/context/toast-context": { useToast: () => ({ success: message => messages.push(["success", message]), error: message => messages.push(["error", message]) }) },
    "./PersonalFolderManager": {}, "./InboxContextMenu": {},
  });
  const result = PersonalFolderTree({ compact: false, activeId: id(2), onOpen() {}, activeClass: "", idleClass: "" });
  const branch = result.props.children[0][0];
  assert.ok(Array.isArray(result.props.children[0]), "mailbox rows precede the conditional root target so drag start cannot shift them");
  const menu = branch.type(branch.props).props.children[0];
  const row = menu.props.children;
  return { drag: branch.props.drag, handle: row.props.children[0].props.children, row, menu, states, messages };
}
let calls = []; let resolve;
const destination = controller({ selected: id(2), nodeIndex: 2 });
assert.equal(destination.row.props["data-mailbox-kind"], "folder");
assert.equal(controller({ nodeIndex: 5 }).row.props["data-mailbox-kind"], "mailbox");
assert.match(destination.row.props.children[2].props.content, /folder/);
assert.match(controller({ nodeIndex: 5 }).row.props.children[2].props.content, /mailbox/);
assert.equal(controller({ serverIcons: { required: true, matched: true, preferences: {} } }).row.props["data-mailbox-kind"], "mailbox", "server default wins over old local folder kind");
assert.equal(controller({ serverIcons: { required: true, matched: true, preferences: { [id(2)]: "folder" } } }).row.props["data-mailbox-kind"], "folder", "server folder kind drives the tree");
const dropTooltip = destination.row.props.children[3];
assert.equal(dropTooltip.props.content, "drop");
assert.equal(dropTooltip.props.children.props.title, undefined);
assert.equal(destination.handle.props.title, undefined);
const menuCalls = [];
const contextMove = controller({ write: async input => { menuCalls.push(input); } });
const action = contextMove.menu.props.managementActions.find(item => item.label === "move");
assert.ok(action); assert.equal(action.disabled, false);
action.run();
assert.equal(menuCalls.length, 0, "opening move mode does not mutate the server");
assert.equal(contextMove.drag.valid("Personal"), true);
assert.equal(contextMove.drag.valid("Clients"), true);
await contextMove.drag.move("Clients");
assert.equal(menuCalls.length, 1); assert.equal(menuCalls[0].name, "Clients/Work");
assert.equal(controller({ pending: true }).menu.props.managementActions.find(item => item.label === "move").disabled, true);
assert.equal(controller({ uncertain: true }).menu.props.managementActions.find(item => item.label === "move").disabled, true);
const queued = controller({ write: input => { calls.push(input); return new Promise(done => { resolve = done; }); } });
queued.drag.begin(id(4));
assert.equal(queued.drag.valid("Personal"), true);
assert.equal(queued.drag.valid("Clients"), true);
const first = queued.drag.move("Clients");
queued.drag.begin(id(2)); await queued.drag.move("Clients");
assert.equal(calls.length, 1, "pending movement cannot submit twice");
resolve(); await first;
assert.deepEqual(queued.messages, [["success", "moved"]]);
const failure = controller({ write: async () => { throw new Error("mutation_uncertain"); } });
failure.drag.begin(id(2)); await failure.drag.move("Clients");
assert.deepEqual(failure.messages, [["error", "uncertain"]]);
assert.equal(items[1].name, "Work", "no optimistic mailbox mutation on failed receipt");
for (const options of [{ pending: true }, { uncertain: true }, { account: "" }]) {
  const disabled = controller({ ...options, write: () => { throw new Error("must not submit"); } });
  disabled.drag.begin(id(2)); assert.equal(disabled.drag.valid("Clients"), false); await disabled.drag.move("Clients");
}
const event = value => ({ preventDefault() {}, stopPropagation() {}, dataTransfer: { getData: () => value, setData() {} } });
const nativeCalls = [];
const desktop = controller({ write: async input => { nativeCalls.push(input); } });
desktop.row.props.onDragStart(event(id(2)));
desktop.handle.props.onPointerCancel({ pointerType: "mouse" });
assert.equal(desktop.drag.valid("Clients"), true, "native dragstart -> pointercancel must preserve the source");
desktop.drag.drop(event(id(2)), "Clients");
await new Promise(done => setImmediate(done));
assert.equal(nativeCalls.length, 1); assert.equal(nativeCalls[0].name, "Clients/Work");
assert.equal(desktop.row.props.draggable, true, "whole row including icon can start a native drag");
desktop.row.props.onDragStart(event(id(2)));
assert.equal(desktop.drag.valid("Clients"), true); desktop.row.props.onDragEnd();
assert.equal(desktop.drag.valid("Clients"), false);
const unrelated = controller({ write: () => { throw new Error("foreign drag must not submit"); } });
unrelated.drag.begin(id(2)); unrelated.drag.drop(event("foreign"), "Clients");
assert.equal(unrelated.drag.valid("Clients"), false);
const touchCalls = [];
const mobile = controller({ write: async input => { touchCalls.push(input); } });
const pointer = {
  pointerType: "touch", pointerId: 1, clientX: 10, clientY: 10, preventDefault() {},
  currentTarget: { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {}, ownerDocument: { elementFromPoint: () => ({ closest: () => ({ getAttribute: () => "Clients" }) }) } },
};
mobile.drag.pointerDown(pointer, id(4)); mobile.drag.pointerUp(pointer); mobile.drag.clickHandle(id(4));
assert.equal(mobile.drag.valid("Clients"), true, "touch tap retains destination selection");
mobile.drag.pointerDown(pointer, id(4)); mobile.drag.pointerMove({ ...pointer, clientX: 50 }); mobile.drag.pointerUp(pointer);
await new Promise(done => setImmediate(done));
assert.equal(touchCalls.length, 1); assert.equal(touchCalls[0].name, "Clients/Contracts");
mobile.drag.clickHandle(id(4)); assert.equal(mobile.drag.valid("Clients"), false, "post-drag click cannot reopen selection");
mobile.handle.props.onPointerDown(pointer);
mobile.handle.props.onPointerCancel(pointer);
assert.equal(mobile.drag.valid("Clients"), false, "real touch cancellation still clears the source");
const mouseCalls = [];
const mouse = controller({ write: async input => { mouseCalls.push(input); } });
let prevented = false;
const mousePointer = { ...pointer, pointerType: "mouse", button: 0, preventDefault() { prevented = true; } };
assert.equal(mouse.handle.props.draggable, false, "handle uses pointer drag, not competing native drag");
mouse.handle.props.onPointerDown(mousePointer);
assert.equal(prevented, true, "prevent competing native drag at pointerdown");
assert.equal(mouse.drag.valid("Clients"), true, "mouse pointerdown establishes a source without dragstart");
mouse.handle.props.onPointerMove({ ...mousePointer, clientX: 50 });
mouse.handle.props.onPointerUp(mousePointer);
await new Promise(done => setImmediate(done));
assert.equal(mouseCalls.length, 1); assert.equal(mouseCalls[0].name, "Clients/Work");
mouse.handle.props.onClick();
assert.equal(mouse.drag.valid("Clients"), false, "post-drag click cannot restart mouse selection");
mouse.handle.props.onPointerDown(mousePointer); mouse.handle.props.onPointerCancel(mousePointer);
assert.equal(mouse.drag.valid("Clients"), false, "pointer cancellation clears a mouse handle drag");
mouse.handle.props.onPointerDown({ ...mousePointer, button: 2 });
assert.equal(mouse.drag.valid("Clients"), false, "right click never starts dragging");
console.log("folder drag: mailbox destinations allowed, subtree/cycle/collision guards, root/virtual targets, serialized writes, uncertainty and touch handlers passed");

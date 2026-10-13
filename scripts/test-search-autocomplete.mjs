import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../components/search/MailSearchAutocomplete.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("autocomplete.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect, choose;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect") effect = node.arguments[0];
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "choose") choose = node.initializer;
  ts.forEachChild(node, visit);
}
visit(tree); assert.ok(effect); assert.ok(choose);
const compile = node => ts.transpileModule(`const action = ${node.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const effectJs = compile(effect);
function request({ mode = "live", open = true, composing = false, valid = true, key = "current" } = {}) {
  let timer, delay, response, writes = [], urls = [];
  const window = { setTimeout: (callback, ms) => { timer = callback; delay = ms; return 1; }, clearTimeout: () => { timer = null; } };
  const fetch = (url, options) => {
    urls.push({ url, signal: options.signal });
    return new Promise(resolve => { response = resolve; });
  };
  const fn = new Function("mode", "open", "composing", "valid", "term", "key", "window", "fetch", "requireLiveSearchPage", "setResults", `${effectJs}; return action;`)(mode, open, composing, valid, "메일", key, window, fetch, value => value, value => writes.push(value));
  const cleanup = fn();
  return { cleanup, start: () => timer?.(), respond: value => response(value), writes, urls, get delay() { return delay; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
for (const options of [{ composing: true }, { valid: false }, { open: false }]) {
  const pending = request(options); pending.start(); assert.equal(pending.urls.length, 0);
}
const pending = request();
assert.equal(pending.delay, 300); assert.equal(pending.urls.length, 0);
pending.start(); assert.equal(pending.urls.length, 1);
assert.equal(new URL(pending.urls[0].url, "http://test").searchParams.get("q"), "메일");
const messages = Array.from({ length: 8 }, (_, id) => ({ id: String(id), subject: `Subject ${id}`, from: { name: "Sender", email: "sender@example.test" } }));
pending.respond({ ok: true, json: async () => ({ messages }) }); await tick();
assert.equal(pending.writes[0].items.length, 6);
assert.equal(pending.writes[0].key, "current"); pending.cleanup();
const stale = request({ key: "old" }); stale.start(); stale.cleanup();
assert.equal(stale.urls[0].signal.aborted, true);
stale.respond({ ok: true, json: async () => ({ messages }) }); await tick();
assert.equal(stale.writes.length, 0);
const rejected = request(); rejected.start(); rejected.respond({ ok: false }); await tick();
assert.equal(rejected.writes[0].status, "error"); rejected.cleanup();
const chooseJs = compile(choose);
const calls = [];
const action = new Function("term", "mode", "setOpen", "setHighlight", "onSearch", `${chooseJs}; return action;`)("메일", "live", value => calls.push(["open", value]), value => calls.push(["highlight", value]), (...args) => calls.push(["search", ...args]));
action({ id: "message-id" });
assert.deepEqual(calls.at(-1), ["search", "메일", "message-id"]);
action(); assert.deepEqual(calls.at(-1), ["search", "메일", undefined]);
console.log("search autocomplete: debounce, IME guard, cancellation, stale response, six suggestions, errors and result navigation passed");

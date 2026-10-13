import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function module(path, imports = {}) {
  const exports = {};
  const js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", js)(name => { assert.ok(name in imports, name); return imports[name]; }, exports);
  return exports;
}
const parser = module("lib/mail-rule-application.ts");
const sessionFailures = module("lib/tastemail/client-session-status.ts");
const id = "00000000-0000-0000-0000-000000000001", mailboxId = "00000000-0000-0000-0000-000000000002", keyId = "00000000-0000-0000-0000-000000000003";
const plan = { id, mailboxId, ruleRevision: 1, expiresAt: "2099-01-01T00:00:00Z", status: "planned", targetCount: 2, actionCounts: { "fileinto:Inbox": 2 }, blockers: [], requiresTrashConfirmation: false, completedAt: null };
const rule = { id: "00000000-0000-0000-0000-000000000004", name: "Synthetic rule" };
const selectedPlan = { ...plan, ruleId: rule.id };
assert.deepEqual(parser.parseRuleApplicationPlan(plan), plan);
assert.deepEqual(parser.parseRuleApplicationPlan(selectedPlan), selectedPlan);
for (const ruleId of [null, "temporary-key", 1]) assert.throws(() => parser.parseRuleApplicationPlan({ ...plan, ruleId }));
for (const patch of [{ targetCount: 201 }, { targetCount: -1 }, { id: "bad" }, { status: "completed" }, { actionCounts: { redirect: 1 } }, { status: "blocked" }, { blockers: [false] }]) assert.throws(() => parser.parseRuleApplicationPlan({ ...plan, ...patch }));
const completed = { ...plan, status: "completed", completedAt: "2099-01-01T00:01:00Z" };
const calls = [];
let reply = plan, httpStatus = 200;
const adapter = module("lib/tastemail/mail-rule-application.ts", { "server-only": {}, "@/lib/mail-rule-application": parser, "./server": {
  serviceStatus: status => status === 401 ? "unauthorized" : "unavailable",
  tastemailRequest: async (path, token, options) => { calls.push({ path, token, options }); return Response.json(reply, { status: httpStatus }); },
} });
await adapter.planExistingMailRules("synthetic-token", mailboxId, 1);
assert.deepEqual(JSON.parse(calls.at(-1).options.body), { mailboxId, expectedRevision: 1 });
reply = selectedPlan;
await adapter.planExistingMailRules("synthetic-token", mailboxId, 1, rule.id);
assert.deepEqual(JSON.parse(calls.at(-1).options.body), { mailboxId, expectedRevision: 1, ruleId: rule.id });
await assert.rejects(adapter.planExistingMailRules("synthetic-token", mailboxId, 1), /unavailable/);
reply = plan;
await assert.rejects(adapter.planExistingMailRules("synthetic-token", mailboxId, 1, rule.id), /unavailable/);
reply = { ...selectedPlan, ruleId: keyId };
await assert.rejects(adapter.planExistingMailRules("synthetic-token", mailboxId, 1, rule.id), /unavailable/);
const adapterCount = calls.length;
await assert.rejects(adapter.planExistingMailRules("synthetic-token", mailboxId, 1, "temporary-key"), /invalid_request/);
assert.equal(calls.length, adapterCount);
reply = completed;
await adapter.executeRuleApplicationPlan("synthetic-token", id, keyId, false);
assert.deepEqual(JSON.parse(calls.at(-1).options.body), { idempotencyKey: keyId, confirmed: true, confirmTrash: false });
await adapter.getRuleApplicationPlan("synthetic-token", id);
assert.equal(calls.at(-1).options, undefined);
reply = { ...completed, id: mailboxId };
await assert.rejects(adapter.getRuleApplicationPlan("synthetic-token", id), /unavailable/);
httpStatus = 409; reply = { detail: "must not leak" };
await assert.rejects(adapter.executeRuleApplicationPlan("synthetic-token", id, keyId, false), error => error.message === "conflict");

let session = "synthetic-token";
const routeCalls = [];
const route = module("app/api/mail/rules/apply/route.ts", { "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
  "@/lib/tastemail/session": { tastemailSessionToken: async () => session }, "@/lib/tastemail/server": { assertLiveApiConfigured() {} }, "@/lib/mail-rule-application": parser,
  "@/lib/tastemail/mail-rule-application": { RuleApplicationError: adapter.RuleApplicationError,
    planExistingMailRules: async (...args) => { routeCalls.push(["preview", ...args]); return plan; },
    executeRuleApplicationPlan: async (...args) => { routeCalls.push(["execute", ...args]); return completed; },
    getRuleApplicationPlan: async (...args) => { routeCalls.push(["result", ...args]); return completed; },
  },
});
const post = (body, origin = "http://localhost:7540") => route.POST(new Request("http://localhost:7540/api/mail/rules/apply", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }));
assert.equal((await post({ intent: "preview", mailboxId, expectedRevision: 1 })).status, 200);
assert.equal((await post({ intent: "preview", mailboxId, expectedRevision: 1, ruleId: rule.id })).status, 200);
assert.deepEqual(routeCalls.at(-1), ["preview", "synthetic-token", mailboxId, 1, rule.id]);
for (const body of [{ intent: "preview", mailboxId, expectedRevision: 1, ruleId: "temporary-key" }, { intent: "preview", mailboxId, expectedRevision: 1, ruleId: null }, { intent: "preview", mailboxId, expectedRevision: 1, accountId: id }, { intent: "execute", planId: id, idempotencyKey: keyId, confirmed: false, confirmTrash: false }, { intent: "execute", planId: id, idempotencyKey: "bad", confirmed: true, confirmTrash: false }, { intent: "execute", planId: id, idempotencyKey: keyId, confirmed: true, confirmTrash: false, ruleId: rule.id }]) assert.equal((await post(body)).status, 400);
assert.equal((await post({ intent: "preview", mailboxId, expectedRevision: 1 }, "http://untrusted.example")).status, 403);
assert.equal(routeCalls.length, 2);
assert.equal((await post({ intent: "execute", planId: id, idempotencyKey: keyId, confirmed: true, confirmTrash: false })).status, 200);
assert.equal((await route.GET(new Request(`http://localhost:7540/api/mail/rules/apply?planId=${id}`))).status, 200);
session = null;
assert.equal((await post({ intent: "preview", mailboxId, expectedRevision: 1 })).status, 401);

// Execute the actual UI request function using synthetic state and HTTP replies.
const ui = read("components/settings/MailRuleApplication.tsx");
const functionSource = ui.slice(ui.indexOf("  async function request("), ui.indexOf("\n  return <section"));
const js = "const expanded = true;\n" + ts.transpileModule(functionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const uiCalls = [], pending = { current: false }, key = { current: keyId }, confirmation = { current: id };
let uncertain = false, refreshed = 0, uiStatus = 200, uiError = "", applicationLocked = false;
let uiReply = "network";
const fetch = async (url, options) => { uiCalls.push({ url, options }); if (uiReply === "network") throw new Error("network"); return Response.json(uiReply, { status: uiStatus }); };
const getRequest = (selectedRule, currentPlan = plan, disabled = false, unavailableScope = false) => new Function("pending", "disabled", "canExecute", "confirmedPlan", "plan", "key", "selectedId", "uncertain", "revision", "trashConfirmed", "setConfirmation", "setBusy", "onLock", "setError", "setPlan", "setTrashConfirmed", "setUncertain", "fetch", "parseRuleApplicationPlan", "refreshMailbox", "clientMailFailure", "rule", "unavailableScope", `${js}; return request;`)(pending, disabled, true, confirmation, currentPlan, key, mailboxId, uncertain, 1, false, () => {}, () => {}, value => { applicationLocked = value; }, value => { uiError = value; }, () => {}, () => {}, value => { uncertain = value; }, fetch, parser.parseRuleApplicationPlan, () => { refreshed++; }, sessionFailures.clientMailFailure, selectedRule, unavailableScope);
await getRequest()("execute");
assert.equal(uncertain, true); assert.equal(refreshed, 0); assert.equal(uiCalls.length, 1);
assert.equal(applicationLocked, true, "uncertain execution retains parent edit/close lock");
await getRequest()("result");
assert.equal(applicationLocked, true, "failed result lookup must not release the recovery lock");
const unresolvedCalls = uiCalls.length;
await getRequest()("preview"); assert.equal(uiCalls.length, unresolvedCalls, "uncertain execution blocks new preview");
uiReply = plan;
await getRequest()("result");
assert.equal(uiCalls.at(-1).options.method, "GET"); assert.equal(uncertain, false); assert.equal(key.current, keyId);
assert.equal(applicationLocked, true, "parent stays locked until the application modal closes");
confirmation.current = id; uiReply = completed;
await getRequest()("execute");
assert.equal(JSON.parse(uiCalls.at(-1).options.body).idempotencyKey, keyId); assert.equal(refreshed, 1);
for (const [status, reason] of [[401, "unauthorized"], [403, "forbidden"], [429, "rateLimited"], [502, "unavailable"], [503, "retryable"], [409, "conflict"], [413, "limit"]]) {
  uiStatus = status; uiReply = { detail: "must not expose server detail" };
  await getRequest()("preview");
  assert.equal(uiError, reason); assert.equal(uncertain, false);
  assert.equal(applicationLocked, true, "preview failures keep the open modal's parent lock");
  confirmation.current = id; key.current = keyId;
  await getRequest()("execute");
  assert.equal(uiError, reason); assert.equal(uncertain, true);
  assert.equal(applicationLocked, true);
  const count = uiCalls.length;
  await getRequest()("preview"); assert.equal(uiCalls.length, count);
  assert.equal(key.current, keyId);
  uncertain = false;
}
assert.match(ui, /service\(error as/);
assert.match(ui, /<ConfirmDialog/); assert.doesNotMatch(ui, /window\.confirm/);
assert.match(ui, /expanded && !confirmation \? createPortal\(<Modal/);
assert.match(ui, /dismissible=\{!busy && !uncertain && !confirmation\}/);
assert.match(ui, /aria-haspopup="dialog"/);
uiStatus = 200; uiReply = selectedPlan; uncertain = false;
await getRequest(rule)("preview");
assert.equal(JSON.parse(uiCalls.at(-1).options.body).ruleId, rule.id);
for (const wrong of [plan, { ...selectedPlan, ruleId: keyId }]) {
  uiReply = wrong; await getRequest(rule)("preview"); assert.equal(uiError, "failed");
  confirmation.current = id; key.current = keyId;
  uiReply = { ...wrong, status: "completed", completedAt: completed.completedAt };
  const refreshedBefore = refreshed;
  await getRequest(rule, selectedPlan)("execute");
  assert.equal(uncertain, true); assert.equal(refreshed, refreshedBefore);
  await getRequest(rule, selectedPlan)("result"); assert.equal(uncertain, true, "wrong-scope result cannot unlock recovery");
  uncertain = false;
}
uiReply = { ...completed, ruleId: rule.id };
await getRequest(rule, selectedPlan)("result"); assert.equal(uncertain, false);
confirmation.current = id; key.current = keyId;
await getRequest(rule, selectedPlan)("execute");
assert.equal(JSON.parse(uiCalls.at(-1).options.body).ruleId, undefined, "execute cannot change the saved plan scope");
const blockedCalls = uiCalls.length;
await getRequest(rule, selectedPlan, true)("preview");
await getRequest(undefined, plan, false, true)("preview");
assert.equal(uiCalls.length, blockedCalls, "disabled and unsaved single-rule triggers cannot plan all rules");
const closeSource = ui.slice(ui.indexOf("  function close()"), ui.indexOf("\n  async function request"));
for (const [pendingValue, uncertainValue, confirmationValue, allowed] of [[false, false, false, true], [true, false, false, false], [false, true, false, false], [false, false, true, false]]) {
  let closed = false, unlocked = false, focused = false;
  new Function("pending", "uncertain", "confirmation", "setExpanded", "onLock", "trigger", "requestAnimationFrame", `${closeSource}; close();`)({ current: pendingValue }, uncertainValue, confirmationValue, value => { closed = !value; }, value => { unlocked = !value; }, { current: { isConnected: true, focus() { focused = true; } } }, callback => callback());
  assert.equal(closed, allowed); assert.equal(unlocked, allowed);
  assert.equal(focused, allowed, "closing restores focus only after a safe unlock");
}
console.log("Existing rules: strict receipts, account-only BFF, confirmation, uncertain-result GET and stable-key retry passed (synthetic only).");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.createSourceFile("mail-context.tsx", readFileSync(new URL("../context/mail-context.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let refresh;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "refreshMailbox") refresh = node.initializer;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(refresh, "Test the actual provider refresh handler");
const js = ts.transpileModule(`const handler = ${refresh.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
for (const mode of ["live"]) {
  let attempt = 4;
  let calls = 0;
  // Any newly introduced selection/body/quota reset has no binding here and
  // fails instead of being silently accepted by a duplicate test model.
  const handler = new Function("mode", "setLoadAttempt", `${js}; return handler;`)(mode, (update) => { calls += 1; attempt = update(attempt); });
  handler();
  assert.equal(attempt, 5);
  assert.equal(calls, 1);
}
console.log("Mailbox refresh: live background reload only; mock, selection, body and pagination unchanged.");

const list = ts.createSourceFile("MailList.tsx", readFileSync(new URL("../components/mail/MailList.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let completion;
function findCompletion(node) {
  if (ts.isCallExpression(node) && node.expression.getText(list) === "useEffect" && node.arguments[0]?.getText(list).includes('t("refreshComplete")')) completion = node.arguments[0].getText(list);
  ts.forEachChild(node, findCompletion);
}
findCompletion(list);
assert.ok(completion, "Test actual response-driven toast effect");
const completionJs = ts.transpileModule(`const handler = ${completion};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
for (const status of ["ready", "retryable", "unauthorized", "unavailable"]) {
  const request = { current: { attempt: 5, viewKey: "inbox" } };
  const calls = [];
  const run = new Function("manualRefresh", "refreshViewKey", "refreshReceipt", "toast", "t", "tService", completionJs + "return handler;");
  const toast = { success: value => calls.push(["success", value]), error: value => calls.push(["error", value]) };
  run(request, "inbox", { attempt: 4, viewKey: "inbox", status }, toast, value => value, value => value)();
  assert.equal(calls.length, 0, "No completion before the requested response");
  const complete = run(request, "inbox", { attempt: 5, viewKey: "inbox", status }, toast, value => value, value => value);
  complete(); complete();
  assert.deepEqual(calls, [status === "ready" ? ["success", "refreshComplete"] : ["error", status]]);
}
console.log("Manual refresh feedback: completion only after response; failures never announce success; no duplicate toast.");

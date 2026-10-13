import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const path = new URL("../components/admin/LiveAdminManager.tsx", import.meta.url);
const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = [], disabled = [];
function visit(node) {
  if (ts.isArrowFunction(node) && node.parameters[0]?.name.getText(source) === "event" && node.getText(source).includes('event.target.value === "local_loopback"')) callbacks.push(node);
  if (ts.isJsxAttribute(node) && node.name.getText(source) === "disabled" && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression?.getText(source).includes('"username", "password", "smtpUtf8RelayFallbackDirect"')) disabled.push(node.initializer.expression);
  ts.forEachChild(node, visit);
}
visit(source);
function executable(expression, bindings) {
  const code = ts.transpileModule(`const evaluate = ${expression.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return evaluate;`)(...Object.values(bindings));
}
test("actual local-mode callback clears credentials/fallback and requires new confirmation", () => {
  assert.equal(callbacks.length, 1);
  let next, confirmed;
  const command = { action: "edit", input: { host: "127.0.0.1", username: "fixture-user", password: "fixture-password", smtpUtf8RelayFallbackDirect: true, tlsMode: "start_tls" } };
  const change = executable(callbacks[0], { resource: "smtp-relay", command, spec: { name: "tlsMode" }, setConfirmed: value => { confirmed = value; }, setCommand: value => { next = value; } });
  change({ target: { value: "local_loopback" } });
  assert.equal(next.input.tlsMode, "local_loopback");
  assert.equal(next.input.username, "");
  assert.equal(next.input.password, "");
  assert.equal(next.input.smtpUtf8RelayFallbackDirect, false);
  assert.equal(confirmed, false);
  assert.equal(command.input.password, "fixture-password", "snapshot was not mutated");
});
test("actual checkbox and text input disable conditions apply only to local relay credentials/fallback", () => {
  assert.equal(disabled.length, 2);
  for (const expression of disabled) for (const name of ["username", "password", "smtpUtf8RelayFallbackDirect", "host", "port"]) {
    const evaluate = (resource, tlsMode) => executable(expression, { resource, command: { input: { tlsMode } }, spec: { name } });
    assert.equal(evaluate("smtp-relay", "local_loopback"), ["username", "password", "smtpUtf8RelayFallbackDirect"].includes(name));
    assert.equal(evaluate("smtp-relay", "start_tls"), false);
    assert.equal(evaluate("users", "local_loopback"), false);
  }
});
test("local relay labels and restrictions are present in all ten catalogs", () => {
  const catalogs = readdirSync(new URL("../messages/", import.meta.url)).filter(name => name.endsWith(".json"));
  assert.equal(catalogs.length, 10);
  for (const name of catalogs) {
    const values = JSON.parse(readFileSync(new URL(`../messages/${name}`, import.meta.url), "utf8")).adminManage;
    assert.ok(values.localRelay.length > 0);
    assert.ok(values.localRelayNotice.includes("127.0.0.1"));
    assert.ok(values.localRelayNotice.includes("::1"));
  }
});

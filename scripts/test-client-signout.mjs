import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the actual client helper against synthetic responses; no real logout.
const compiled = ts.transpileModule(readFileSync(new URL("../lib/tastemail/client-session.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function fixture(fetch) {
  const compiledModule = { exports: {} };
  new Function("fetch", "exports", "module", compiled)(fetch, compiledModule.exports, compiledModule);
  return compiledModule.exports.requestLiveSignOut;
}
let calls = 0, finish;
const pending = new Promise(resolve => { finish = resolve; });
const signOut = fixture(async (path, options) => {
  assert.equal(path, "/api/mail/session"); assert.equal(options.method, "DELETE");
  assert.ok(options.signal instanceof AbortSignal);
  calls++; return calls === 1 ? pending : Response.json({ status: "signed_out" });
});
const header = signOut(), sidebar = signOut();
assert.equal(header, sidebar, "Callers share the same in-flight promise");
assert.equal(calls, 1);
finish(Response.json({ status: "signed_out" }));
assert.deepEqual(await Promise.all([header, sidebar]), [true, true]);
assert.equal(await signOut(), true); assert.equal(calls, 2, "Settled requests release the shared guard");

for (const [code, status, expected] of [[200, "signed_out", true], [503, "signout_unconfirmed", false]]) {
  const run = fixture(async () => Response.json({ status }, { status: code }));
  assert.equal(await run(), expected);
}
for (const outcome of [
  () => { throw new Error("synthetic network failure"); },
  () => new Response("not JSON"),
  () => Response.json({ status: "signed_out" }, { status: 401 }),
  () => Response.json({ status: "signout_unconfirmed" }, { status: 403 }),
  () => Response.json({ status: "signout_unconfirmed" }),
  () => Response.json({ status: "unexpected" }),
  () => Response.json([]),
]) {
  let attempts = 0;
  const run = fixture(async () => { attempts++; return attempts === 1 ? outcome() : Response.json({ status: "signed_out" }); });
  const first = run(), second = run();
  assert.equal(first, second);
  assert.equal(attempts, 1);
  assert.deepEqual((await Promise.allSettled([first, second])).map(item => item.status), ["rejected", "rejected"]);
  assert.equal(await run(), true, "Failure allows a later explicit retry, never an automatic retry");
  assert.equal(attempts, 2);
}
console.log("Sign-out: shared in-flight request, confirmed/unconfirmed receipts and failure retry boundary passed.");

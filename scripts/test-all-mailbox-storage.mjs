import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const exports = {};
new Function("exports", ts.transpileModule(readFileSync(new URL("../lib/all-mailbox-storage.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exports);
const box = (usedBytes, quotaBytes = 10 * 1024 ** 3) => ({ usedBytes, quotaBytes });
assert.deepEqual(exports.allMailboxStorage([box(1024 ** 2), box(2 * 1024 ** 2), box(0)]), { used: 3, limit: 10 });
assert.deepEqual(exports.allMailboxStorage([box(0)]), { used: 0, limit: 10 });
for (const boxes of [[], [box(null)], [box(-1)], [box(1, null)], [box(1, 0)], [box(1), box(1, 20 * 1024 ** 3)], [box(Number.MAX_SAFE_INTEGER), box(1)]]) {
  assert.equal(exports.allMailboxStorage(boxes), null);
}
console.log("all mailbox storage: summed usage, shared quota once, empty/unknown/conflicting/overflow guards passed");

import assert from "node:assert/strict";
import { emptyTrashSnapshot, parseEmptyTrashReceipt } from "../lib/empty-trash.ts";
function fixture(count = 205, mode = "normal") {
  const ids = Array.from({ length: count }, (_, i) => `id-${i}`), calls = [];
  let state = "one";
  const method = async (name, args) => {
    calls.push([name, args]);
    if (name === "Mailbox/get") return { list: [{ id: "trash", role: mode === "wrong" ? "inbox" : "trash", myRights: { mayRemoveItems: mode !== "denied" } }] };
    if (name === "Email/query") return { ids: ids.slice(args.position, args.position + args.limit), position: args.position, total: count, queryState: mode === "changed" && args.position ? "changed" : state };
    if (name === "Email/get") return { state, list: args.ids.map(id => ({ id, mailboxIds: mode === "restored" && id === "id-0" ? { inbox: true } : { trash: true } })) };
    if (name === "Email/set") {
      assert.equal(args.ifInState, state);
      if (mode === "uncertain") throw Error("transport");
      state += "x";
      return { destroyed: args.destroy };
    }
    throw Error(name);
  };
  return { method, calls };
}
for (const [mode, count, status, deleted, retained] of [["normal",205,"completed",205,0],["normal",0,"completed",0,0],["restored",3,"partial",2,1],["uncertain",3,"uncertain",0,3],["wrong",3,"failed",0,0],["denied",3,"failed",0,0],["changed",205,"failed",0,100+105]]) {
  const f = fixture(count, mode), r = await emptyTrashSnapshot("account", "trash", f.method);
  assert.equal(r.status, status); assert.equal(r.deleted, deleted);
  if (mode !== "changed") assert.equal(r.retained, retained);
  parseEmptyTrashReceipt(r);
  if (["wrong","denied","changed"].includes(mode) || !count) assert.ok(!f.calls.some(([name]) => name === "Email/set"));
  if (count === 205 && mode === "normal") assert.deepEqual(f.calls.filter(([name]) => name === "Email/set").map(([,args])=>args.destroy.length), [100,100,5]);
}
assert.throws(()=>parseEmptyTrashReceipt({status:"completed",deleted:1,retained:2}));
console.log("PASS: full snapshot, 100-mail batches, trash rights, concurrent restore, changed snapshot and uncertain-write stop");

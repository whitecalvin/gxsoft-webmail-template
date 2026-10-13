import assert from "node:assert/strict";
import { MailMutationQueue } from "../lib/tastemail/mutation-queue.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));
let releaseRead;
const readDone = new Promise((resolve) => { releaseRead = resolve; });
const events = [];
const visible = [];
const queue = new MailMutationQueue((ids) => visible.push(ids));

queue.enqueue("first", "first:seen", async () => {
  events.push("read-start");
  await readDone;
  events.push("read-end");
}, false);
queue.enqueue("first", "first:star", async () => { events.push("star"); });
queue.enqueue("first", "first:star", async () => { events.push("duplicate-star"); });
queue.enqueue("second", "second:move", async () => { events.push("other-message"); });
assert.equal(queue.hasVisiblePending("first"), true);
assert.equal(queue.hasVisiblePending("second"), true);
assert.equal(queue.hasVisiblePending("missing"), false);

await tick();
assert.deepEqual(events, ["read-start", "other-message"]);
assert.deepEqual(visible, [["first"], ["first", "second"], ["first"]]);
releaseRead();
await tick();
assert.deepEqual(events, ["read-start", "other-message", "read-end", "star"]);
assert.deepEqual(visible.at(-1), []);
assert.equal(queue.hasVisiblePending("first"), false);
assert.equal(queue.hasVisiblePending("second"), false);

queue.enqueue("first", "first:failed", async () => { throw new Error("simulated failure"); });
queue.enqueue("first", "first:after-failure", async () => { events.push("after-failure"); });
await tick();
assert.equal(events.at(-1), "after-failure");
assert.deepEqual(visible.at(-1), []);

let releaseSilentRead;
const silentReadDone = new Promise((resolve) => { releaseSilentRead = resolve; });
const visibleAfterWrite = [];
const writeQueue = new MailMutationQueue((ids) => visibleAfterWrite.push(ids));
writeQueue.enqueue("third", "third:star", async () => { events.push("star-finished"); });
writeQueue.enqueue("third", "third:seen", async () => { await silentReadDone; }, false);
await tick();
assert.equal(writeQueue.hasVisiblePending("third"), false);
assert.equal(events.at(-1), "star-finished");
assert.deepEqual(visibleAfterWrite, [["third"], []]);
releaseSilentRead();
await tick();
assert.deepEqual(visibleAfterWrite, [["third"], []]);
assert.equal(writeQueue.hasVisiblePending("third"), false);

let releasePendingRead;
const pendingReadDone = new Promise((resolve) => { releasePendingRead = resolve; });
const readThenMove = [];
const readThenMoveQueue = new MailMutationQueue(() => {});
readThenMoveQueue.enqueue("fifth", "fifth:seen", async () => {
  readThenMove.push("read-start");
  await pendingReadDone;
  readThenMove.push("read-end");
}, false);
await tick();
assert.equal(readThenMoveQueue.hasVisiblePending("fifth"), false);
readThenMoveQueue.enqueue("fifth", "fifth:move", async () => { readThenMove.push("move"); });
assert.equal(readThenMoveQueue.hasVisiblePending("fifth"), true);
assert.deepEqual(readThenMove, ["read-start"]);
releasePendingRead();
await tick();
assert.deepEqual(readThenMove, ["read-start", "read-end", "move"]);
assert.equal(readThenMoveQueue.hasVisiblePending("fifth"), false);

let releaseSecondWrite;
const secondWriteDone = new Promise((resolve) => { releaseSecondWrite = resolve; });
const visibleTwoWrites = [];
const twoWriteQueue = new MailMutationQueue((ids) => visibleTwoWrites.push(ids));
twoWriteQueue.enqueue("fourth", "fourth:star", async () => {});
twoWriteQueue.enqueue("fourth", "fourth:move", async () => { await secondWriteDone; });
await tick();
assert.deepEqual(visibleTwoWrites, [["fourth"]]);
releaseSecondWrite();
await tick();
assert.deepEqual(visibleTwoWrites, [["fourth"], []]);

const bulkQueue = new MailMutationQueue(() => {});
let running = 0, maximum = 0, completed = 0;
const releases = [];
for (let index = 0; index < 20; index++) bulkQueue.enqueue(`bulk-${index}`, `bulk-${index}:move`, async () => {
  running++; maximum = Math.max(maximum, running);
  await new Promise(resolve => releases.push(resolve));
  running--; completed++;
});
await tick();
assert.equal(running, 4);
assert.equal(bulkQueue.hasVisiblePending("bulk-19"), true);
while (completed < 20) {
  for (const release of releases.splice(0)) release();
  await tick();
}
assert.equal(maximum, 4);
assert.equal(bulkQueue.hasVisiblePending("bulk-19"), false);
console.log("mail mutation queue: ordering, deduplication, failure continuation, pending state and bulk concurrency limit passed");

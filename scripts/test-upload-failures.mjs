import assert from "node:assert/strict";
import test from "node:test";
import { remainingFailedUploadNames } from "../lib/tastemail/upload-failures.ts";

test("partial upload retains only failed file names", () => {
  assert.deepEqual(
    remainingFailedUploadNames([], ["one.txt", "two.txt"], ["fulfilled", "rejected"]),
    ["two.txt"],
  );
});

test("uploading another file does not clear an earlier failure", () => {
  assert.deepEqual(
    remainingFailedUploadNames(["two.txt"], ["three.txt"], ["fulfilled"]),
    ["two.txt"],
  );
});

test("successful retry clears the matching failed file", () => {
  assert.deepEqual(
    remainingFailedUploadNames(["two.txt"], ["two.txt"], ["fulfilled"]),
    [],
  );
});

test("same-name partial failure stays blocked", () => {
  assert.deepEqual(
    remainingFailedUploadNames([], ["same.txt", "same.txt"], ["rejected", "fulfilled"]),
    ["same.txt"],
  );
});

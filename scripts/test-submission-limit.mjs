import assert from "node:assert/strict";
import { hasCompleteSubmissionList } from "../lib/tastemail/submission-limit.ts";

assert.equal(hasCompleteSubmissionList(0, 500), true);
assert.equal(hasCompleteSubmissionList(499, 500), true);
assert.equal(hasCompleteSubmissionList(500, 500), false);
assert.equal(hasCompleteSubmissionList(501, 500), false);
assert.equal(hasCompleteSubmissionList(0, null), false);
assert.equal(hasCompleteSubmissionList(0, 0), false);

console.log("submission list limit: complete and saturated boundaries verified");

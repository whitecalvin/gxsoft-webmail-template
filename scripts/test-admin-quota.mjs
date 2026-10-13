import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BYTES_PER_GIB, MAX_QUOTA_GIB, quotaBytesValue, quotaGiBValue } from "../lib/admin-quota.ts";

for (const bytes of [0, 1, 123456789, BYTES_PER_GIB, 10 * BYTES_PER_GIB, MAX_QUOTA_GIB * BYTES_PER_GIB]) {
  assert.equal(quotaBytesValue(quotaGiBValue(String(bytes))), String(bytes));
}
assert.equal(quotaBytesValue("0.1"), String(Math.round(0.1 * BYTES_PER_GIB)));
assert.equal(quotaBytesValue(".5"), String(BYTES_PER_GIB / 2));
for (const invalid of ["", "-1", "NaN", "Infinity", "0x10", "1048576.1", "10 GiB"]) assert.equal(quotaBytesValue(invalid), null);
for (const invalid of [null, undefined, "-1", "bad", Number.MAX_SAFE_INTEGER]) assert.equal(quotaGiBValue(invalid), "");
const ui = readFileSync("components/admin/LiveAdminManager.tsx", "utf8");
assert.match(ui, /spec\.name === "quotaBytes" \? <AdminQuotaInput/);
assert.match(ui, /\[spec\.name\]: bytes/);
console.log("PASS: original GiB quota conversion, exact existing byte roundtrip, invalid bounds and shared input wiring");

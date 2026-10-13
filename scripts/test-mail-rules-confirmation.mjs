import assert from "node:assert/strict";
import { confirmsMailRuleReplacement } from "../lib/mail-rules-confirmation.ts";

const requested = [
  { id: "existing", name: "  Keep invoices  ", kind: "filter", source: "keep;\r\n", enabled: true },
  { id: null, name: "Away", kind: "vacation", source: "vacation;\r\n", enabled: false },
];
const saved = {
  mode: "rules", enabled: true,
  rules: [
    { id: "existing", name: "Keep invoices", kind: "filter", source: "keep;\n", enabled: true, position: 0 },
    { id: "created", name: "Away", kind: "vacation", source: "vacation;\n", enabled: false, position: 1 },
  ],
};
assert.equal(confirmsMailRuleReplacement(saved, requested), true);
assert.equal(confirmsMailRuleReplacement({ ...saved, rules: saved.rules.slice(0, 1) }, requested), false);
assert.equal(confirmsMailRuleReplacement({ ...saved, mode: "advanced" }, requested), false);
assert.equal(confirmsMailRuleReplacement({ ...saved, enabled: false }, requested), false);
for (const changed of [
  { id: "wrong" }, { position: 1 }, { name: "Other" }, { source: "discard;\n" }, { enabled: false },
]) {
  assert.equal(confirmsMailRuleReplacement({ ...saved, rules: [{ ...saved.rules[0], ...changed }, saved.rules[1]] }, requested), false);
}
assert.equal(confirmsMailRuleReplacement({ ...saved, rules: [saved.rules[0], { ...saved.rules[1], id: "existing" }] }, requested), false);
assert.equal(confirmsMailRuleReplacement({ ...saved, rules: [...saved.rules].reverse() }, requested), false);
console.log("mail rule replacement: full response confirmation verified");

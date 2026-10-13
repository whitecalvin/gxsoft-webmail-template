import assert from "node:assert/strict";
import { emptyAdvancedRules, makeAwaySource, readAwaySource, replaceManagedAwayRule, validAwayDraft } from "../lib/away-rule.ts";

const draft = { subject: 'Away "soon" \\ ok', message: "First line\n.Second line\n한글 응답", enabled: true };
const source = makeAwaySource(draft);
assert.match(source, /^# GXWebMail vacation v1\nrequire "vacation";/u);
assert.match(source, /\.\.Second line\r\n/u);
assert.deepEqual(readAwaySource(source), { subject: draft.subject, message: draft.message });
assert.deepEqual(readAwaySource(source.replaceAll("\r\n", "\n")), { subject: draft.subject, message: draft.message });
assert.equal(readAwaySource('require "vacation"; vacation "Existing rule";'), null);
assert.equal(readAwaySource(source + "\nkeep;"), null);
assert.equal(validAwayDraft({ ...draft, subject: "bad\r\nheader" }), false);
assert.equal(validAwayDraft({ ...draft, message: " " }), false);
assert.equal(emptyAdvancedRules({ mode: "advanced", source: "", enabled: false, rules: [] }), true);
assert.equal(emptyAdvancedRules({ mode: "advanced", source: "keep;", enabled: false, rules: [] }), false);
assert.equal(emptyAdvancedRules({ mode: "advanced", source: "", enabled: true, rules: [] }), false);
assert.equal(emptyAdvancedRules({ mode: "advanced", source: "", enabled: false, rules: [{ id: "custom" }] }), false);
assert.equal(emptyAdvancedRules({ mode: "rules", source: "", enabled: false, rules: [] }), false);
const existing = [
  { id: "filter-1", name: "Keep invoices", kind: "filter", source: 'keep;', enabled: true },
  { id: "away-1", name: "Original away", kind: "vacation", source: 'require "vacation"; vacation "Old";', enabled: false },
];
const changed = replaceManagedAwayRule(existing, "away-1", source, true, "Ignored");
assert.deepEqual(changed[0], existing[0]);
assert.deepEqual(changed[1], { ...existing[1], source, enabled: true });
assert.deepEqual(existing[1], { id: "away-1", name: "Original away", kind: "vacation", source: 'require "vacation"; vacation "Old";', enabled: false });
assert.deepEqual(replaceManagedAwayRule(existing.slice(0, 1), null, source, false, "New away")[1],
  { id: null, name: "New away", kind: "vacation", source, enabled: false });
assert.throws(() => replaceManagedAwayRule(existing, "missing", source, true, "Ignored"));
console.log("managed vacation rule: safe roundtrip and invalid input checks passed");

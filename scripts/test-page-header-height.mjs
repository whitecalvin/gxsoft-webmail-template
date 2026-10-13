import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("app/globals.css");
const rule = css.match(/\.workspace-page-header\s*\{([^}]+)\}/)?.[1];
assert.ok(rule);
for (const declaration of ["height: 3rem", "min-height: 3rem", "padding-block: 0", "flex-wrap: nowrap", "flex-shrink: 0"]) assert.ok(rule.includes(declaration));
for (const file of ["components/settings/LiveMailRules.tsx", "components/contacts/LiveContacts.tsx", "components/approvals/LiveApprovals.tsx", "components/mail/LiveSharedMailboxes.tsx", "components/quarantine/LiveQuarantine.tsx", "components/layout/TopBar.tsx"]) {
  assert.ok(read(file).includes("workspace-page-header"), file);
}
const top = read("components/layout/TopBar.tsx");
const files = read("components/files/LiveFiles.tsx");
assert.match(files, /<WorkspaceLayout title=\{t\("title"\)\}/);
assert.doesNotMatch(files, /<header|<h1/);
assert.match(files, /aria-label=\{t\("search"\)\} placeholder=\{t\("search"\)\}/);
assert.match(read("components/quarantine/LiveQuarantine.tsx"), /<header className="workspace-page-header[^\"]*">\s*<p[^>]*>\{live\("readOnly"\)\}<\/p>\s*<\/header>/);
assert.match(top, /workspace-page-header min-w-0 border-t/);
assert.match(top, /\{actions \? <div role="toolbar"/);
assert.match(read("components/settings/LiveMailRules.tsx"), /!embedded \? <header className="workspace-page-header/);
console.log("page headers: shared fixed 48px row, quarantine included, separate mobile actions and no duplicate standalone rules heading passed");

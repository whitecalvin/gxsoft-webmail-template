import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = postcss.parse(read("app/globals.css"));
const rules = [];
css.walkRules(".workspace-menu-surface", rule => rules.push(rule));
assert.equal(rules.length, 1, "one shared radius for all sidebar surfaces");
assert.equal(rules[0].parent.type, "root", "applies to every viewport and theme");
assert.equal(rules[0].nodes.find(node => node.prop === "border-radius").value, "min(var(--radius-app), 0.5rem)");
for (const path of ["components/layout/SidebarMenuGroup.tsx", "components/layout/WorkspaceSidebar.tsx", "components/mail/InboxContextMenu.tsx", "components/mail/PersonalFolderTree.tsx"]) {
  assert.match(read(path), /workspace-menu-surface/, `${path} uses the shared surface`);
}
assert.match(read("components/layout/SidebarMenuGroup.tsx"), /workspace-menu-surface[^\n]*hover:bg-/);
assert.match(read("components/layout/WorkspaceSidebar.tsx"), /workspace-menu-surface[^\n]*navStyle\.active[^\n]*navStyle\.idle/);
assert.match(read("components/mail/PersonalFolderTree.tsx"), /workspace-menu-surface[^\n]*drag\.hover/);
console.log("Sidebar menu radius: groups, system/personal mailboxes, folders and navigation share a theme-aware hover/selected/drop radius.");

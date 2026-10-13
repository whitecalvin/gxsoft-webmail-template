import assert from "node:assert/strict";
import { focusMenuItem } from "../lib/menu-keyboard.ts";

const doc = { activeElement: null };
const buttons = Array.from({ length: 3 }, () => ({ focus() { doc.activeElement = this; } }));
const menu = {
  ownerDocument: doc,
  querySelectorAll(selector) {
    assert.equal(selector, 'button[role="menuitem"]:not(:disabled)');
    return buttons;
  },
};
assert.equal(focusMenuItem(menu, "ArrowDown"), true);
assert.equal(doc.activeElement, buttons[0]);
focusMenuItem(menu, "ArrowUp");
assert.equal(doc.activeElement, buttons[2]);
focusMenuItem(menu, "ArrowDown");
assert.equal(doc.activeElement, buttons[0]);
focusMenuItem(menu, "End");
assert.equal(doc.activeElement, buttons[2]);
focusMenuItem(menu, "Home");
assert.equal(doc.activeElement, buttons[0]);
doc.activeElement = null;
focusMenuItem(menu, "ArrowUp");
assert.equal(doc.activeElement, buttons[2]);
assert.equal(focusMenuItem(menu, "Enter"), false);
assert.equal(focusMenuItem({ ...menu, querySelectorAll: () => [] }, "Home"), false);
console.log("Menu keyboard navigation checks passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/ui/Dropdown.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
let closed = false, focused = false, changed = "";
const insideMenu = {}, outside = {};
const refs = [
  { contains: () => false },
  { focus: () => { focused = true; } },
  { contains: target => target === insideMenu },
];
function render(iconOnly) {
  let refIndex = 0;
  const exports = {};
  new Function("exports", "require", "document", code)(exports, name => {
    if (name === "react") return { createContext: value => value, useContext: value => value, useState: () => [true, value => { closed = value === false; }], useRef: () => ({ current: refs[refIndex++] }), useId: () => "picker", useEffect() {}, useLayoutEffect() {} };
    if (name === "react-dom") return { createPortal: (menu, target) => ({ portal: true, menu, target }) };
    if (name === "./utils") return { cn: (...values) => values.filter(Boolean).join(" ") };
    if (name === "./Dropdown.module.css") return {};
    if (name === "./Tooltip") return { Tooltip: props => props.children };
    return require(name);
  }, { body: "body" });
  return exports.Dropdown({ value: "folder", options: [{ value: "folder", label: "Folder" }], onChange: value => { changed = value; }, overlay: true, iconOnly });
}
const root = render(true);
const portal = root.props.children[1];
assert.equal(portal.portal, true);
assert.equal(portal.target, "body");
assert.match(portal.menu.props.className, /fixed/);
assert.match(portal.menu.props.className, /z-\(--layer-modal\)/);
assert.match(portal.menu.props.className, /bg-\(--surface-app\)/);
root.props.onBlur({ currentTarget: refs[0], relatedTarget: insideMenu });
assert.equal(closed, false, "focus into portaled menu must not close it");
root.props.onBlur({ currentTarget: refs[0], relatedTarget: outside });
assert.equal(closed, true);
for (const key of ["Escape", "Tab"]) {
  closed = focused = false;
  let prevented = false, stopped = false;
  portal.menu.props.onKeyDown({ key, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.ok(closed && focused && prevented && stopped, `${key} closes picker without closing parent drawer`);
}
portal.menu.props.children[0].props.onClick();
assert.equal(changed, "folder");
assert.equal(render(false).props.children[1].portal, undefined, "profile language overlay keeps its focus boundary");
console.log("icon picker overlay: viewport portal, drawer layer, focus, selection and Escape/Tab isolation passed");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.createSourceFile("LiveCalendar.tsx", readFileSync(new URL("../components/calendar/LiveCalendar.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let navigation, grid, tabHandler, createTooltip;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "Tooltip") createTooltip = node;
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "nav") navigation = node.parent;
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "div" && node.children.some(child => ts.isJsxExpression(child) && child.getText(source).includes("<CalendarMonthGrid"))) grid = node;
  if (ts.isJsxAttribute(node) && node.name.getText(source) === "onClick" && node.initializer?.getText(source).includes("setView(option)")) tabHandler = node.initializer.expression;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(navigation && grid && tabHandler);
function evaluate(node, bindings) {
  const js = ts.transpileModule(`const result = (${node.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  return new Function("require", "exports", ...Object.keys(bindings), `${js};return result;`)(require, {}, ...Object.values(bindings));
}
const anchor = new Date(2026, 9, 6);
const weekDays = Array.from({ length: 7 }, (_, index) => new Date(2026, 9, 5 + index));
for (const view of ["day", "week", "month"]) {
  const bindings = {
    view, anchor, weekDays, gridEvents: { month: [], timed: [], allDay: [] }, now: anchor,
    t: key => key, toDateKey: day => String(day.getDate()),
    dayLabelFormatter: { format: day => `date-${day.getDate()}` }, weekdayFormatter: { format: () => "weekday" },
    setAnchor() {}, setView() {}, setSelectedEventId() {},
    CalendarMonthGrid: () => React.createElement("section", { "aria-label": "month-grid" }),
    CalendarTimeGrid: ({ days }) => React.createElement("section", { "data-day-count": days.length }),
  };
  const nav = renderToStaticMarkup(evaluate(navigation, bindings));
  assert.equal([...nav.matchAll(/<button /g)].length, view === "month" ? 0 : view === "day" ? 1 : 7);
  const calendar = renderToStaticMarkup(evaluate(grid, bindings));
  if (view === "month") {
    assert.match(calendar, /flex h-72 shrink-0/);
    assert.match(calendar, /aria-label="month-grid"/);
    assert.doesNotMatch(nav, /<nav/);
  } else {
    assert.match(calendar, / hidden"/);
    assert.match(calendar, new RegExp(`data-day-count="${view === "day" ? 1 : 7}"`));
  }
  let selectedView = "week", selectedEvent = "old-event";
  evaluate(tabHandler, { option: view, setView: value => { selectedView = value; }, setSelectedEventId: value => { selectedEvent = value; } })();
  assert.equal(selectedView, view);
  assert.equal(selectedEvent, null);
}
console.log("calendar mobile: day/week/month controls, date strip and month-grid visibility passed");
assert.ok(createTooltip, "create button uses shared Tooltip");
const button = createTooltip.children.find(node => ts.isJsxElement(node));
assert.ok(button);
const attrs = button.openingElement.attributes.properties;
assert.equal(attrs.some(node => ts.isJsxAttribute(node) && node.name.getText(source) === "title"), false);
assert.ok(source.text.includes('import { Tooltip } from "@/components/ui/Tooltip"'));
for (const [status, creating, editingEvent, submissionUncertain, disabled] of [
  ["ready", false, null, false, false], ["loading", false, null, false, true],
  ["ready", true, null, false, true], ["ready", false, {}, false, true], ["ready", false, null, true, true],
]) {
  const element = evaluate(createTooltip, { status, creating, editingEvent, submissionUncertain, openCreate() {},
    t: key => key, Tooltip: ({ children }) => React.createElement("span", null, children), Plus: () => null });
  assert.equal(element.props.content, "create"); assert.equal(element.props.side, "bottom");
  assert.equal(element.props.className, "shrink-0");
  const html = renderToStaticMarkup(element);
  assert.equal(html.includes('disabled=""'), disabled); assert.ok(html.includes('aria-label="create"'));
}
console.log("calendar create: shared translated tooltip, no native title, flex sizing and mutation locks preserved");

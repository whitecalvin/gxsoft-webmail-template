import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = readFileSync(new URL("../components/mail/MailDeliveryDetails.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("details.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === "MailDeliveryDetails");
const compiled = ts.transpileModule(declaration.getText(tree).replace("export function", "function"), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
let dateOptions;
let showDeliveryDetails = true;
const component = new Function("React", "ChevronDown", "useTranslations", "useFormatter", "useSettings", `${compiled};return MailDeliveryDetails;`)(
  React, () => React.createElement("svg"), () => key => key,
  () => ({ dateTime: (_, options) => { dateOptions = options; return "2026-10-06 10:30:00 GMT+9"; } }),
  () => ({ saved: { inbox: { showDeliveryDetails }, locale: { timezone: "Asia/Seoul", timeFormat: "24" } } }),
);
const message = { from: { name: "<script>invalid</script>", email: "sender@example.test" }, to: ["first@example.test", "second@example.test"], cc: ["cc@example.test"], bcc: ["bcc@example.test"], replyTo: "reply@example.test", receivedAt: "2026-10-06T01:30:00Z" };
const rendered = renderToStaticMarkup(React.createElement(component, { message }));
assert.ok(rendered.includes("<details"));
assert.ok(rendered.includes("<summary"));
for (const key of ["infoFrom", "infoTo", "infoCc", "infoBcc", "infoReplyTo", "infoReceivedAt"]) assert.ok(rendered.includes(key));
assert.ok(rendered.includes("first@example.test, second@example.test"));
assert.ok(rendered.includes("&lt;script&gt;invalid&lt;/script&gt;"));
assert.equal(rendered.includes("<script>"), false);
assert.equal(dateOptions.timeZone, "Asia/Seoul");
assert.equal(dateOptions.timeStyle, "long");
assert.equal(dateOptions.hour12, false);
const minimal = renderToStaticMarkup(React.createElement(component, { message: { from: message.from, receivedAt: "invalid timestamp" } }));
for (const key of ["infoCc", "infoBcc", "infoReplyTo"]) assert.equal(minimal.includes(key), false);
assert.ok(minimal.includes("infoNoRecipients"));
assert.ok(minimal.includes("invalid timestamp"));
showDeliveryDetails = false;
assert.equal(renderToStaticMarkup(React.createElement(component, { message })), "", "disabled preference hides the entire details disclosure");
console.log("mail delivery details: metadata, optional fields, escaped content and explicit time zone passed");

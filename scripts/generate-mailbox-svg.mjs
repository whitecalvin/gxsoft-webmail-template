import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import lucide from "lucide-react/dynamicIconImports.mjs";
import { imports as phosphor } from "../lib/phosphor-mailbox-imports.mjs";

// Mechanical output from installed packages, never from mail HTML or user SVG.
const glyphs = {};
for (const [packageId, imports] of [["lucide", lucide], ["phosphor", phosphor]]) {
  for (const [name, load] of Object.entries(imports).sort(([a], [b]) => a.localeCompare(b))) {
    const { default: Icon } = await load();
    const svg = renderToStaticMarkup(createElement(Icon, { size: 20, "aria-hidden": true }));
    if (!svg.startsWith("<svg ") || /<script|<foreignObject|\bon\w+=|(?:href|src)=/iu.test(svg)) {
      throw new Error(`Unsupported SVG: ${packageId}:${name}`);
    }
    glyphs[`${packageId}:${name}`] = svg;
  }
}
writeFileSync(new URL("../lib/mailbox-svg.generated.json", import.meta.url), JSON.stringify(glyphs));
console.log(`Generated ${Object.keys(glyphs).length} server-only mailbox SVGs.`);

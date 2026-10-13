import { createRequire } from "node:module";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Mechanical package-derived catalogs: run again only after these packages change.
const require = createRequire(import.meta.url);
const root = dirname(require.resolve("@phosphor-icons/react/package.json"));
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const files = readdirSync(join(root, "dist/csr")).filter(name => name.endsWith(".es.js")).sort();
const icons = files.map(file => {
  const component = file.slice(0, -6);
  const name = component.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
  return { name, component };
});
const data = require("@emoji-mart/data");
const emojiVersion = require("@emoji-mart/data/package.json").version;
const emojis = Object.values(data.emojis).flatMap(emoji => emoji.skins.map((skin, index) => ({
  id: index ? `${emoji.id}--skin-${index + 1}` : emoji.id,
  native: skin.native, label: emoji.name,
  keywords: [emoji.id, emoji.name, ...(emoji.keywords ?? []), ...(emoji.emoticons ?? [])].join(" ").toLowerCase(),
})));
writeFileSync(new URL("../lib/extra-mailbox-icon-catalog.mjs", import.meta.url),
  `// Generated from installed packages by scripts/generate-extra-mailbox-icons.mjs.\nexport const PHOSPHOR_VERSION = ${JSON.stringify(version)};\nexport const PHOSPHOR_NAMES = ${JSON.stringify(icons.map(icon => icon.name))};\nexport const EMOJI_VERSION = ${JSON.stringify(emojiVersion)};\nexport const EMOJIS = ${JSON.stringify(emojis)};\n`);
writeFileSync(new URL("../lib/phosphor-mailbox-imports.mjs", import.meta.url),
  `// Generated static import paths allow bundler code splitting by icon.\nexport const imports = {\n${icons.map(icon => `  ${JSON.stringify(icon.name)}: () => import("@phosphor-icons/react/dist/csr/${icon.component}").then(module => ({ default: module.${icon.component}Icon })),`).join("\n")}\n};\n`);
console.log(`Generated Phosphor ${version}: ${icons.length} icons; Emoji Mart ${emojiVersion}: ${emojis.length} emoji variants.`);

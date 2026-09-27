#!/usr/bin/env node
// Verifies every locale under messages/ has the same keys and ICU placeholders
// as the English source of truth. It also reports remaining identical values.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, "..", "messages");

function flattenKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value, path);
    }
    return [path];
  });
}

function flattenValues(obj, prefix = "", result = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenValues(value, path, result);
    } else {
      result.set(path, String(value));
    }
  }
  return result;
}

function placeholders(value) {
  return [...value.matchAll(/\{([\w]+)(?:,[^}]*)?\}/g)]
    .map((match) => match[1])
    .sort();
}

const files = readdirSync(messagesDir).filter((f) => f.endsWith(".json"));
const source = JSON.parse(readFileSync(join(messagesDir, "en.json"), "utf8"));
const sourceKeys = new Set(flattenKeys(source));
const sourceValues = flattenValues(source);

let hasError = false;

for (const file of files) {
  const locale = file.replace(/\.json$/, "");
  const data = JSON.parse(readFileSync(join(messagesDir, file), "utf8"));
  const keys = new Set(flattenKeys(data));

  const missing = [...sourceKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !sourceKeys.has(k));

  if (missing.length > 0 || extra.length > 0) {
    hasError = true;
    console.error(`\n[${locale}] key mismatch vs en.json:`);
    if (missing.length) console.error(`  missing: ${missing.join(", ")}`);
    if (extra.length) console.error(`  extra:   ${extra.join(", ")}`);
    continue;
  }

  if (locale === "en") continue;

  const values = flattenValues(data);
  const placeholderMismatches = [...sourceValues].filter(([key, value]) =>
    placeholders(value).join(",") !== placeholders(values.get(key) ?? "").join(",")
  );

  if (placeholderMismatches.length > 0) {
    hasError = true;
    console.error(`\n[${locale}] ICU placeholder mismatch:`);
    console.error(`  ${placeholderMismatches.map(([key]) => key).join(", ")}`);
    continue;
  }

  const identicalCount = [...sourceValues].filter(
    ([key, value]) => values.get(key) === value
  ).length;
  console.log(`[${locale}] ✓ ${sourceKeys.size} keys · ${identicalCount} values identical to English`);
}

if (hasError) {
  console.error("\nFix the locale catalog errors above before continuing.");
  process.exit(1);
}

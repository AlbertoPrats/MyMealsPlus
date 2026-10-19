// Builds app/data/recipes.json from recetas.md.
// Usage: node tools/build-recipes.mjs [--check]
//   --check  fail if recipes.json is out of date (used in CI)

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../app/js/core/parser.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "recetas.md");
const target = join(root, "app/data/recipes.json");

const markdown = readFileSync(source, "utf8");
const { groups, recipes } = parseMarkdown(markdown);
const version = createHash("sha256").update(markdown).digest("hex").slice(0, 12);
const json = `${JSON.stringify({ version, groups, recipes }, null, 1)}\n`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {}
  if (current !== json) {
    console.error("app/data/recipes.json is out of date: run `npm run build:recipes`.");
    process.exit(1);
  }
  console.log("recipes.json is up to date.");
} else {
  writeFileSync(target, json);
  console.log(`Wrote ${recipes.length} recipes in ${groups.length} groups (version ${version}).`);
}

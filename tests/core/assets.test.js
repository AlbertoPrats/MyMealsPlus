import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("../../app/", import.meta.url));

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [relative(appDir, full)];
  });
}

test("the service worker caches every app file (so it works offline)", () => {
  const sw = readFileSync(join(appDir, "sw.js"), "utf8");
  const assets = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
  const files = listFiles(appDir).filter((f) => f !== "sw.js").sort();
  assert.deepEqual(assets.filter((a) => a !== "./").sort(), files);
});

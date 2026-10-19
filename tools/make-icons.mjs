// Renders app/icons/icon.svg to the PNG sizes iOS / Android need.
// Usage: node tools/make-icons.mjs   (needs the Playwright dev dependency)

import { readFileSync } from "node:fs";

import { chromium } from "playwright";

const dir = new URL("../app/icons/", import.meta.url);
const svg = readFileSync(new URL("icon.svg", dir), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  // iOS rounds the corners itself, so the PNGs are full squares.
  const square = svg.replace('rx="112"', 'rx="0"');
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${square}`);
  await page.screenshot({ path: new URL(`icon-${size}.png`, dir).pathname });
}
await browser.close();
console.log("Icons written.");

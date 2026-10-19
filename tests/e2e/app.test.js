// End-to-end: drives the real app in a phone-sized browser.
// MYMEALS_BROWSER=webkit|chromium (default webkit, Safari's engine).
// SCREENSHOTS=<dir> saves a screenshot of each step.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { chromium, devices, webkit } from "playwright";

import { startServer } from "../../tools/serve.mjs";

const PORT = 8093;
const URL = `http://localhost:${PORT}/`;
const browserName = process.env.MYMEALS_BROWSER ?? "webkit";
const shotsDir = process.env.SCREENSHOTS;

let server;
let browser;
let context;
let page;
const errors = [];

async function shot(name) {
  if (!shotsDir) return;
  await page.waitForTimeout(400); // let sheet/toast animations finish
  // caret "initial": don't inject a <style> (the app's CSP would rightly block it).
  await page.screenshot({ path: `${shotsDir}/${browserName}-${name}.png`, caret: "initial" });
}

const orbCount = () => page.locator(".orb .orb-count").textContent();

/**
 * Re-read until `ok(value)` holds. count() and allTextContents() don't wait,
 * and a page appears a moment after a tab/link changes the URL.
 */
async function settled(read, ok, timeout = 5000) {
  const end = Date.now() + timeout;
  let value = await read();
  while (!ok(value) && Date.now() < end) {
    await page.waitForTimeout(50);
    value = await read();
  }
  return value;
}
const countOf = (selector, ok) => settled(() => page.locator(selector).count(), ok);
const textsOf = (selector, expected) =>
  settled(() => page.locator(selector).allTextContents(), (v) => JSON.stringify(v) === JSON.stringify(expected));

const sheet = () => page.locator(".sheet");

before(async () => {
  server = await startServer(PORT);
  browser = await (browserName === "chromium" ? chromium : webkit).launch();
  const device = devices["iPhone 13"];
  context = await browser.newContext(
    browserName === "chromium" ? { ...device, isMobile: undefined, defaultBrowserType: undefined } : device,
  );
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // Only pins Date (fake timers would freeze animations).
  await page.clock.setFixedTime(new Date("2026-10-19T09:00:00"));
  await page.goto(URL);
  await page.waitForSelector("body.ready");
});

after(async () => {
  await browser?.close();
  server?.close();
});

test("main page shows the week and both meal slots", async () => {
  assert.equal(await page.locator(".day-pill").count(), 7);
  assert.equal(await page.locator(".day-pill.selected .num").textContent(), "19");
  assert.deepEqual(await page.locator(".slot-header h3").allTextContents(), ["Comida", "Cena"]);
  assert.equal(await page.locator(".orb").count(), 0);
  assert.equal(await page.locator(".loading").count(), 0);
  await shot("01-week-empty");
});

test("adding a 4-serving recipe from the filtered list shows the orb", async () => {
  await page.getByRole("button", { name: /Añadir comida el 19 oct/ }).click();
  await sheet().getByRole("button", { name: "Legumbres", exact: true }).click();
  // The last list is "Recetas" (above it: spare rations and "Para ti").
  const recipes = () => sheet().locator("ul.list").last();
  const names = await settled(() => recipes().locator(".item-name").allTextContents(), (v) => v.length === 8);
  assert.equal(names.length, 8);
  await shot("02-picker-legumbres");
  await recipes().getByRole("button", { name: /Chili con carne y alubias/ }).click();
  await page.locator(".toast", { hasText: "Quedan 3 raciones" }).waitFor();
  assert.equal(await countOf(".sheet", (n) => n === 0), 0);
  assert.equal(await orbCount(), "3");
  assert.match(await page.locator(".meal-row").first().textContent(), /Cocinar 4 raciones/);
  await shot("03-week-with-orb");
});

test("spare rations are offered first for the next meal", async () => {
  await page.getByRole("button", { name: /Añadir cena el 19 oct/ }).click();
  const first = sheet().locator(".leftover-item").first();
  assert.match(await first.textContent(), /Chili con carne y alubias/);
  assert.match(await first.textContent(), /Quedan 3/);
  await shot("04-picker-leftovers");
  await first.click();
  assert.equal(await orbCount(), "2");
  assert.equal(await countOf(".meal-row .badge.leftover", (n) => n === 1), 1);
});

test("creating a new meal leaves it as unknown", async () => {
  await page.getByRole("button", { name: "Martes 20 de octubre", exact: false }).click();
  await page.getByRole("button", { name: /Añadir comida el 20 oct/ }).click();
  await sheet().getByRole("tab", { name: "Crear nueva" }).click();
  await shot("05-create-new");
  await sheet().getByLabel("¿Qué vas a comer?").fill("Desconocido");
  await sheet().getByRole("button", { name: /Añadir sin receta/ }).click();
  const row = page.locator(".meal-row").first();
  assert.match(await row.textContent(), /Desconocido/);
  assert.match(await row.textContent(), /por completar/);
});

test("orb sheet lists spare rations and can freeze them", async () => {
  await page.locator(".orb").click();
  assert.match(await sheet().textContent(), /Quedan 2 de 4/);
  await sheet().getByRole("button", { name: /Congelar/ }).click();
  assert.match(await sheet().textContent(), /congelado/);
  await shot("06-leftovers-sheet");
  await sheet().getByRole("button", { name: "Cerrar" }).click();
});

test("meal sheet shows batch details", async () => {
  await page.getByRole("button", { name: "Lunes 19 de octubre", exact: false }).click();
  await page.locator(".meal-row", { hasText: "Chili" }).first().click();
  const text = await sheet().textContent();
  assert.match(text, /4 raciones · quedan 2/);
  await shot("07-meal-sheet");
  await sheet().getByRole("button", { name: "Cerrar" }).click();
});

test("an unknown meal can be completed from Recetas", async () => {
  await page.getByRole("link", { name: "Recetas" }).click();
  assert.match(await page.locator(".list-title").first().textContent(), /Por completar/);
  await page.getByRole("link", { name: /Desconocido/ }).click();
  await page.getByRole("link", { name: "O escribirla a mano" }).click();
  await page.getByLabel("Nombre").fill("Crema de calabaza");
  await page.getByLabel(/Raciones/).fill("3");
  await page.getByLabel(/Días en nevera/).fill("3");
  await page.getByLabel(/Ingredientes/).fill("1 kg de calabaza\n1 cebolla\n2 cda de aceite de oliva\nSal y pimienta");
  await page.getByLabel(/Instrucciones/).fill("Sofríe la cebolla.\nAñade la calabaza y cuece 20 min.\nTritura.");
  await shot("08-editor");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.locator(".recipe-title", { hasText: "Crema de calabaza" }).waitFor();
  assert.match(await page.locator(".ingredients").first().textContent(), /calabaza/);
  // Scaling the servings scales the quantities.
  await page.getByRole("button", { name: "Más" }).click();
  assert.match(await page.locator(".ingredients li").first().textContent(), /1,33 kg/);
  await shot("09-recipe-detail");
});

test("prep page: create, autofill, cook list and shopping list", async () => {
  await page.getByRole("link", { name: "Preparación" }).click();
  await page.getByRole("button", { name: "Crear la primera" }).click();
  await page.getByLabel("Primer día").fill("2026-10-21");
  await sheet().getByRole("button", { name: "Crear" }).click();
  await page.locator(".prep-page").waitFor();
  await page.getByRole("button", { name: /Autocompletar 8 huecos/ }).click();
  await sheet().getByRole("button", { name: "Autocompletar" }).click();
  await page.locator(".toast", { hasText: "comidas añadidas" }).waitFor();
  assert.equal(await countOf(".prep-day", (n) => n === 4), 4);
  assert.equal(await countOf(".prep-page .slot-empty", (n) => n === 0), 0);
  assert.ok(await countOf(".balance-row", (n) => n > 0));
  await shot("10-prep-plan");

  await page.getByRole("tab", { name: "Cocinar" }).click();
  assert.ok((await countOf(".prep-page .list-item", (n) => n >= 2)) >= 2);
  await shot("11-prep-cook");

  await page.getByRole("tab", { name: "Compra" }).click();
  const items = page.locator(".shop-item");
  assert.ok((await countOf(".shop-item", (n) => n > 5)) > 5);
  const firstName = await items.first().locator(".item-name").textContent();
  await items.first().locator("input").click();
  await page.locator(".shop-item.checked").first().waitFor();
  // Checked items move to the bottom section.
  assert.notEqual(await items.first().locator(".item-name").textContent(), firstName);
  await shot("12-prep-shopping");
});

test("data survives a reload (saved on the device)", async () => {
  await page.reload();
  await page.waitForSelector("body.ready");
  await page.getByRole("link", { name: "Semana" }).click();
  assert.match(await page.locator(".meal-row").first().textContent(), /Chili con carne y alubias/);
  await page.getByRole("link", { name: "Recetas" }).click();
  await page.getByRole("link", { name: /Crema de calabaza/ }).waitFor();
});

test("settings: add a meal slot", async () => {
  await page.getByRole("link", { name: "Ajustes" }).click();
  await page.getByPlaceholder(/Desayuno/).fill("Desayuno");
  await page.getByRole("button", { name: "Añadir" }).first().click();
  await page.getByRole("button", { name: "Subir Desayuno" }).click();
  await page.getByRole("button", { name: "Subir Desayuno" }).click();
  await shot("13-settings");
  await page.getByRole("link", { name: "Semana" }).click();
  assert.deepEqual(await textsOf(".slot-header h3", ["Desayuno", "Comida", "Cena"]), ["Desayuno", "Comida", "Cena"]);
});

test("works offline once loaded", async (t) => {
  const ready = await page.evaluate(() =>
    Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 5000))]),
  );
  if (!ready) {
    t.skip("service workers not available in this automated browser");
    return;
  }
  await page.reload();
  await page.waitForSelector("body.ready");
  // Really take the site down (more faithful than the browser's offline switch).
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
  try {
    await page.reload();
    await page.waitForSelector("body.ready");
    assert.equal(await countOf(".day-pill", (n) => n === 7), 7);
    await page.getByRole("link", { name: "Recetas" }).click();
    await page.getByRole("link", { name: /Crema de calabaza/ }).waitFor();
  } finally {
    server = await startServer(PORT);
  }
});

test("no errors in the console", () => {
  // WebKit's screenshot adds a <style>, which the app's CSP rightly refuses: not an app error.
  const ignore = (e) => !!shotsDir && e.startsWith("Refused to apply a stylesheet");
  assert.deepEqual(errors.filter((e) => !ignore(e)), []);
});

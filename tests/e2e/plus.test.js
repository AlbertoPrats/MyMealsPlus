// End-to-end tests of the MyMeals+ features, with a fake AI service.
// MYMEALS_BROWSER=webkit|chromium (default webkit). SCREENSHOTS=<dir> saves screenshots.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { chromium, devices, webkit } from "playwright";

import { startServer } from "../../tools/serve.mjs";

const PORT = 8095;
const URL = `http://localhost:${PORT}/`;
const browserName = process.env.MYMEALS_BROWSER ?? "webkit";
const shotsDir = process.env.SCREENSHOTS;
const KEY = "sk-or-v1-test-0123456789abcdef";

let server;
let browser;
let context;
let page;
const errors = [];
const aiRequests = [];
let brokenRepliesLeft = 0; // makes the fake model answer with chatter first

const RECIPE = {
  name: "Lentejas de la abuela",
  group: "Legumbres",
  servings: 4,
  timeMinutes: 50,
  storageDays: 4,
  freezable: true,
  ingredients: ["300 g de lentejas pardinas", "150 g de chorizo", "1 cebolla", "2 zanahorias", "Sal al gusto"],
  instructions: ["Sofríe la cebolla y la zanahoria.", "Añade lentejas, chorizo y agua; cuece 40 min."],
  nutrition: { kcal: 610, proteinG: 31, carbsG: 70, fatG: 22, fiberG: 14 },
};

/** Fake model: answers according to what the app asked for, like a real one would. */
function fakeReply(body) {
  const user = body.messages[1].content;
  if (brokenRepliesLeft > 0) {
    brokenRepliesLeft -= 1;
    return "¡Claro! Aquí tienes una receta riquísima de lentejas.";
  }
  if (user.includes('{"ok": true}')) return { ok: true };
  if (user.includes("Comida a planificar")) {
    // Pick two of the candidates the app sent (as a model would).
    const candidates = JSON.parse(user.slice(user.indexOf("["))).map((c) => c.name);
    return { suggestions: candidates.slice(0, 2).map((name, i) => ({ name, reason: i ? "Equilibra tu semana." : "Te gusta y hace tiempo que no la comes." })) };
  }
  if (user.includes("recetas NUEVAS")) {
    return { ideas: [{ ...RECIPE, name: "Garbanzos al curry" }, { ...RECIPE, name: "Crema de calabaza", group: null }] };
  }
  if (user.includes("Mensaje del usuario")) {
    return {
      reply: "La he hecho vegetariana: sin carne y con más alubias.",
      mode: "update",
      recipe: { ...RECIPE, name: "Chili vegetariano", ingredients: ["3 botes de alubias rojas, 3 × 400 g", "1 cebolla", "300 g de arroz"] },
    };
  }
  return RECIPE;
}

async function shot(name) {
  if (!shotsDir) return;
  await page.waitForTimeout(400);
  // caret "initial": don't inject a <style> (the app's CSP would rightly block it).
  await page.screenshot({ path: `${shotsDir}/${browserName}-plus-${name}.png`, caret: "initial" });
}

const sheet = () => page.locator(".sheet");
const lastUser = () => aiRequests.at(-1).body.messages[1].content;

async function settled(read, ok, timeout = 5000) {
  const end = Date.now() + timeout;
  let value = await read();
  while (!ok(value) && Date.now() < end) {
    await page.waitForTimeout(50);
    value = await read();
  }
  return value;
}

before(async () => {
  server = await startServer(PORT);
  browser = await (browserName === "chromium" ? chromium : webkit).launch();
  const device = devices["iPhone 13"];
  context = await browser.newContext({
    ...(browserName === "chromium" ? { ...device, isMobile: undefined, defaultBrowserType: undefined } : device),
    // With a service worker in control, WebKit sends requests past Playwright's
    // interception (they'd reach the real AI service). Offline is tested in app.test.js.
    serviceWorkers: "block",
  });
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.route("https://openrouter.ai/api/v1/chat/completions", async (route) => {
    const req = route.request();
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type, x-title",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    // WebKit routes the CORS preflight too; answer it like the real service.
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(req.postData());
    aiRequests.push({ headers: req.headers(), body });
    const reply = fakeReply(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: cors,
      body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: typeof reply === "string" ? reply : JSON.stringify(reply) } }] }),
    });
  });
  await page.clock.setFixedTime(new Date("2026-10-19T09:00:00"));
  await page.goto(URL);
  await page.waitForSelector("body.ready");
});

after(async () => {
  await browser?.close();
  server?.close();
});

test("own storage, separate from the original MyMeals", async () => {
  const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  assert.ok(names.includes("mymealsplus"));
  assert.ok(!names.includes("mymeals"));
  assert.equal(await page.title(), "MyMeals+");
  assert.equal(await page.locator(".tab-bar a").count(), 5);
});

test("connections to sites outside the two free services are blocked", async () => {
  const blocked = await page.evaluate(async () => {
    const tryFetch = async (url) => {
      try {
        await fetch(url);
        return false;
      } catch {
        return true;
      }
    };
    return [await tryFetch("https://example.com/steal"), await tryFetch("https://api.anthropic.com/v1/messages")];
  });
  assert.deepEqual(blocked, [true, true]);
  errors.length = 0; // the browser logs the blocked requests: expected here
});

test("without a key, the assistant explains how to set it up", async () => {
  await page.getByRole("button", { name: /Añadir comida el 19 oct/ }).click();
  await sheet().getByRole("tab", { name: "Crear nueva" }).click();
  await sheet().getByLabel("¿Qué vas a comer?").fill("lentejas");
  await sheet().getByRole("button", { name: /Crear receta con el asistente/ }).click();
  await sheet().getByText(/añade una clave gratuita de OpenRouter o Groq/).waitFor();
  assert.equal(aiRequests.length, 0);
  await shot("00-no-key");
  await sheet().getByRole("button", { name: /Ir a Ajustes/ }).click();
  await page.locator(".ai-settings").waitFor();
});

test("settings: only the free services, key stored on the device only", async () => {
  const options = await page.locator(".provider .item-name").allTextContents();
  assert.deepEqual(options, ["OpenRouter · solo modelos gratis", "Groq · plan gratuito"]);
  await page.getByRole("radio", { name: /OpenRouter/ }).check();
  await page.getByLabel("Clave de la API").fill(KEY);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.locator(".ai-settings code", { hasText: "sk-or-…cdef" }).waitFor();
  assert.equal(await page.getByLabel("Clave de la API").inputValue(), "");
  await page.getByRole("button", { name: "Probar" }).click();
  await page.locator(".toast", { hasText: "Funciona correctamente" }).waitFor();
  await shot("01-settings");

  const exported = await page.evaluate(async () => (await import("./js/store.js")).store.exportJson());
  assert.ok(!exported.includes(KEY));
  assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).includes(KEY));
  const ping = aiRequests.at(-1);
  assert.equal(ping.headers.authorization, `Bearer ${KEY}`);
  assert.equal(ping.body.model, "openrouter/free");

  // A paid model can't even be selected.
  await page.getByRole("combobox", { name: "Modelo" }).fill("openai/gpt-5");
  await page.getByRole("combobox", { name: "Modelo" }).press("Enter");
  await page.locator(".ai-settings .alert", { hasText: "Solo se permiten modelos gratuitos" }).waitFor();
  await page.getByRole("combobox", { name: "Modelo" }).fill("openrouter/free");
  await page.getByRole("combobox", { name: "Modelo" }).press("Enter");
});

test("creation: described in words, the model writes the recipe (and fixes a bad reply)", async () => {
  await page.getByRole("link", { name: "Semana" }).click();
  await page.getByRole("button", { name: /Añadir comida el 19 oct/ }).click();
  await sheet().getByRole("tab", { name: "Crear nueva" }).click();
  await sheet().getByLabel("¿Qué vas a comer?").fill("las lentejas de mi abuela con chorizo, para 4");
  await shot("02-describe");
  const before = aiRequests.length;
  brokenRepliesLeft = 1;
  await sheet().getByRole("button", { name: /Crear receta con el asistente/ }).click();
  await sheet().locator(".preview-title", { hasText: "Lentejas de la abuela" }).waitFor();
  // First reply wasn't JSON: the app asked the model once to correct it.
  assert.equal(aiRequests.length, before + 2);
  const fix = aiRequests.at(-1).body.messages;
  assert.match(fix.at(-1).content, /No he podido usar tu respuesta/);
  assert.match(fix[1].content, /Descripción: «las lentejas de mi abuela con chorizo, para 4»/);
  assert.match(fix[0].content, /Grupos de comida disponibles/);
  assert.match(await sheet().locator(".preview").textContent(), /4 raciones/);
  await shot("03-preview");
  await sheet().getByRole("button", { name: /Guardar y añadir/ }).click();
  const row = page.locator(".meal-row").first();
  await row.waitFor();
  assert.match(await row.textContent(), /Lentejas de la abuela/);
  assert.match(await row.textContent(), /Cocinar 4 raciones/);
});

test("suggestions in the + sheet come from the model, with reasons", async () => {
  await page.getByRole("button", { name: /Añadir cena el 19 oct/ }).click();
  await sheet().getByLabel("Antojo").fill("algo ligero");
  await sheet().getByRole("button", { name: "Sugerir" }).click();
  const picks = sheet().locator(".ai-suggest .list-item");
  await picks.first().waitFor();
  assert.equal(await picks.count(), 2);
  assert.match(await picks.first().textContent(), /Te gusta y hace tiempo que no la comes/);
  const user = lastUser();
  assert.match(user, /Comida a planificar: Cena del lunes 19 de octubre/);
  assert.match(user, /Lo que pide el usuario: «algo ligero»/);
  assert.match(user, /Ya planificado esta semana: lunes comida: Lentejas de la abuela/);
  assert.match(user, /Ya hay sobras disponibles.*Lentejas de la abuela \(3 raciones\)/);
  await shot("04-suggest");
  const name = (await picks.first().locator(".item-name").textContent()).trim();
  await picks.first().click();
  await page.locator(".meal-row", { hasText: name }).waitFor();
});

test("modification: the assistant changes a recipe; you review and apply", async () => {
  await page.getByRole("link", { name: "Recetas" }).click();
  await page.getByRole("link", { name: /Chili con carne y alubias/ }).click();
  await page.getByRole("button", { name: /Modificar con el asistente/ }).click();
  await page.locator(".assistant-page").waitFor();
  await page.getByRole("button", { name: "Hazla vegetariana" }).click();
  const proposal = page.locator(".proposal").last();
  await proposal.waitFor();
  assert.match(await page.locator(".bubble.assistant").last().textContent(), /vegetariana/);
  assert.match(await proposal.textContent(), /Nombre: «Chili con carne y alubias» → «Chili vegetariano»/);
  assert.match(lastUser(), /Receta actual \(JSON\):\n\{"name":"Chili con carne y alubias"/);
  assert.match(lastUser(), /Mensaje del usuario: «Hazla vegetariana»/);
  await shot("05-modify");
  await proposal.getByRole("button", { name: /Aplicar a/ }).click();
  await page.getByText(/Aplicado a/).first().waitFor();
  await page.getByRole("link", { name: "Recetas" }).click();
  await page.getByRole("link", { name: /Chili vegetariano/ }).waitFor();
});

test("assistant: '¿Qué como?' suggests for the next open meal", async () => {
  await page.getByRole("link", { name: "Asistente" }).click();
  await page.getByRole("button", { name: /¿Qué como\?/ }).click();
  const picks = page.locator(".bubble.assistant .pick");
  await picks.first().waitFor();
  assert.match(await page.locator(".bubble.assistant").last().textContent(), /Para la comida del martes 20 oct/);
  assert.match(lastUser(), /Comida a planificar: Comida del martes 20 de octubre/);
  await picks.first().getByRole("button", { name: "Añadir" }).click();
  await page.locator(".bubble.assistant .pick", { hasText: "Añadida" }).waitFor();
  await shot("06-what-to-eat");
});

test("assistant: ideas for new recipes from your tastes", async () => {
  await page.getByRole("button", { name: /Ideas para mí/ }).click();
  await page.locator(".preview-title", { hasText: "Garbanzos al curry" }).waitFor();
  assert.match(lastUser(), /Prioriza los grupos donde faltan/);
  assert.equal(await page.locator(".bubble.assistant").last().locator(".preview").count(), 2);
  await page.getByRole("button", { name: "Guardar receta" }).first().click();
  await page.locator(".toast", { hasText: "Garbanzos al curry" }).waitFor();
});

test("history, stats and favourites", async () => {
  await page.getByRole("link", { name: "Semana" }).click();
  await page.locator(".meal-row", { hasText: "Lentejas de la abuela" }).first().click();
  await sheet().locator(".row-setting", { hasText: "Ya comido" }).locator("input").check();
  await sheet().getByRole("button", { name: "Cerrar" }).click();
  await page.getByRole("link", { name: "Recetas" }).click();
  await page.getByRole("link", { name: /Lentejas de la abuela/ }).click();
  await page.getByText(/Hecha 1 vez · 1 comida/).waitFor();
  await page.getByRole("button", { name: "Marcar como favorita" }).click();
  await page.getByRole("link", { name: "Volver" }).click();
  await page.getByRole("button", { name: /Favoritas/ }).click();
  const names = await settled(() => page.locator(".list-item .item-name").allTextContents(), (v) => v.length === 1);
  assert.deepEqual(names.map((n) => n.trim()), ["Lentejas de la abuela"]);
  await page.getByRole("button", { name: /Favoritas/ }).click();
});

test("the key can be forgotten", async () => {
  await page.getByRole("link", { name: "Ajustes" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Borrar", exact: true }).click();
  await page.getByText("sin guardar").waitFor();
});

test("no errors in the console (including CSP violations)", () => {
  // WebKit's screenshot adds a <style>, which the app's CSP rightly refuses: not an app error.
  const ignore = (e) => !!shotsDir && e.startsWith("Refused to apply a stylesheet");
  assert.deepEqual(errors.filter((e) => !ignore(e)), []);
});

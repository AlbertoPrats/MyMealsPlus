import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseIngredientLine, parseIngredientText, parseMarkdown } from "../../app/js/core/parser.js";

const markdown = readFileSync(new URL("../../recetas.md", import.meta.url), "utf8");

test("parses all recipes and groups", () => {
  const { groups, recipes } = parseMarkdown(markdown);
  assert.deepEqual(groups.map((g) => g.name), ["Legumbres", "Pescado", "Pollo", "Carne roja / cerdo", "Huevos"]);
  assert.deepEqual([groups[3].weeklyMin, groups[3].weeklyMax], [1, 2]);
  assert.equal(groups[1].note, "1 azul");
  assert.equal(recipes.length, 37);
  assert.ok(recipes.every((r) => r.ingredients.length && r.instructions.length && r.nutrition.kcal));

  const lasagna = recipes.find((r) => r.name === "Lasaña de carne");
  assert.deepEqual(
    [lasagna.servings, lasagna.timeMinutes, lasagna.storageDays, lasagna.freezable],
    [6, 75, 4, true],
  );
  assert.equal(recipes.find((r) => r.name.startsWith("Poke")).storageDays, 0);
});

test("ingredient with size annotation and Swedish name", () => {
  const [i] = parseIngredientLine("1 bote de garbanzos (kikärtor), 400 g (240 g escurridos)");
  assert.deepEqual([i.quantity, i.unit, i.name, i.key, i.swedishName], [1, "bote", "garbanzos", "garbanzo", "kikärtor"]);
  assert.match(i.note, /400 g; 240 g escurridos/);
});

test("multi-ingredient line with a section", () => {
  const items = parseIngredientLine("Bechamel: 50 g de mantequilla, 50 g de harina, 700 ml de leche, nuez moscada");
  assert.deepEqual(
    items.map((i) => [i.quantity, i.unit, i.name]),
    [[50, "g", "mantequilla"], [50, "g", "harina"], [700, "ml", "leche"], [null, null, "nuez moscada"]],
  );
  assert.ok(items.every((i) => i.section === "Bechamel"));
  assert.ok(items.at(-1).toTaste);
});

test("fractions, ranges and multipliers", () => {
  assert.equal(parseIngredientLine("½ cebolla roja")[0].quantity, 0.5);
  assert.equal(parseIngredientLine("1½ cda de aceite")[0].quantity, 1.5);
  assert.equal(parseIngredientLine("3–5 cda de agua fría")[0].quantity, 5);
  const [atun] = parseIngredientLine("2 latas de atún al natural (tonfisk i vatten), 2 × 120 g");
  assert.deepEqual([atun.quantity, atun.unit], [2, "lata"]);
  const [lemon] = parseIngredientLine("Zumo de 1 limón");
  assert.deepEqual([lemon.quantity, lemon.name, lemon.note], [1, "limón", "zumo"]);
});

test("descriptive fragments stay with their ingredient", () => {
  const items = parseIngredientLine(
    "200 g de salmón apto para crudo, congelado previamente (mín. 24 h a −20 °C) y descongelado en nevera",
  );
  assert.equal(items.length, 1);
  assert.match(items[0].note, /congelado previamente/);
  const [eggs] = parseIngredientLine("2 huevos + 1 yema");
  assert.deepEqual([eggs.quantity, eggs.key, eggs.note], [2, "huevo", "1 yema"]);
});

test("free text typed in the recipe editor", () => {
  const items = parseIngredientText("- 1 kg de calabaza\n\n• 1 cebolla, sal y pimienta\n");
  assert.deepEqual(
    items.map((i) => [i.quantity, i.unit, i.name]),
    [[1, "kg", "calabaza"], [1, null, "cebolla"], [null, null, "sal"], [null, null, "pimienta"]],
  );
});

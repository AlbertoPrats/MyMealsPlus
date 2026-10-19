import assert from "node:assert/strict";
import { test } from "node:test";

import { autofill } from "../../app/js/core/autofill.js";
import { addDays } from "../../app/js/core/dates.js";
import * as P from "../../app/js/core/planner.js";
import { buildShoppingList, shoppingListText } from "../../app/js/core/shopping.js";
import { MON, freshState } from "./helpers.js";

const day = (n) => addDays(MON, n);
const byKey = (list) => Object.fromEntries(list.items.map((i) => [i.key, i]));

test("shopping list counts batches, not leftovers", () => {
  const { s, comida, cena, recipe } = freshState();
  const chili = P.addMeal(s, { date: day(0), mealTypeId: comida, recipeId: recipe("Chili con carne y alubias") });
  P.addMeal(s, { date: day(0), mealTypeId: cena, batchId: chili.batchId });
  P.addMeal(s, { date: day(1), mealTypeId: comida, batchId: chili.batchId });
  P.addMeal(s, { date: day(1), mealTypeId: cena, recipeId: recipe("Dal de lentejas rojas") });

  const list = buildShoppingList(s, day(0), day(6));
  const items = byKey(list);
  assert.deepEqual(items.arroz.amounts, [{ quantity: 600, unit: "g" }]);
  assert.deepEqual(items.cebolla.amounts, [{ quantity: 2, unit: null }]);
  assert.deepEqual(items.arroz.recipes.sort(), ["Chili con carne y alubias", "Dal de lentejas rojas"]);
  assert.equal(items["alubia roja"].swedishName, "kidneybönor");
  assert.equal(items.agua.inPantry, true);
  const last = list.items.at(-1);
  assert.ok(last.inPantry || last.toTaste);

  const text = shoppingListText(list);
  assert.match(text, /• arroz — 600 g/);
  assert.match(text, /ajo — \d+ dientes/);
  assert.doesNotMatch(text, /agua/);
});

test("shopping list scales batches and converts units", () => {
  const { s, comida, recipe } = freshState();
  P.addMeal(s, { date: day(0), mealTypeId: comida, recipeId: recipe("Lasaña de carne"), scale: 2 });
  P.addMeal(s, { date: day(1), mealTypeId: comida, recipeId: recipe("Albóndigas en airfryer con salsa de tomate") });
  const items = byKey(buildShoppingList(s, day(0), day(1)));
  assert.deepEqual(items["carne picada"].amounts, [{ quantity: 1.5, unit: "kg" }]);
  assert.deepEqual(items.leche.amounts, [{ quantity: 1.4, unit: "l" }]);
});

test("unknown meals are listed separately and checks sink to the bottom", () => {
  const { s, cena, recipe } = freshState();
  const unknown = P.addMeal(s, { date: day(0), mealTypeId: cena, newMeal: { name: "Cena con amigos" } });
  P.addMeal(s, { date: day(1), mealTypeId: cena, recipeId: recipe("Shakshuka") });
  const prep = P.createPrep(s, { startDate: day(0), days: 3 });
  P.toggleCheck(s, prep.id, "huevo", true);
  const list = buildShoppingList(s, day(0), day(2), prep.checks);
  assert.deepEqual(list.unknownRecipes.map((r) => r.name), ["Cena con amigos"]);
  assert.equal(list.items.at(-1).key, "huevo");
  assert.equal(list.items.at(-1).checked, true);
  P.toggleCheck(s, prep.id, "huevo", false);
  assert.deepEqual(prep.checks, []);
  assert.ok(unknown);
});

test("autofill fills every slot, reusing spare rations", () => {
  const { s } = freshState();
  const prep = P.createPrep(s, { startDate: day(0), days: 4 });
  const { created, unfilled } = autofill(s, prep, { seed: 1 });
  assert.equal(created.length, 8);
  assert.deepEqual(unfilled, []);
  const views = created.map((m) => P.mealView(s, m));
  const leftovers = views.filter((v) => v.isLeftover).length;
  assert.ok(leftovers > 0);
  assert.equal(P.batchesCookedBetween(s, ...P.prepRange(prep)).length, 8 - leftovers);
  assert.ok(views.every((v) => v.warnings.length === 0));
  assert.ok(P.calendar(s, day(0), 4).every((d) => d.nutrition.kcal > 0));

  // Second run: nothing left to fill.
  assert.equal(autofill(s, prep, { seed: 1 }).created.length, 0);

  P.deletePrep(s, prep.id, { clearMeals: true });
  assert.equal(s.meals.length, 0);
  assert.equal(s.batches.length, 0);
});

test("autofill can cook everything on the prep day, respecting fridge life", () => {
  const { s } = freshState();
  const prepDay = day(-1);
  const prep = P.createPrep(s, { startDate: day(0), days: 5, prepDate: prepDay });
  const { created } = autofill(s, prep, { seed: 3, cookOnPrepDay: true });
  assert.equal(created.length, 10);
  const cookDates = new Set(P.batchesCookedBetween(s, ...P.prepRange(prep)).map((b) => b.cookDate));
  // Nothing keeps 5 days in the fridge, so only the last day is cooked fresh.
  assert.ok([...cookDates].every((d) => d === prepDay || d === day(4)));
  assert.ok(cookDates.has(prepDay));
  assert.ok(created.every((m) => P.mealView(s, m).warnings.length === 0));
});

test("autofill doesn't let one batch crowd out other groups", () => {
  const { s } = freshState();
  const prep = P.createPrep(s, { startDate: day(0), days: 4 });
  autofill(s, prep, { seed: 1 });
  for (const g of P.balance(s, day(0), 4)) {
    if (g.targetMax != null) assert.ok(g.meals <= Math.ceil(g.targetMax), `${g.groupName}: ${g.meals}`);
  }
});

test("autofill balances food groups over a week", () => {
  const { s } = freshState();
  const prep = P.createPrep(s, { startDate: day(0), days: 7 });
  autofill(s, prep, { seed: 7 });
  const b = P.balance(s, day(0), 7);
  assert.equal(b.reduce((n, g) => n + g.meals, 0), 14);
  assert.ok(b.every((g) => g.meals > 0));
});

test("autofill respects group filter and max new recipes", () => {
  const { s } = freshState();
  const fish = s.groups.find((g) => g.name === "Pescado").id;
  const prep = P.createPrep(s, { startDate: day(0), days: 3 });
  const { created, unfilled } = autofill(s, prep, { seed: 2, groupIds: [fish], maxNewRecipes: 2 });
  assert.ok(created.every((m) => P.mealView(s, m).recipe.groupId === fish));
  assert.equal(new Set(created.map((m) => m.batchId)).size, 2);
  assert.ok(unfilled.length > 0);
});

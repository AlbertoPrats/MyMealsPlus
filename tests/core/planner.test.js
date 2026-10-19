import assert from "node:assert/strict";
import { test } from "node:test";

import { addDays, startOfWeek } from "../../app/js/core/dates.js";
import * as P from "../../app/js/core/planner.js";
import { ConflictError, applyChange, mergeSeed } from "../../app/js/core/state.js";
import { MON, SEED, freshState } from "./helpers.js";

const day = (n) => addDays(MON, n);

test("dates", () => {
  assert.equal(startOfWeek("2026-10-25"), MON);
  assert.equal(startOfWeek(MON), MON);
  assert.equal(addDays("2026-03-28", 2), "2026-03-30"); // across DST
});

test("calendar shows the day with default slots", () => {
  const { s } = freshState();
  const days = P.calendar(s, MON, 7);
  assert.equal(days.length, 7);
  assert.deepEqual(days[0].slots.map((x) => x.mealType.name), ["Comida", "Cena"]);
  assert.equal(P.leftovers(s, MON).totalSpareServings, 0);
});

test("cooking a multi-serving recipe creates spare rations", () => {
  const { s, comida, cena, recipe } = freshState();
  const chili = recipe("Chili con carne y alubias"); // 4 servings, 4 days

  const meal = P.addMeal(s, { date: day(0), mealTypeId: comida, recipeId: chili });
  const view = P.mealView(s, meal);
  assert.equal(view.isLeftover, false);
  assert.equal(view.batch.remainingServings, 3);

  const orb = P.leftovers(s, day(0));
  assert.equal(orb.totalSpareServings, 3);
  assert.equal(orb.batches[0].expiresOn, day(4));

  // Offered first for a later slot...
  const pick = P.picker(s, { date: day(0), mealTypeId: cena });
  assert.deepEqual(pick.leftovers.map((b) => b.recipeId), [chili]);
  assert.equal(pick.recipes.length, 37);
  // ...but not before it is cooked.
  assert.deepEqual(P.picker(s, { date: day(-1), mealTypeId: cena }).leftovers, []);

  const left = P.addMeal(s, { date: day(0), mealTypeId: cena, batchId: meal.batchId });
  assert.equal(P.mealView(s, left).isLeftover, true);
  P.addMeal(s, { date: day(1), mealTypeId: cena, batchId: meal.batchId, servings: 2 });
  assert.throws(() => P.addMeal(s, { date: day(2), mealTypeId: cena, batchId: meal.batchId }), ConflictError);
});

test("picker filters by group and search text", () => {
  const { s, cena } = freshState();
  const fish = s.groups.find((g) => g.name === "Pescado");
  const pick = P.picker(s, { date: MON, mealTypeId: cena, groupId: fish.id });
  assert.equal(pick.recipes.length, 8);
  assert.ok(pick.recipes.every((r) => r.groupName === "Pescado"));
  assert.deepEqual(P.picker(s, { date: MON, mealTypeId: cena, q: "lasaña" }).recipes.map((r) => r.name), ["Lasaña de carne"]);
});

test("cannot eat leftovers before cooking", () => {
  const { s, comida, cena, recipe } = freshState();
  const meal = P.addMeal(s, { date: day(1), mealTypeId: cena, recipeId: recipe("Dal de lentejas rojas") });
  assert.throws(() => P.addMeal(s, { date: day(1), mealTypeId: comida, batchId: meal.batchId }), ConflictError);
  assert.throws(() => P.addMeal(s, { date: day(0), mealTypeId: cena, batchId: meal.batchId }), ConflictError);
});

test("expired leftovers are hidden; freezing keeps them", () => {
  const { s, comida, recipe } = freshState();
  const meal = P.addMeal(s, { date: day(0), mealTypeId: comida, recipeId: recipe("Salmón en airfryer con patatas y brócoli") });
  assert.deepEqual(P.picker(s, { date: day(3), mealTypeId: comida }).leftovers, []);
  const late = P.addMeal(s, { date: day(3), mealTypeId: comida, batchId: meal.batchId });
  assert.match(P.mealView(s, late).warnings[0], /nevera/);

  P.deleteMeal(s, late.id);
  P.updateBatch(s, meal.batchId, { frozen: true });
  const pick = P.picker(s, { date: day(3), mealTypeId: comida });
  assert.deepEqual(pick.leftovers.map((b) => b.id), [meal.batchId]);
  assert.equal(pick.leftovers[0].expiresOn, null);
});

test("a new meal is unknown until completed", () => {
  const { s, cena } = freshState();
  const meal = P.addMeal(s, { date: day(0), mealTypeId: cena, newMeal: {} });
  const view = P.mealView(s, meal);
  assert.equal(view.recipe.name, "Desconocido");
  assert.equal(view.recipe.status, "unknown");
  assert.deepEqual(view.warnings, ["Receta pendiente de completar."]);

  const r = P.saveRecipe(
    s,
    { name: "Crema de calabaza", servings: 3, ingredientsText: "1 kg de calabaza\n1 cebolla, sal y pimienta", instructions: ["Cocer"] },
    view.recipe.id,
  );
  assert.equal(r.status, "complete");
  assert.deepEqual(r.ingredients.slice(0, 2).map((i) => [i.quantity, i.unit, i.name]), [[1, "kg", "calabaza"], [1, null, "cebolla"]]);
});

test("deleting meals moves or removes the batch", () => {
  const { s, comida, cena, recipe } = freshState();
  const cook = P.addMeal(s, { date: day(0), mealTypeId: cena, recipeId: recipe("Lasaña de carne") });
  const later = P.addMeal(s, { date: day(2), mealTypeId: comida, batchId: cook.batchId });

  P.deleteMeal(s, cook.id);
  const batch = P.getBatch(s, cook.batchId);
  assert.deepEqual([batch.cookDate, batch.cookMealTypeId], [day(2), comida]);
  assert.equal(P.mealView(s, later).isLeftover, false);

  P.deleteMeal(s, later.id);
  assert.equal(s.batches.length, 0);
  assert.equal(P.leftovers(s, day(0)).totalSpareServings, 0);
});

test("moving the cooking meal moves the batch", () => {
  const { s, comida, cena, recipe } = freshState();
  const cook = P.addMeal(s, { date: day(0), mealTypeId: comida, recipeId: recipe("Curry de pollo con leche de coco") });
  const leftover = P.addMeal(s, { date: day(1), mealTypeId: cena, batchId: cook.batchId });
  P.updateMeal(s, cook.id, { date: day(1) });
  assert.equal(P.getBatch(s, cook.batchId).cookDate, day(1));
  // Moving it after its own leftovers is refused, and the failed change is discarded.
  assert.throws(() => applyChange(s, (d) => P.updateMeal(d, cook.id, { date: day(2) })), ConflictError);
  assert.equal(P.getMeal(s, cook.id).date, day(1));
  assert.equal(P.mealView(s, leftover).isLeftover, true);
});

test("prep-day batches are available for any slot that day", () => {
  const { s, comida, recipe } = freshState();
  const batch = P.createBatch(s, { recipeId: recipe("Lasaña de carne"), cookDate: day(-1) });
  assert.equal(P.leftovers(s, day(0)).totalSpareServings, 6);
  P.addMeal(s, { date: day(-1), mealTypeId: comida, batchId: batch.id });
  // Not auto-created: removing all meals keeps it.
  P.deleteMeal(s, s.meals[0].id);
  assert.equal(s.batches.length, 1);
});

test("scaling", () => {
  const { s, comida, recipe } = freshState();
  const chili = P.getRecipe(s, recipe("Chili con carne y alubias"));
  const meat = P.scaledIngredients(chili, 8).find((i) => i.key === "carne picada");
  assert.equal(meat.quantity, 500);
  const meal = P.addMeal(s, { date: MON, mealTypeId: comida, recipeId: chili.id, scale: 2 });
  assert.equal(P.getBatch(s, meal.batchId).totalServings, 8);
  P.updateBatch(s, meal.batchId, { scale: 1 });
  assert.equal(P.getBatch(s, meal.batchId).totalServings, 4);
  assert.throws(() => P.updateBatch(s, meal.batchId, { discardedServings: 4 }), ConflictError);
});

test("balance counts meals per group against pro-rated targets", () => {
  const { s, comida, cena, recipe } = freshState();
  const m = P.addMeal(s, { date: MON, mealTypeId: comida, recipeId: recipe("Dal de lentejas rojas") });
  P.addMeal(s, { date: MON, mealTypeId: cena, batchId: m.batchId });
  const b = P.balance(s, MON, 7);
  const leg = b.find((g) => g.groupName === "Legumbres");
  assert.deepEqual([leg.meals, leg.targetMin, leg.status], [2, 3, "below"]);
  // 2 meals in 2 days is above the pro-rated 3–4 per week; in 4 days it is fine.
  assert.equal(P.balance(s, MON, 2).find((g) => g.groupName === "Legumbres").status, "above");
  assert.equal(P.balance(s, MON, 4).find((g) => g.groupName === "Legumbres").status, "ok");
});

test("meal types: add and reorder, refusing orders that break leftovers", () => {
  const { s, comida, cena, recipe } = freshState();
  const desayuno = P.addMealType(s, "Desayuno");
  assert.throws(() => P.addMealType(s, "desayuno"), ConflictError);
  P.moveMealType(s, desayuno.id, -1);
  P.moveMealType(s, desayuno.id, -1);
  assert.deepEqual(P.sortedMealTypes(s).map((t) => t.name), ["Desayuno", "Comida", "Cena"]);

  const cook = P.addMeal(s, { date: MON, mealTypeId: comida, recipeId: recipe("Lasaña de carne") });
  P.addMeal(s, { date: MON, mealTypeId: cena, batchId: cook.batchId });
  assert.throws(() => P.moveMealType(s, cena, -1), ConflictError);
});

test("re-merging the seed updates bundled recipes but keeps user edits", () => {
  const { s, recipe } = freshState();
  const id = recipe("Shakshuka");
  P.saveRecipe(s, { name: "Shakshuka", servings: 3, ingredientsText: "4 huevos" }, id);
  const result = mergeSeed(s, SEED);
  assert.deepEqual(result, { created: 0, updated: 36 });
  assert.equal(P.getRecipe(s, id).servings, 3);
  assert.equal(s.recipes.length, 37);
});

test("deleting a planned recipe needs force", () => {
  const { s, comida, recipe } = freshState();
  const id = recipe("Shakshuka");
  P.addMeal(s, { date: MON, mealTypeId: comida, recipeId: id });
  assert.throws(() => P.deleteRecipe(s, id), ConflictError);
  P.deleteRecipe(s, id, { force: true });
  assert.equal(s.meals.length, 0);
  assert.equal(s.batches.length, 0);
});

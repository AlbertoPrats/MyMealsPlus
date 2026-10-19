import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AiFormatError,
  assistantTask,
  describeChanges,
  ideasTask,
  newRecipeTask,
  parseAssistantReply,
  parseIdeasReply,
  parseJsonReply,
  parseRecipeReply,
  recipeToJson,
} from "../../app/js/core/ai-recipes.js";
import { autofill } from "../../app/js/core/autofill.js";
import { addDays } from "../../app/js/core/dates.js";
import { recipeStats, sinceText, statsFor, syncHistory } from "../../app/js/core/history.js";
import * as P from "../../app/js/core/planner.js";
import { migrateState, validateBackup } from "../../app/js/core/state.js";
import { suggestions, tasteProfile } from "../../app/js/core/suggest.js";
import { MON, freshState } from "./helpers.js";

const day = (n) => addDays(MON, n);

// ------------------------------------------------------------------ history

test("history records meals once their day has passed or they are eaten", () => {
  const { s, comida, cena, recipe } = freshState();
  const chili = P.addMeal(s, { date: day(0), mealTypeId: comida, recipeId: recipe("Chili con carne y alubias") });
  P.addMeal(s, { date: day(1), mealTypeId: cena, batchId: chili.batchId });
  const future = P.addMeal(s, { date: day(3), mealTypeId: comida, recipeId: recipe("Shakshuka") });

  syncHistory(s, day(2));
  assert.deepEqual(statsFor(s, recipe("Chili con carne y alubias")), { timesCooked: 1, timesEaten: 2, lastDate: day(1) });
  assert.equal(statsFor(s, recipe("Shakshuka")).timesEaten, 0);

  // Marking today's/future meal as eaten counts it; un-marking removes it.
  P.updateMeal(s, future.id, { eaten: true });
  syncHistory(s, day(2));
  assert.equal(statsFor(s, recipe("Shakshuka")).timesEaten, 1);
  P.updateMeal(s, future.id, { eaten: false });
  syncHistory(s, day(2));
  assert.equal(statsFor(s, recipe("Shakshuka")).timesEaten, 0);
});

test("history survives clearing the plan", () => {
  const { s, comida, recipe } = freshState();
  const prep = P.createPrep(s, { startDate: day(0), days: 2 });
  P.addMeal(s, { date: day(0), mealTypeId: comida, recipeId: recipe("Lasaña de carne") });
  syncHistory(s, day(5));
  P.deletePrep(s, prep.id, { clearMeals: true });
  syncHistory(s, day(5));
  assert.equal(s.meals.length, 0);
  assert.equal(statsFor(s, recipe("Lasaña de carne")).timesEaten, 1);
  assert.equal(sinceText(day(0), day(5)), "hace 5 días");
});

// --------------------------------------------------------------- suggestions

test("suggestions favour favourites and what you eat, not what you just had", () => {
  const { s, comida, recipe } = freshState();
  const curry = recipe("Curry de pollo con leche de coco");
  const dal = recipe("Dal de lentejas rojas");
  P.getRecipe(s, curry).favorite = true;
  // Dal eaten three times, long ago.
  for (const n of [-40, -30, -25]) P.addMeal(s, { date: day(n), mealTypeId: comida, recipeId: dal });
  syncHistory(s, day(0));

  const top = suggestions(s, day(0), { limit: 5 });
  const ids = top.map((x) => x.recipe.id);
  assert.ok(ids.includes(curry) && ids.includes(dal));
  assert.ok(top.find((x) => x.recipe.id === curry).reasons.includes("Favorita"));
  assert.ok(top.find((x) => x.recipe.id === dal).reasons.some((r) => /3 veces/.test(r)));

  // Eaten yesterday: drops out of the top.
  P.addMeal(s, { date: day(-1), mealTypeId: comida, recipeId: dal });
  syncHistory(s, day(0));
  assert.ok(!suggestions(s, day(0), { limit: 3 }).some((x) => x.recipe.id === dal));

  const profile = tasteProfile(s);
  assert.deepEqual(profile.favorites, ["Curry de pollo con leche de coco"]);
  assert.match(profile.mostEaten[0], /Dal de lentejas rojas \(4\)/);
});

test("suggestions can be limited to a group", () => {
  const { s } = freshState();
  const fish = s.groups.find((g) => g.name === "Pescado").id;
  assert.ok(suggestions(s, day(0), { limit: 4, groupId: fish }).every((x) => x.recipe.groupId === fish));
});

test("autofill leans towards favourites", () => {
  const weeksWith = (favorite) => {
    let n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { s, recipe } = freshState();
      const id = recipe("Pollo teriyaki con arroz y brócoli");
      P.getRecipe(s, id).favorite = favorite;
      autofill(s, P.createPrep(s, { startDate: day(0), days: 7 }), { seed });
      if (s.batches.some((b) => b.recipeId === id)) n += 1;
    }
    return n;
  };
  const [plain, fav] = [weeksWith(false), weeksWith(true)];
  // Balance still comes first (chicken ~1×/week), but the favourite wins that slot far more often.
  assert.ok(fav >= 2 * plain && fav >= 12, `favourite in ${fav}/40 weeks vs ${plain}/40 without`);
});

// ---------------------------------------------------------------- backups

test("a backup from the original MyMeals can be restored", () => {
  const { s } = freshState();
  const old = structuredClone(s);
  delete old.history;
  delete old.ai;
  const restored = validateBackup(old);
  assert.deepEqual(restored.history, []);
  assert.equal(restored.ai.provider, "openrouter");
  // A device that had the removed copy-and-paste mode moves to a free service.
  assert.equal(migrateState({ ...structuredClone(old), ai: { provider: "manual", models: {} } }).ai.provider, "openrouter");
  assert.equal(migrateState(restored), restored);
});

// ---------------------------------------------------------- AI: prompts

test("prompts include the groups, the format and the request", () => {
  const { s, recipe } = freshState();
  const task = newRecipeTask(s.groups, "lentejas de mi abuela, para 4");
  assert.match(task.system, /"Legumbres"/);
  assert.match(task.system, /ÚNICAMENTE con un objeto JSON/);
  assert.match(task.user, /lentejas de mi abuela/);

  const chili = P.getRecipe(s, recipe("Chili con carne y alubias"));
  const chat = assistantTask(s, { recipe: chili, history: [{ role: "user", text: "hola" }], message: "hazla vegetariana" });
  assert.match(chat.user, /"name":"Chili con carne y alubias"/);
  assert.match(chat.user, /Usuario: hola/);
  assert.match(chat.user, /hazla vegetariana/);

  const ideas = ideasTask(s, tasteProfile(s), { count: 2 });
  assert.match(ideas.user, /Propón 2 recetas NUEVAS/);
  assert.match(ideas.user, /Shakshuka/); // existing names are listed so they aren't repeated
});

// ---------------------------------------------------- AI: reply handling

const GOOD = {
  name: "Lentejas de la abuela",
  group: "legumbres",
  servings: 4,
  timeMinutes: 50,
  storageDays: 4,
  freezable: true,
  ingredients: ["300 g de lentejas pardinas", "150 g de chorizo", "1 cebolla", "Sal al gusto"],
  instructions: ["1. Sofríe la cebolla.", "Añade el resto y cuece 40 min."],
  nutrition: { kcal: 610, proteinG: 31, carbsG: 70, fatG: 22, fiberG: 14 },
};

test("a recipe reply is parsed, validated and normalized", () => {
  const { s } = freshState();
  const input = parseRecipeReply("Claro, aquí la tienes:\n```json\n" + JSON.stringify(GOOD) + "\n```", s.groups);
  assert.equal(input.name, "Lentejas de la abuela");
  assert.equal(input.groupId, s.groups.find((g) => g.name === "Legumbres").id);
  assert.equal(input.storageText, "4 días en nevera / se congela bien");
  assert.deepEqual(input.instructions, ["Sofríe la cebolla.", "Añade el resto y cuece 40 min."]);

  const r = P.saveRecipe(s, input);
  assert.equal(r.status, "complete");
  assert.deepEqual(r.ingredients.slice(0, 2).map((i) => [i.quantity, i.unit, i.name]), [[300, "g", "lentejas pardinas"], [150, "g", "chorizo"]]);
});

test("hostile or broken replies are rejected or neutralized", () => {
  const { s } = freshState();
  assert.throws(() => parseJsonReply("no json here"), AiFormatError);
  assert.throws(() => parseRecipeReply('{"name": ""}', s.groups), AiFormatError);
  assert.throws(() => parseRecipeReply('{"name": "x", "ingredients": []}', s.groups), AiFormatError);

  const weird = parseRecipeReply(
    JSON.stringify({
      ...GOOD,
      name: "<img src=x onerror=alert(1)>" + "a".repeat(500),
      group: "No existe",
      servings: 99999,
      storageDays: -3,
      timeMinutes: "abc",
      ingredients: Array.from({ length: 200 }, (_, i) => `${i} g de algo\u0007`),
      nutrition: { kcal: 1e9, proteinG: "30" },
    }),
    s.groups,
  );
  assert.equal(weird.name.length, 120); // clamped; shown as text only, never as HTML
  assert.equal(weird.groupId, null);
  assert.equal(weird.servings, 50);
  assert.equal(weird.storageDays, 0);
  assert.equal(weird.timeMinutes, null);
  assert.equal(weird.ingredientsText.split("\n").length, 60);
  assert.ok(!weird.ingredientsText.includes("\u0007"));
  assert.equal(weird.nutrition.kcal, null);
  assert.equal(weird.nutrition.proteinG, 30);
});

test("assistant and ideas replies", () => {
  const { s, recipe } = freshState();
  const r = parseAssistantReply(JSON.stringify({ reply: "Hecho: sin carne.", mode: "update", recipe: GOOD }), s.groups);
  assert.equal(r.mode, "update");
  const chili = P.getRecipe(s, recipe("Chili con carne y alubias"));
  const changes = describeChanges(s, chili, r.recipe);
  assert.ok(changes.some((c) => c.startsWith("Nombre:")));
  assert.ok(changes.some((c) => c.startsWith("Ingredientes nuevos")));
  assert.deepEqual(describeChanges(s, chili, parseRecipeReply(JSON.stringify(recipeToJson(s, chili)), s.groups)), ["Sin cambios"]);

  const q = parseAssistantReply('{"reply": "El chili aguanta 4 días.", "mode": null, "recipe": null}', s.groups);
  assert.deepEqual([q.mode, q.recipe], [null, null]);

  const ideas = parseIdeasReply(JSON.stringify({ ideas: [GOOD, { name: "rota" }, { ...GOOD, name: "Otra" }] }), s.groups);
  assert.deepEqual(ideas.map((i) => i.name), ["Lentejas de la abuela", "Otra"]);
});

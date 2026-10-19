// The three model-driven features, end to end against a fake model: what the
// model receives (user input + context), and how its replies are handled.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assistantTask,
  ideasTask,
  newRecipeTask,
  parseAssistantReply,
  parseIdeasReply,
  parseRecipeReply,
  parseSuggestReply,
  suggestTask,
} from "../../app/js/core/ai-recipes.js";
import { runTask } from "../../app/js/ai/run.js";
import { addDays, startOfWeek } from "../../app/js/core/dates.js";
import { syncHistory } from "../../app/js/core/history.js";
import * as P from "../../app/js/core/planner.js";
import { nextOpenSlot, suggestionContext, tasteProfile } from "../../app/js/core/suggest.js";
import { MON, freshState } from "./helpers.js";

const day = (n) => addDays(MON, n);

const RECIPE = {
  name: "Lentejas de la abuela",
  group: "Legumbres",
  servings: 4,
  timeMinutes: 50,
  storageDays: 4,
  freezable: true,
  ingredients: ["300 g de lentejas pardinas", "150 g de chorizo", "1 cebolla"],
  instructions: ["Sofríe la cebolla.", "Añade el resto y cuece 40 min."],
  nutrition: { kcal: 610, proteinG: 31, carbsG: 70, fatG: 22, fiberG: 14 },
};

/** A fake model: replies in order and records every request. */
function fakeModel(replies) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const content = replies.shift();
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }] }), { status: 200 });
  };
  return { calls, run: (task, parse) => runTask({ providerId: "groq", apiKey: "k", model: "m", task, parse, fetchImpl }) };
}

test("creation: the user's words are wrapped with format rules and the app's groups", async () => {
  const { s } = freshState();
  const model = fakeModel([JSON.stringify(RECIPE)]);
  const task = newRecipeTask(s.groups, "las lentejas de mi abuela con chorizo, para 4");
  const input = await model.run(task, (t) => parseRecipeReply(t, s.groups));

  const [req] = model.calls;
  assert.equal(req.messages[0].role, "system");
  assert.match(req.messages[0].content, /Grupos de comida disponibles: "Legumbres", "Pescado"/);
  assert.match(req.messages[0].content, /POR RACIÓN/);
  assert.match(req.messages[1].content, /Descripción: «las lentejas de mi abuela con chorizo, para 4»/);
  assert.match(req.messages[1].content, /respeta todo lo que diga/);
  assert.deepEqual(req.response_format, { type: "json_object" });

  assert.equal(input.name, "Lentejas de la abuela");
  assert.equal(input.groupId, s.groups.find((g) => g.name === "Legumbres").id);
  const saved = P.saveRecipe(s, input);
  assert.equal(saved.status, "complete");
  assert.equal(saved.ingredients[0].quantity, 300);
});

test("a broken reply gets one automatic correction turn", async () => {
  const { s } = freshState();
  const model = fakeModel(["Claro, aquí tienes la receta de lentejas: ¡que aproveche!", JSON.stringify(RECIPE)]);
  const input = await model.run(newRecipeTask(s.groups, "lentejas"), (t) => parseRecipeReply(t, s.groups));
  assert.equal(input.name, "Lentejas de la abuela");
  assert.equal(model.calls.length, 2);
  const fix = model.calls[1].messages;
  assert.equal(fix.at(-2).role, "assistant");
  assert.match(fix.at(-2).content, /que aproveche/);
  assert.match(fix.at(-1).content, /No he podido usar tu respuesta: La respuesta no contiene un objeto JSON/);

  // Two bad replies in a row: the error reaches the user (no endless retries).
  const bad = fakeModel(["nada", "tampoco"]);
  await assert.rejects(bad.run(newRecipeTask(s.groups, "x"), (t) => parseRecipeReply(t, s.groups)), /JSON/);
  assert.equal(bad.calls.length, 2);
});

test("modification: the current recipe and the conversation go with the request", async () => {
  const { s, recipe } = freshState();
  const chili = P.getRecipe(s, recipe("Chili con carne y alubias"));
  const reply = {
    reply: "La he hecho vegetariana.",
    mode: "update",
    recipe: { ...RECIPE, name: "Chili vegetariano", servings: 4, ingredients: ["3 botes de alubias rojas, 3 × 400 g", "1 cebolla", "300 g de arroz"] },
  };
  const model = fakeModel([JSON.stringify(reply)]);
  const task = assistantTask(s, { recipe: chili, history: [{ role: "user", text: "¿cuánto aguanta?" }, { role: "assistant", text: "4 días." }], message: "hazla vegetariana" });
  const r = await model.run(task, (t) => parseAssistantReply(t, s.groups));

  const [req] = model.calls;
  assert.match(req.messages[0].content, /Cambia solo lo que pida y conserva el resto/);
  assert.match(req.messages[0].content, /reescala todas las cantidades/);
  assert.match(req.messages[1].content, /Receta actual \(JSON\):\n\{"name":"Chili con carne y alubias","group":"Legumbres","servings":4/);
  assert.match(req.messages[1].content, /"250 g de carne picada \(nötfärs o blandfärs\)"/);
  assert.match(req.messages[1].content, /Usuario: ¿cuánto aguanta\?\nAsistente: 4 días\./);
  assert.match(req.messages[1].content, /Mensaje del usuario: «hazla vegetariana»/);

  assert.equal(r.mode, "update");
  P.saveRecipe(s, r.recipe, chili.id);
  assert.equal(P.getRecipe(s, chili.id).name, "Chili vegetariano");
  assert.equal(P.getRecipe(s, chili.id).ingredients[0].unit, "bote");
});

test("suggestions: the model chooses among your recipes, with your week as context", async () => {
  const { s, comida, cena, recipe } = freshState();
  const curry = recipe("Curry de pollo con leche de coco");
  P.getRecipe(s, curry).favorite = true;
  for (const n of [-20, -13]) P.addMeal(s, { date: day(n), mealTypeId: comida, recipeId: recipe("Dal de lentejas rojas") });
  const chili = P.addMeal(s, { date: day(0), mealTypeId: comida, recipeId: recipe("Chili con carne y alubias") });
  syncHistory(s, day(0));

  assert.deepEqual(nextOpenSlot(s, day(0)), { date: day(0), mealTypeId: cena });
  const ctx = suggestionContext(s, day(0), { date: day(0), mealTypeId: cena });
  assert.equal(ctx.candidates.length, 12);
  assert.ok(ctx.candidates.some((c) => c.recipe.id === curry));
  // Every food group is represented, so the model can balance the week.
  assert.equal(new Set(ctx.candidates.map((c) => c.recipe.groupId)).size, s.groups.length);
  assert.match(ctx.slotLabel, /Cena del lunes 19 de octubre/);
  assert.ok(ctx.planned.some((x) => /lunes comida: Chili con carne y alubias/.test(x)));
  assert.deepEqual(ctx.leftovers, ["Chili con carne y alubias (3 raciones)"]);

  const picks = { suggestions: [
    { name: "curry de pollo con leche de coco", reason: "Es tu favorita y no la has comido esta semana." },
    { name: "Receta inventada", reason: "no existe" },
    { name: ctx.candidates[1].recipe.name, reason: "Equilibra la semana." },
  ] };
  const model = fakeModel([JSON.stringify(picks)]);
  const out = await model.run(suggestTask(s, { ...ctx, note: "algo ligero" }), (t) => parseSuggestReply(t, ctx.candidates));

  const [req] = model.calls;
  assert.match(req.messages[0].content, /SOLO entre las candidatas/);
  const user = req.messages[1].content;
  assert.match(user, /Comida a planificar: Cena del lunes 19 de octubre/);
  assert.match(user, /Lo que pide el usuario: «algo ligero»/);
  assert.match(user, /Ya hay sobras disponibles para esa comida \(se ofrecen aparte, no las sugieras\): Chili/);
  assert.match(user, /Favoritas: Curry de pollo con leche de coco/);
  assert.match(user, /Lo que más come \(veces\): Dal de lentejas rojas \(2\)/);
  assert.match(user, /Legumbres 1\/3-4 \(faltan\); Pescado 0\/2-3 \(faltan\)/);
  assert.match(user, /"name":"Curry de pollo con leche de coco"[^}]*"favorite":true/);

  // Names are matched loosely; anything not in the shortlist is dropped.
  assert.deepEqual(out.map((p) => p.recipe.id), [curry, ctx.candidates[1].recipe.id]);
  assert.match(out[0].reason, /favorita/);
  P.addMeal(s, { date: day(0), mealTypeId: cena, recipeId: out[0].recipe.id });
  assert.equal(s.meals.filter((m) => m.date === day(0)).length, 2);
});

test("ideas: new recipes from your tastes and the week's gaps", async () => {
  const { s, recipe } = freshState();
  P.getRecipe(s, recipe("Shakshuka")).favorite = true;
  const model = fakeModel([JSON.stringify({ ideas: [RECIPE, { ...RECIPE, name: "Garbanzos al curry" }] })]);
  const task = ideasTask(s, tasteProfile(s), { balance: P.balance(s, startOfWeek(MON), 7) });
  const ideas = await model.run(task, (t) => parseIdeasReply(t, s.groups));

  const user = model.calls[0].messages[1].content;
  assert.match(user, /Mis favoritas: Shakshuka/);
  assert.match(user, /Prioriza los grupos donde faltan/);
  assert.match(user, /Pescado 0\/2-3 \(faltan\)/);
  assert.match(user, /No repitas ninguna de las que ya tengo: .*Lasaña de carne/);
  assert.deepEqual(ideas.map((i) => i.name), ["Lentejas de la abuela", "Garbanzos al curry"]);
});

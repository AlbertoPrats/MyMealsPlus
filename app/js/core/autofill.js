// Fill the empty slots of a prep period automatically.
//
// Greedy, in slot order:
// 1. Use spare rations first (soonest-expiring), but never the dish of the
//    previous meal: leftovers wait at least one meal before coming back.
// 2. Otherwise cook a new recipe from the food group furthest below its
//    recommended weekly frequency, preferring recipes not used yet and ones
//    with more servings (fewer cooking sessions = real meal prep) and ones
//    you like (favourites, eaten often).

import { addDays, diffDays } from "./dates.js";
import {
  getBatch,
  getMealType,
  getRecipe,
  leftoversForSlot,
  mealsBetween,
  newBatch,
  prepEnd,
  remainingServings,
  sortedMealTypes,
} from "./planner.js";
import { recipeStats } from "./history.js";
import { nextId } from "./state.js";

/** Small seeded PRNG so results can be reproduced in tests. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedChoice(rng, items, weight) {
  const total = items.reduce((n, x) => n + weight(x), 0);
  let r = rng() * total;
  for (const x of items) {
    r -= weight(x);
    if (r < 0) return x;
  }
  return items.at(-1);
}

function keepsUntil(recipe, cookDate, eatDate) {
  return recipe.storageDays == null || diffDays(eatDate, cookDate) <= recipe.storageDays;
}

export function autofill(
  s,
  prep,
  {
    mealTypeIds = null,
    groupIds = null,
    servingsPerMeal = 1,
    useLeftovers = true,
    cookOnPrepDay = false,
    maxNewRecipes = null,
    seed = Date.now(),
  } = {},
) {
  const rng = mulberry32(seed);
  const types = mealTypeIds?.length
    ? mealTypeIds.map((id) => getMealType(s, id)).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    : sortedMealTypes(s);
  const recipes = s.recipes.filter(
    (r) => r.status === "complete" && r.ingredients.length && (!groupIds?.length || groupIds.includes(r.groupId)),
  );
  const groups = new Map(s.groups.map((g) => [g.id, g]));
  // Lean towards what you like: favourites and what you eat often.
  const stats = recipeStats(s);
  const liking = (r) => (r.favorite ? 6 : 1) * (1 + Math.log2(1 + (stats.get(r.id)?.timesEaten ?? 0)));

  const existing = mealsBetween(s, prep.startDate, prepEnd(prep));
  const recipeOf = (m) => getRecipe(s, getBatch(s, m.batchId).recipeId);
  const occupied = new Set(existing.map((m) => `${m.date}|${m.mealTypeId}`));
  const lastRecipeBySlot = new Map(existing.map((m) => [`${m.date}|${m.mealTypeId}`, recipeOf(m).id]));
  const groupCounts = new Map();
  const bump = (gid) => groupCounts.set(gid, (groupCounts.get(gid) ?? 0) + 1);
  existing.forEach((m) => bump(recipeOf(m).groupId));
  const usedRecipes = new Set(existing.map((m) => recipeOf(m).id));

  const factor = prep.days / 7;
  const prepDay = prep.prepDate ?? prep.startDate;
  const deficit = (gid) => ((groups.get(gid)?.weeklyMin ?? 0) * factor) - (groupCounts.get(gid) ?? 0);
  // A group is "full" once it reaches its (pro-rated, rounded up) weekly maximum.
  const full = (gid) => {
    const max = groups.get(gid)?.weeklyMax;
    return max != null && (groupCounts.get(gid) ?? 0) >= Math.ceil(max * factor);
  };
  const someGroupShort = () => recipes.some((r) => deficit(r.groupId) > 0);

  const created = [];
  const unfilled = [];
  let newRecipes = 0;
  let prevRecipe = null;

  for (let i = 0; i < prep.days; i++) {
    const day = addDays(prep.startDate, i);
    for (const t of types) {
      const slot = `${day}|${t.id}`;
      if (occupied.has(slot)) {
        prevRecipe = lastRecipeBySlot.get(slot) ?? prevRecipe;
        continue;
      }

      let batch = null;
      if (useLeftovers) {
        const spare = leftoversForSlot(s, day, t.id).filter(
          (b) =>
            remainingServings(s, b) >= servingsPerMeal &&
            (!groupIds?.length || groupIds.includes(getRecipe(s, b.recipeId).groupId)),
        );
        // Don't let one big batch crowd out other food groups: once its group is
        // full, leave the rest as spare rations (the orb keeps reminding).
        const balanced = someGroupShort() ? spare.filter((b) => !full(getRecipe(s, b.recipeId).groupId)) : spare;
        // Cooldown of one meal: never repeat the dish of the previous meal. If
        // only that dish is left over, cook something new here and the spare
        // rations come back a meal later (A, B, A, B rather than A, A, B, B).
        batch = balanced.find((b) => b.recipeId !== prevRecipe) ?? null;
      }

      if (!batch) {
        if (maxNewRecipes != null && newRecipes >= maxNewRecipes) {
          unfilled.push({ date: day, mealTypeId: t.id, reason: "max_new_recipes" });
          continue;
        }
        let cookDate = cookOnPrepDay && prepDay <= day ? prepDay : day;
        let options = recipes.filter((r) => keepsUntil(r, cookDate, day));
        if (!options.length && cookDate !== day) {
          cookDate = day;
          options = recipes;
        }
        if (!options.length) {
          unfilled.push({ date: day, mealTypeId: t.id, reason: "no_recipes" });
          continue;
        }
        const unused = options.filter((r) => !usedRecipes.has(r.id));
        const fresh = unused.length ? unused : options;
        const best = Math.max(...fresh.map((r) => deficit(r.groupId)));
        const pool = fresh.filter((r) => deficit(r.groupId) === best);
        const recipe = weightedChoice(rng, pool, (r) => r.servings * liking(r));
        const scale = Math.max(1, Math.ceil(servingsPerMeal / recipe.servings));
        batch = newBatch(s, recipe, cookDate, cookDate === day ? t.id : null, { scale });
        usedRecipes.add(recipe.id);
        newRecipes += 1;
      }

      const meal = { id: nextId(s), date: day, mealTypeId: t.id, batchId: batch.id, servings: servingsPerMeal, eaten: false, notes: null };
      s.meals.push(meal);
      bump(getRecipe(s, batch.recipeId).groupId);
      occupied.add(slot);
      prevRecipe = batch.recipeId;
      created.push(meal);
    }
  }
  return { created, unfilled };
}

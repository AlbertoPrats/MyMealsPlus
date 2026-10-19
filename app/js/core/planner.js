// Meal planning rules.
//
// Core idea: every planned meal eats servings out of a *batch* (one cooking of
// a recipe). Cooking the 4-serving chili creates a batch of 4: the meal where
// it is cooked uses 1 and the other 3 are spare rations for later meals. This
// single source of truth drives the floating orb, the picker and the shopping
// list (which counts batches, never leftovers).

import { addDays, diffDays, range } from "./dates.js";
import { parseIngredientText } from "./parser.js";
import { ConflictError, NotFoundError, nextId } from "./state.js";

export const EXPIRING_SOON_DAYS = 1;
export const NUTRIENTS = ["kcal", "proteinG", "carbsG", "fatG", "fiberG"];

// ----------------------------------------------------------------- lookups

function find(list, id, what) {
  const item = list.find((x) => x.id === id);
  if (!item) throw new NotFoundError(`${what} ${id} no encontrado`);
  return item;
}

export const getRecipe = (s, id) => find(s.recipes, id, "Receta");
export const getMealType = (s, id) => find(s.mealTypes, id, "Tipo de comida");
export const getBatch = (s, id) => find(s.batches, id, "Lote");
export const getMeal = (s, id) => find(s.meals, id, "Comida planificada");
export const getPrep = (s, id) => find(s.prepSessions, id, "Preparación");

export function groupName(s, groupId) {
  return s.groups.find((g) => g.id === groupId)?.name ?? null;
}

export function sortedGroups(s) {
  return [...s.groups].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export function sortedMealTypes(s, { activeOnly = true } = {}) {
  return s.mealTypes
    .filter((t) => !activeOnly || t.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

// ------------------------------------------------------------- slot order

/** Comparable key of a meal slot: [date, sortOrder, id]. */
export function slotKey(s, date, mealTypeId) {
  const t = getMealType(s, mealTypeId);
  return [date, t.sortOrder, t.id];
}

/** When the batch is cooked. Prep-day cooking (no slot) is ready all that day. */
export function cookKey(s, batch) {
  if (batch.cookMealTypeId == null) return [batch.cookDate, -Infinity, 0];
  return slotKey(s, batch.cookDate, batch.cookMealTypeId);
}

export function compareKeys(a, b) {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return a[2] - b[2];
}

// ---------------------------------------------------------------- batches

export function batchMeals(s, batch) {
  return s.meals.filter((m) => m.batchId === batch.id);
}

export function usedServings(s, batch) {
  return batchMeals(s, batch).reduce((n, m) => n + m.servings, 0);
}

export function remainingServings(s, batch) {
  return batch.totalServings - usedServings(s, batch) - batch.discardedServings;
}

export function expiresOn(s, batch) {
  const days = getRecipe(s, batch.recipeId).storageDays;
  if (batch.frozen || days == null) return null;
  return addDays(batch.cookDate, days);
}

export function batchView(s, batch, asOf) {
  const exp = expiresOn(s, batch);
  const daysLeft = exp && asOf ? diffDays(exp, asOf) : null;
  return {
    ...batch,
    recipe: getRecipe(s, batch.recipeId),
    usedServings: usedServings(s, batch),
    remainingServings: remainingServings(s, batch),
    expiresOn: exp,
    daysLeft,
    expiringSoon: daysLeft !== null && daysLeft >= 0 && daysLeft <= EXPIRING_SOON_DAYS,
    expired: daysLeft !== null && daysLeft < 0,
  };
}

export function newBatch(s, recipe, cookDate, cookMealTypeId, { scale = 1, totalServings = null, autoCreated = true } = {}) {
  const batch = {
    id: nextId(s),
    recipeId: recipe.id,
    scale,
    totalServings: totalServings ?? Math.max(1, Math.round(recipe.servings * scale)),
    cookDate,
    cookMealTypeId,
    frozen: false,
    discardedServings: 0,
    autoCreated,
    notes: null,
  };
  s.batches.push(batch);
  return batch;
}

export function checkBatch(s, batch) {
  const recipe = getRecipe(s, batch.recipeId);
  if (remainingServings(s, batch) < 0) {
    throw new ConflictError(
      `No quedan suficientes raciones de «${recipe.name}»: ${batch.totalServings} cocinadas, ` +
        `${usedServings(s, batch)} planificadas, ${batch.discardedServings} descartadas.`,
    );
  }
  const ck = cookKey(s, batch);
  for (const m of batchMeals(s, batch)) {
    if (compareKeys(slotKey(s, m.date, m.mealTypeId), ck) < 0) {
      throw new ConflictError(`«${recipe.name}» está planificado antes de cocinarlo (${batch.cookDate}).`);
    }
  }
}

/** Cook a recipe outside any meal (e.g. on prep day). */
export function createBatch(s, { recipeId, cookDate, scale = 1, totalServings = null, frozen = false }) {
  const batch = newBatch(s, getRecipe(s, recipeId), cookDate, null, { scale, totalServings, autoCreated: false });
  batch.frozen = frozen;
  return batch;
}

export function updateBatch(s, id, patch) {
  const batch = getBatch(s, id);
  const allowed = ["totalServings", "cookDate", "frozen", "discardedServings", "notes"];
  for (const k of allowed) if (k in patch) batch[k] = patch[k];
  if ("scale" in patch) {
    batch.scale = patch.scale;
    batch.totalServings = Math.max(1, Math.round(getRecipe(s, batch.recipeId).servings * patch.scale));
  }
  checkBatch(s, batch);
  return batch;
}

/** Deletes the batch and every meal eating from it. */
export function deleteBatch(s, id) {
  getBatch(s, id);
  s.meals = s.meals.filter((m) => m.batchId !== id);
  s.batches = s.batches.filter((b) => b.id !== id);
}

// ----------------------------------------------------------------- recipes

export function recipeSummary(s, r) {
  return { ...r, groupName: groupName(s, r.groupId) };
}

export function createUnknownRecipe(s, { name = null, groupId = null, servings = 1 } = {}) {
  const recipe = {
    id: nextId(s),
    name: (name ?? "").trim() || "Desconocido",
    groupId,
    status: "unknown",
    servings,
    servingsNote: null,
    timeText: null,
    timeMinutes: null,
    equipment: [],
    storageText: null,
    storageDays: null,
    freezable: false,
    instructions: [],
    nutrition: {},
    ingredients: [],
    favorite: false,
    source: "user",
  };
  s.recipes.push(recipe);
  return recipe;
}

/**
 * Create or update a recipe from the editor. `ingredientsText` holds one
 * ingredient per line and is parsed. Saving turns an "unknown" meal complete.
 */
export function saveRecipe(s, input, id = null) {
  const name = (input.name ?? "").trim();
  if (!name) throw new ConflictError("La receta necesita un nombre.");
  const recipe = id == null ? { id: nextId(s), favorite: false } : getRecipe(s, id);
  Object.assign(recipe, {
    name,
    groupId: input.groupId ?? null,
    status: "complete",
    servings: Math.max(1, Math.round(input.servings || 1)),
    servingsNote: input.servingsNote || null,
    timeText: input.timeText || (input.timeMinutes ? `${input.timeMinutes} min` : null),
    timeMinutes: input.timeMinutes || null,
    equipment: input.equipment ?? [],
    storageText: input.storageText || null,
    storageDays: input.storageDays ?? null,
    freezable: !!input.freezable,
    instructions: (input.instructions ?? []).map((x) => x.trim()).filter(Boolean),
    nutrition: input.nutrition ?? {},
    ingredients: parseIngredientText(input.ingredientsText ?? ""),
    source: "user",
  });
  if (id == null) s.recipes.push(recipe);
  return recipe;
}

export function deleteRecipe(s, id, { force = false } = {}) {
  const recipe = getRecipe(s, id);
  const batches = s.batches.filter((b) => b.recipeId === id);
  if (batches.length && !force) {
    throw new ConflictError(`«${recipe.name}» está en ${batches.length} comida(s) planificada(s).`);
  }
  for (const b of batches) deleteBatch(s, b.id);
  s.recipes = s.recipes.filter((r) => r.id !== id);
}

export function scaledIngredients(recipe, servings) {
  const factor = servings / recipe.servings;
  return recipe.ingredients.map((i) => ({
    ...i,
    quantity: i.quantity == null ? null : Math.round(i.quantity * factor * 100) / 100,
  }));
}

// ------------------------------------------------------------ planned meals

export function mealWarnings(s, batch, date) {
  const recipe = getRecipe(s, batch.recipeId);
  const warnings = [];
  const exp = expiresOn(s, batch);
  if (exp && date > exp) {
    warnings.push(
      `Pasado su tiempo en nevera: cocinado el ${batch.cookDate}, aguanta ${recipe.storageDays} día(s). ` +
        "Congélalo o planifícalo antes.",
    );
  }
  if (recipe.status === "unknown") warnings.push("Receta pendiente de completar.");
  return warnings;
}

export function mealView(s, meal) {
  const batch = getBatch(s, meal.batchId);
  return {
    ...meal,
    recipe: recipeSummary(s, getRecipe(s, batch.recipeId)),
    batch: batchView(s, batch, meal.date),
    isLeftover: compareKeys(slotKey(s, meal.date, meal.mealTypeId), cookKey(s, batch)) > 0,
    warnings: mealWarnings(s, batch, meal.date),
  };
}

/**
 * Add a meal to a slot. Exactly one of:
 * - recipeId: cook it here (extra servings become spare rations)
 * - batchId: eat spare rations of an existing batch
 * - newMeal: create an "unknown" recipe and cook it here
 */
export function addMeal(s, { date, mealTypeId, recipeId, batchId, newMeal, servings = 1, scale = 1, notes = null }) {
  const sources = [recipeId, batchId, newMeal].filter((x) => x != null);
  if (sources.length !== 1) throw new ConflictError("Indica una receta, unas sobras o una comida nueva.");
  getMealType(s, mealTypeId);
  let batch;
  if (batchId != null) {
    batch = getBatch(s, batchId);
  } else {
    const recipe = newMeal != null ? createUnknownRecipe(s, newMeal) : getRecipe(s, recipeId);
    batch = newBatch(s, recipe, date, mealTypeId, { scale });
  }
  const meal = { id: nextId(s), date, mealTypeId, batchId: batch.id, servings, eaten: false, notes };
  s.meals.push(meal);
  checkBatch(s, batch);
  return meal;
}

export function updateMeal(s, id, patch) {
  const meal = getMeal(s, id);
  const batch = getBatch(s, meal.batchId);
  const date = patch.date ?? meal.date;
  const mealTypeId = patch.mealTypeId ?? meal.mealTypeId;
  getMealType(s, mealTypeId);

  if (date !== meal.date || mealTypeId !== meal.mealTypeId) {
    const atCook = meal.date === batch.cookDate && meal.mealTypeId === batch.cookMealTypeId;
    const othersAtCook = batchMeals(s, batch).some(
      (m) => m.id !== meal.id && m.date === batch.cookDate && m.mealTypeId === batch.cookMealTypeId,
    );
    if (batch.autoCreated && atCook && !othersAtCook) {
      // Moving the meal where it's cooked moves the cooking with it.
      batch.cookDate = date;
      batch.cookMealTypeId = mealTypeId;
    }
    meal.date = date;
    meal.mealTypeId = mealTypeId;
  }
  if (patch.servings != null) meal.servings = Math.max(1, patch.servings);
  if (patch.eaten != null) meal.eaten = patch.eaten;
  if (patch.notes !== undefined) meal.notes = patch.notes;
  checkBatch(s, batch);
  return meal;
}

export function deleteMeal(s, id) {
  const meal = getMeal(s, id);
  const batch = getBatch(s, meal.batchId);
  const wasCookSlot = meal.date === batch.cookDate && meal.mealTypeId === batch.cookMealTypeId;
  s.meals = s.meals.filter((m) => m.id !== id);
  if (!batch.autoCreated) return;
  const rest = batchMeals(s, batch);
  if (!rest.length) {
    s.batches = s.batches.filter((b) => b.id !== batch.id);
  } else if (wasCookSlot && !rest.some((m) => m.date === batch.cookDate && m.mealTypeId === batch.cookMealTypeId)) {
    // Nobody eats it where it was going to be cooked: cook it for the first remaining meal.
    const first = rest.reduce((a, b) =>
      compareKeys(slotKey(s, a.date, a.mealTypeId), slotKey(s, b.date, b.mealTypeId)) <= 0 ? a : b,
    );
    batch.cookDate = first.date;
    batch.cookMealTypeId = first.mealTypeId;
  }
}

// --------------------------------------------------------------- leftovers

function expirySort(s) {
  return (a, b) => {
    const ea = expiresOn(s, a) ?? "9999-12-31";
    const eb = expiresOn(s, b) ?? "9999-12-31";
    return ea.localeCompare(eb) || a.cookDate.localeCompare(b.cookDate) || a.id - b.id;
  };
}

export function spareBatches(s, asOf, { includeExpired = false } = {}) {
  return s.batches
    .filter((b) => remainingServings(s, b) > 0)
    .filter((b) => {
      const exp = expiresOn(s, b);
      return includeExpired || exp == null || exp >= asOf;
    })
    .sort(expirySort(s));
}

/** Data for the floating orb. */
export function leftovers(s, asOf) {
  const batches = spareBatches(s, asOf);
  return {
    asOf,
    totalSpareServings: batches.reduce((n, b) => n + remainingServings(s, b), 0),
    batches: batches.map((b) => batchView(s, b, asOf)),
  };
}

/** Spare rations that can be eaten in a slot: already cooked and not expired. */
export function leftoversForSlot(s, date, mealTypeId) {
  const key = slotKey(s, date, mealTypeId);
  return spareBatches(s, date).filter((b) => compareKeys(cookKey(s, b), key) <= 0);
}

/** What to show after pressing "+" on a slot: spare rations first, then recipes. */
export function picker(s, { date, mealTypeId, groupId = null, q = "" }) {
  const query = q.trim().toLowerCase();
  const matches = (r) =>
    (groupId == null || r.groupId === groupId) && (!query || r.name.toLowerCase().includes(query));
  const spare = leftoversForSlot(s, date, mealTypeId).filter((b) => matches(getRecipe(s, b.recipeId)));
  const recipes = s.recipes
    .filter(matches)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, "es"));
  return {
    leftovers: spare.map((b) => batchView(s, b, date)),
    recipes: recipes.map((r) => recipeSummary(s, r)),
  };
}

// ---------------------------------------------------------------- calendar

export function mealsBetween(s, start, end) {
  return s.meals.filter((m) => m.date >= start && m.date <= end);
}

export function dayView(s, date) {
  const types = sortedMealTypes(s, { activeOnly: false });
  const meals = s.meals.filter((m) => m.date === date).sort((a, b) => a.id - b.id);
  const nutrition = Object.fromEntries(NUTRIENTS.map((n) => [n, 0]));
  const slots = [];
  for (const t of types) {
    const entries = meals.filter((m) => m.mealTypeId === t.id);
    // Meals in a deactivated slot are still shown so nothing silently disappears.
    if (!t.active && !entries.length) continue;
    slots.push({ mealType: t, meals: entries.map((m) => mealView(s, m)) });
    for (const m of entries) {
      const r = getRecipe(s, getBatch(s, m.batchId).recipeId);
      for (const n of NUTRIENTS) nutrition[n] += r.nutrition?.[n] ?? 0;
    }
  }
  return { date, slots, nutrition };
}

export function calendar(s, start, days) {
  return range(start, days).map((d) => dayView(s, d));
}

/** Meals per food group vs the recommended weekly frequency, pro-rated. */
export function balance(s, start, days) {
  const end = addDays(start, days - 1);
  const counts = new Map();
  for (const m of mealsBetween(s, start, end)) {
    const gid = getRecipe(s, getBatch(s, m.batchId).recipeId).groupId;
    counts.set(gid, (counts.get(gid) ?? 0) + 1);
  }
  const factor = days / 7;
  const round1 = (x) => Math.round(x * 10) / 10;
  const out = sortedGroups(s).map((g) => {
    const meals = counts.get(g.id) ?? 0;
    counts.delete(g.id);
    const targetMin = g.weeklyMin == null ? null : round1(g.weeklyMin * factor);
    const targetMax = g.weeklyMax == null ? null : round1(g.weeklyMax * factor);
    let status = "ok";
    if (targetMin == null && targetMax == null) status = "no_target";
    else if (targetMin != null && meals < targetMin) status = "below";
    else if (targetMax != null && meals > targetMax) status = "above";
    return { groupId: g.id, groupName: g.name, meals, targetMin, targetMax, status };
  });
  const other = [...counts.values()].reduce((a, b) => a + b, 0);
  if (other) {
    out.push({ groupId: null, groupName: "Sin grupo", meals: other, targetMin: null, targetMax: null, status: "no_target" });
  }
  return out;
}

export function batchesCookedBetween(s, start, end) {
  return s.batches
    .filter((b) => b.cookDate >= start && b.cookDate <= end)
    .sort((a, b) => a.cookDate.localeCompare(b.cookDate) || a.id - b.id);
}

// ----------------------------------------------------------- prep sessions

export function prepEnd(prep) {
  return addDays(prep.startDate, prep.days - 1);
}

/** Cooking for a prep period can start on its prep day, before the first meal. */
export function prepRange(prep) {
  const start = prep.prepDate && prep.prepDate < prep.startDate ? prep.prepDate : prep.startDate;
  return [start, prepEnd(prep)];
}

export function createPrep(s, { name = null, startDate, days, prepDate = null }) {
  if (!(days >= 1 && days <= 31)) throw new ConflictError("Elige entre 1 y 31 días.");
  const prep = {
    id: nextId(s),
    name: (name ?? "").trim() || null,
    startDate,
    days,
    prepDate,
    checks: [],
    createdAt: new Date().toISOString(),
  };
  s.prepSessions.push(prep);
  return prep;
}

export function updatePrep(s, id, patch) {
  const prep = getPrep(s, id);
  for (const k of ["name", "startDate", "days", "prepDate"]) if (k in patch) prep[k] = patch[k];
  if (!(prep.days >= 1 && prep.days <= 31)) throw new ConflictError("Elige entre 1 y 31 días.");
  return prep;
}

export function deletePrep(s, id, { clearMeals = false } = {}) {
  const prep = getPrep(s, id);
  if (clearMeals) {
    for (const m of mealsBetween(s, prep.startDate, prepEnd(prep))) {
      if (s.meals.some((x) => x.id === m.id)) deleteMeal(s, m.id);
    }
  }
  s.prepSessions = s.prepSessions.filter((p) => p.id !== id);
}

export function toggleCheck(s, prepId, key, checked) {
  const prep = getPrep(s, prepId);
  const set = new Set(prep.checks);
  if (checked) set.add(key);
  else set.delete(key);
  prep.checks = [...set];
}

// ------------------------------------------------------------- settings

export function addMealType(s, name) {
  const clean = name.trim();
  if (!clean) throw new ConflictError("Escribe un nombre.");
  if (s.mealTypes.some((t) => t.name.toLowerCase() === clean.toLowerCase())) {
    throw new ConflictError(`Ya existe «${clean}».`);
  }
  const maxOrder = Math.max(0, ...s.mealTypes.map((t) => t.sortOrder));
  const mt = { id: nextId(s), name: clean, sortOrder: maxOrder + 10, active: true };
  s.mealTypes.push(mt);
  return mt;
}

export function moveMealType(s, id, direction) {
  const types = sortedMealTypes(s, { activeOnly: false });
  const i = types.findIndex((t) => t.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= types.length) return;
  [types[i].sortOrder, types[j].sortOrder] = [types[j].sortOrder, types[i].sortOrder];
  if (types[i].sortOrder === types[j].sortOrder) types[j].sortOrder += direction;
  // Reordering must not put leftovers before the meal where they are cooked.
  for (const b of s.batches) checkBatch(s, b);
}

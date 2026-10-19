// History of meals actually had, used for "times made" counts and for
// suggestions. A planned meal enters the history once its day has passed or
// it is marked as eaten. Entries outlive the plan: clearing old weeks or a
// prep period doesn't erase what you ate.

import { diffDays } from "./dates.js";

/** Bring state.history in line with the plan. Call after every change. */
export function syncHistory(s, today) {
  s.history ??= [];
  const byMeal = new Map(s.history.map((h) => [h.mealId, h]));
  const keep = new Set(s.history.filter((h) => !s.meals.some((m) => m.id === h.mealId)).map((h) => h.mealId));

  for (const m of s.meals) {
    const batch = s.batches.find((b) => b.id === m.batchId);
    const recipe = batch && s.recipes.find((r) => r.id === batch.recipeId);
    if (!recipe) continue;
    const done = m.date < today || m.eaten;
    const entry = byMeal.get(m.id);
    if (!done) continue; // moved to the future or un-marked: dropped below
    const fields = {
      mealId: m.id,
      batchId: batch.id,
      recipeId: recipe.id,
      recipeName: recipe.name,
      groupId: recipe.groupId,
      date: m.date,
      servings: m.servings,
    };
    if (entry) Object.assign(entry, fields);
    else s.history.push(fields);
    keep.add(m.id);
  }
  s.history = s.history.filter((h) => keep.has(h.mealId)).sort((a, b) => a.date.localeCompare(b.date) || a.mealId - b.mealId);
}

/**
 * Per recipe: how many times it was cooked (distinct batches), how many meals
 * it made, and when it was last eaten.
 */
export function recipeStats(s) {
  const stats = new Map();
  for (const h of s.history ?? []) {
    let st = stats.get(h.recipeId);
    if (!st) {
      st = { timesCooked: 0, timesEaten: 0, lastDate: null, batches: new Set() };
      stats.set(h.recipeId, st);
    }
    st.timesEaten += 1;
    st.batches.add(h.batchId);
    st.timesCooked = st.batches.size;
    if (!st.lastDate || h.date > st.lastDate) st.lastDate = h.date;
  }
  return stats;
}

export function statsFor(s, recipeId) {
  const st = recipeStats(s).get(recipeId);
  return st ? { timesCooked: st.timesCooked, timesEaten: st.timesEaten, lastDate: st.lastDate } : { timesCooked: 0, timesEaten: 0, lastDate: null };
}

/** "hace 3 días", "hoy"... */
export function sinceText(lastDate, today) {
  if (!lastDate) return null;
  const d = diffDays(today, lastDate);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 14) return `hace ${d} días`;
  if (d < 60) return `hace ${Math.round(d / 7)} semanas`;
  return `hace ${Math.round(d / 30)} meses`;
}

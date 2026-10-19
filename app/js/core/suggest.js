// Personal suggestions from what you like: favourites, what you eat often,
// recipes similar to those, minus what you had recently, plus food groups the
// week is short of. Every suggestion carries human-readable reasons.

import { addDays, diffDays, longDate, startOfWeek } from "./dates.js";
import { recipeStats } from "./history.js";
import { balance, getBatch, getMealType, getRecipe, leftoversForSlot, mealsBetween, remainingServings, sortedMealTypes } from "./planner.js";

// Ingredients in more than this share of recipes (onion, garlic, oil...) say
// nothing about taste, so they're ignored when comparing recipes.
const COMMON_SHARE = 0.2;

function ingredientSet(recipe, common) {
  return new Set(
    recipe.ingredients.filter((i) => (!i.toTaste || i.quantity != null) && !common.has(i.key)).map((i) => i.key),
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function suggestions(s, today, { limit = 5, groupId = null, excludeIds = [] } = {}) {
  const stats = recipeStats(s);
  const exclude = new Set(excludeIds);
  const complete = s.recipes.filter((r) => r.status === "complete" && r.ingredients.length);
  const df = new Map();
  for (const r of complete) for (const k of new Set(r.ingredients.map((i) => i.key))) df.set(k, (df.get(k) ?? 0) + 1);
  const common = new Set([...df].filter(([, n]) => n / complete.length > COMMON_SHARE).map(([k]) => k));

  // What "liked" looks like: favourites and the most eaten recipes.
  const liked = complete.filter((r) => r.favorite || (stats.get(r.id)?.timesEaten ?? 0) >= 2);
  const likedSets = liked.map((r) => [r.id, ingredientSet(r, common)]);
  const groupLikes = new Map();
  for (const r of liked) groupLikes.set(r.groupId, (groupLikes.get(r.groupId) ?? 0) + 1);
  const totalLikes = liked.length || 1;

  const weekStart = startOfWeek(today);
  const short = new Set(balance(s, weekStart, 7).filter((g) => g.status === "below").map((g) => g.groupId));
  const nextWeek = addDays(today, 7);
  const plannedSoon = new Set(
    s.meals.filter((m) => m.date >= today && m.date <= nextWeek).map((m) => getBatch(s, m.batchId).recipeId),
  );

  const scored = [];
  for (const r of complete) {
    if (exclude.has(r.id) || (groupId != null && r.groupId !== groupId)) continue;
    const st = stats.get(r.id);
    const reasons = [];
    let score = 0;
    if (r.favorite) {
      score += 3;
      reasons.push("Favorita");
    }
    if (st?.timesEaten) {
      score += 1.5 * Math.log2(1 + st.timesEaten);
      reasons.push(`La has comido ${st.timesEaten} ${st.timesEaten === 1 ? "vez" : "veces"}`);
    }
    const mine = ingredientSet(r, common);
    let best = 0;
    let bestId = null;
    for (const [id, set] of likedSets) {
      if (id === r.id) continue;
      const sim = jaccard(mine, set);
      if (sim > best) [best, bestId] = [sim, id];
    }
    if (best >= 0.25 && !r.favorite) {
      score += 3 * best;
      reasons.push(`Parecida a «${s.recipes.find((x) => x.id === bestId).name}»`);
    }
    score += 1.5 * ((groupLikes.get(r.groupId) ?? 0) / totalLikes);
    if (short.has(r.groupId)) {
      score += 1;
      reasons.push("Equilibra la semana");
    }
    if (st?.lastDate) {
      const ago = (Date.parse(today) - Date.parse(st.lastDate)) / 86_400_000;
      // Just had it: push it well down, whatever else it has going for it.
      if (ago <= 2) score -= 8;
      else if (ago <= 5) score -= 4;
      else if (ago <= 7) score -= 1.5;
      else if (ago >= 21 && st.timesEaten >= 2) {
        score += 0.5;
        reasons.push("Hace tiempo que no la comes");
      }
    } else if (!r.favorite) {
      reasons.push("Aún no la has probado");
    }
    if (plannedSoon.has(r.id)) score -= 2;
    scored.push({ recipe: r, score, reasons });
  }
  // Stable: ties broken by name so the list doesn't jump around.
  scored.sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name, "es"));
  return scored.slice(0, limit);
}

/** Short summary of tastes for the AI ("ideas for me"). */
export function tasteProfile(s) {
  const stats = recipeStats(s);
  const byEaten = s.recipes
    .filter((r) => stats.get(r.id)?.timesEaten)
    .sort((a, b) => stats.get(b.id).timesEaten - stats.get(a.id).timesEaten)
    .slice(0, 8);
  return {
    favorites: s.recipes.filter((r) => r.favorite).map((r) => r.name).slice(0, 12),
    mostEaten: byEaten.map((r) => `${r.name} (${stats.get(r.id).timesEaten})`),
    allNames: s.recipes.map((r) => r.name),
  };
}

/**
 * Everything the model gets to choose a meal for a slot: a shortlist of the
 * user's recipes (ranked locally, so the request stays small) and the week's
 * context.
 */
export function suggestionContext(s, today, { date, mealTypeId, groupId = null, limit = 12 }) {
  const stats = recipeStats(s);
  // Shortlist with variety: up to 2 per food group first (so the model can
  // balance the week), then the best of the rest, kept in ranking order.
  const ranked = suggestions(s, today, { limit: Infinity, groupId });
  const chosen = new Set();
  const perGroup = new Map();
  for (const x of ranked) {
    const n = perGroup.get(x.recipe.groupId) ?? 0;
    if (n < 2 && chosen.size < limit) {
      chosen.add(x);
      perGroup.set(x.recipe.groupId, n + 1);
    }
  }
  for (const x of ranked) if (chosen.size < limit) chosen.add(x);
  const candidates = ranked.filter((x) => chosen.has(x)).map(({ recipe }) => {
    const st = stats.get(recipe.id);
    return { recipe, stats: st, daysAgo: st?.lastDate ? diffDays(today, st.lastDate) : null };
  });
  const weekStart = startOfWeek(date);
  const typeName = (id) => getMealType(s, id).name.toLowerCase();
  const planned = mealsBetween(s, weekStart, addDays(weekStart, 6))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => `${longDate(m.date).split(" ")[0]} ${typeName(m.mealTypeId)}: ${getRecipe(s, getBatch(s, m.batchId).recipeId).name}`);
  const leftovers = leftoversForSlot(s, date, mealTypeId).map(
    (b) => `${getRecipe(s, b.recipeId).name} (${remainingServings(s, b)} raciones)`,
  );
  return {
    slotLabel: `${getMealType(s, mealTypeId).name} del ${longDate(date)}`,
    candidates,
    planned,
    leftovers,
    balance: balance(s, weekStart, 7),
    profile: tasteProfile(s),
  };
}

/** The next slot worth planning: today's first empty one, else the next day's. */
export function nextOpenSlot(s, today) {
  const types = sortedMealTypes(s);
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    const t = types.find((mt) => !s.meals.some((m) => m.date === date && m.mealTypeId === mt.id));
    if (t) return { date, mealTypeId: t.id };
  }
  return { date: today, mealTypeId: types[0]?.id };
}

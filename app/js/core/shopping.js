// Shopping list: ingredients for every batch cooked in a date range. Only
// batches count (never planned meals), so leftovers never add ingredients twice.

import { batchesCookedBetween, getRecipe, recipeSummary } from "./planner.js";

const TO_BASE = { kg: ["g", 1000], l: ["ml", 1000] };

function displayAmount(qty, unit) {
  if (unit === "g" && qty >= 1000) [qty, unit] = [qty / 1000, "kg"];
  else if (unit === "ml" && qty >= 1000) [qty, unit] = [qty / 1000, "l"];
  return { quantity: Math.round(qty * 100) / 100, unit };
}

export function buildShoppingList(s, start, end, checks = []) {
  const pantry = new Set(s.pantry.map((p) => p.key));
  const checked = new Set(checks);
  const items = new Map();
  const unknown = new Map();

  for (const batch of batchesCookedBetween(s, start, end)) {
    const recipe = getRecipe(s, batch.recipeId);
    if (recipe.status === "unknown" || !recipe.ingredients.length) {
      unknown.set(recipe.id, recipe);
      continue;
    }
    for (const ing of recipe.ingredients) {
      if (!items.has(ing.key)) {
        items.set(ing.key, {
          names: new Map(),
          swedish: null,
          amounts: new Map(),
          toTaste: true,
          optional: true,
          recipes: [],
          notes: [],
        });
      }
      const item = items.get(ing.key);
      item.names.set(ing.name, (item.names.get(ing.name) ?? 0) + 1);
      item.swedish ??= ing.swedishName;
      item.optional &&= ing.optional;
      if (!item.recipes.includes(recipe.name)) item.recipes.push(recipe.name);
      if (ing.quantity != null) {
        const [unit, factor] = TO_BASE[ing.unit] ?? [ing.unit, 1];
        item.amounts.set(unit, (item.amounts.get(unit) ?? 0) + ing.quantity * factor * batch.scale);
        item.toTaste = false;
      }
      if (ing.note && !item.notes.includes(ing.note)) item.notes.push(ing.note);
    }
  }

  const out = [...items.entries()].map(([key, item]) => {
    // Most used spelling; on a tie the shortest.
    const name = [...item.names.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    const amounts = [...item.amounts.entries()]
      .map(([unit, qty]) => displayAmount(qty, unit))
      .sort((a, b) => (a.unit != null) - (b.unit != null) || (a.unit ?? "").localeCompare(b.unit ?? ""));
    return {
      key,
      name,
      swedishName: item.swedish,
      amounts,
      toTaste: item.toTaste,
      optional: item.optional,
      inPantry: pantry.has(key),
      checked: checked.has(key),
      recipes: item.recipes,
      notes: item.notes,
    };
  });
  // To buy first; checked, pantry, optional and "to taste" at the bottom.
  out.sort(
    (a, b) =>
      a.checked - b.checked ||
      a.inPantry - b.inPantry ||
      a.optional - b.optional ||
      a.toTaste - b.toTaste ||
      a.name.localeCompare(b.name, "es"),
  );
  return { start, end, items: out, unknownRecipes: [...unknown.values()].map((r) => recipeSummary(s, r)) };
}

const PLURAL_UNITS = {
  bote: "botes", lata: "latas", diente: "dientes", trozo: "trozos", hoja: "hojas",
  rebanada: "rebanadas", "lámina": "láminas", filete: "filetes", vaso: "vasos",
};

export function formatNumber(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ",");
}

export function formatAmount({ quantity, unit }) {
  if (quantity == null) return "";
  const q = formatNumber(quantity);
  if (!unit) return q;
  return `${q} ${quantity > 1 ? PLURAL_UNITS[unit] ?? unit : unit}`;
}

/** Plain-text list for sharing (WhatsApp, Notes...). */
export function shoppingListText(list, title = "Lista de la compra") {
  const lines = [title, ""];
  for (const item of list.items) {
    if (item.checked || item.inPantry) continue;
    const amounts = item.amounts.map(formatAmount).join(" + ");
    const sv = item.swedishName ? ` (${item.swedishName})` : "";
    lines.push(`• ${item.name}${sv}${amounts ? ` — ${amounts}` : ""}${item.optional ? " (opcional)" : ""}`);
  }
  return lines.join("\n");
}

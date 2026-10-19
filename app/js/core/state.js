// The whole app state is one plain object, saved on the phone as a single
// document. Small (a few hundred records at most), easy to back up, and every
// change can be applied to a copy and discarded if it fails.

import { ingredientKey } from "./parser.js";

export const STATE_VERSION = 1;

export const DEFAULT_MEAL_TYPES = [
  { name: "Comida", sortOrder: 10 },
  { name: "Cena", sortOrder: 20 },
];
export const DEFAULT_PANTRY = ["agua", "sal", "pimienta", "pimienta negra"];

export class ConflictError extends Error {}
export class NotFoundError extends Error {}

/**
 * Apply `fn` to a copy of the state. If it throws, the original is untouched
 * (like a database transaction rolling back).
 */
export function applyChange(state, fn) {
  const draft = structuredClone(state);
  const result = fn(draft);
  return { state: draft, result };
}

export function nextId(state) {
  state.nextId += 1;
  return state.nextId;
}

export function emptyState() {
  return {
    version: STATE_VERSION,
    nextId: 0,
    seedVersion: null,
    groups: [],
    recipes: [],
    mealTypes: [],
    batches: [],
    meals: [],
    prepSessions: [],
    pantry: [],
    // Meals actually had (see core/history.js).
    history: [],
    // Which AI provider/model to use. Keys are NOT stored here (see secrets.js).
    ai: { provider: "openrouter", models: {} },
  };
}

/** Fill in fields added after version 1 (e.g. a backup from the original MyMeals). */
export function migrateState(data) {
  data.history ??= [];
  data.ai ??= { provider: "openrouter", models: {} };
  data.ai.models ??= {};
  // Only the free services remain (see ai/providers.js).
  if (!["openrouter", "groq"].includes(data.ai.provider)) data.ai.provider = "openrouter";
  return data;
}

export function createState(seed) {
  const state = emptyState();
  for (const mt of DEFAULT_MEAL_TYPES) state.mealTypes.push({ id: nextId(state), ...mt, active: true });
  for (const name of DEFAULT_PANTRY) state.pantry.push({ key: ingredientKey(name), name });
  if (seed) mergeSeed(state, seed);
  return state;
}

function recipeFromSeed(r, groupId) {
  return {
    name: r.name,
    groupId,
    status: "complete",
    servings: r.servings,
    servingsNote: r.servingsNote,
    timeText: r.timeText,
    timeMinutes: r.timeMinutes,
    equipment: r.equipment,
    storageText: r.storageText,
    storageDays: r.storageDays,
    freezable: r.freezable,
    instructions: r.instructions,
    nutrition: { ...r.nutrition },
    ingredients: r.ingredients.map((i) => ({ ...i })),
    source: "markdown",
  };
}

/**
 * Add/update the recipes bundled with the app (built from recetas.md).
 * Recipes are matched by name; ones the user edited in the app are left alone.
 */
export function mergeSeed(state, seed) {
  let created = 0;
  let updated = 0;
  seed.groups.forEach((g, order) => {
    let group = state.groups.find((x) => x.name === g.name);
    if (!group) {
      group = { id: nextId(state), name: g.name };
      state.groups.push(group);
    }
    Object.assign(group, { sortOrder: order, weeklyMin: g.weeklyMin, weeklyMax: g.weeklyMax, note: g.note });
  });
  for (const r of seed.recipes) {
    const groupId = state.groups.find((g) => g.name === r.group)?.id ?? null;
    const existing = state.recipes.find((x) => x.name === r.name);
    if (!existing) {
      state.recipes.push({ id: nextId(state), favorite: false, ...recipeFromSeed(r, groupId) });
      created += 1;
    } else if (existing.source === "markdown") {
      Object.assign(existing, recipeFromSeed(r, groupId));
      updated += 1;
    }
  }
  state.seedVersion = seed.version ?? null;
  return { created, updated };
}

/** Validate a backup before replacing the current data with it. */
export function validateBackup(data) {
  const keys = ["groups", "recipes", "mealTypes", "batches", "meals", "prepSessions", "pantry"];
  if (!data || typeof data !== "object" || data.version !== STATE_VERSION || typeof data.nextId !== "number") {
    throw new Error("El archivo no es una copia de seguridad válida de MyMeals.");
  }
  for (const k of keys) {
    if (!Array.isArray(data[k])) throw new Error(`Copia de seguridad incompleta: falta "${k}".`);
  }
  // Works with backups from MyMeals too: the missing parts are added.
  return migrateState(data);
}

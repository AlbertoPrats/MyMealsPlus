import { readFileSync } from "node:fs";

import { createState } from "../../app/js/core/state.js";

export const SEED = JSON.parse(readFileSync(new URL("../../app/data/recipes.json", import.meta.url), "utf8"));
export const MON = "2026-10-19";

export function freshState() {
  const s = createState(SEED);
  const types = Object.fromEntries(s.mealTypes.map((t) => [t.name, t.id]));
  const recipe = (name) => {
    const r = s.recipes.find((x) => x.name === name);
    if (!r) throw new Error(`no recipe ${name}`);
    return r.id;
  };
  return { s, comida: types.Comida, cena: types.Cena, recipe };
}

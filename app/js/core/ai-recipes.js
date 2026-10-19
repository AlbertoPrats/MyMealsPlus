// Prompts for the AI and strict handling of its answers.
//
// Everything the AI returns is treated as untrusted data: it is parsed as
// JSON, every field is checked and clamped, and it is only ever displayed as
// text. Nothing it says is executed or turned into HTML.

import { ingredientLines } from "./parser.js";
import { stripAccents } from "./parser.js";

const MAX = { name: 120, line: 200, lines: 60, steps: 40, step: 600, reply: 4000 };

// ------------------------------------------------------------------ schemas

const nullable = (type) => ({ anyOf: [{ type }, { type: "null" }] });

export const RECIPE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    group: nullable("string"),
    servings: { type: "integer" },
    timeMinutes: nullable("integer"),
    storageDays: nullable("integer"),
    freezable: { type: "boolean" },
    ingredients: { type: "array", items: { type: "string" } },
    instructions: { type: "array", items: { type: "string" } },
    nutrition: {
      type: "object",
      properties: {
        kcal: nullable("number"),
        proteinG: nullable("number"),
        carbsG: nullable("number"),
        fatG: nullable("number"),
        fiberG: nullable("number"),
      },
      required: ["kcal", "proteinG", "carbsG", "fatG", "fiberG"],
      additionalProperties: false,
    },
  },
  required: ["name", "group", "servings", "timeMinutes", "storageDays", "freezable", "ingredients", "instructions", "nutrition"],
  additionalProperties: false,
};

export const ASSISTANT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    mode: { anyOf: [{ type: "string", enum: ["update", "new"] }, { type: "null" }] },
    recipe: { anyOf: [RECIPE_SCHEMA, { type: "null" }] },
  },
  required: ["reply", "mode", "recipe"],
  additionalProperties: false,
};

export const IDEAS_SCHEMA = {
  type: "object",
  properties: { ideas: { type: "array", items: RECIPE_SCHEMA } },
  required: ["ideas"],
  additionalProperties: false,
};

// ------------------------------------------------------------------ prompts
//
// What the model receives is never just the user's words: each task wraps
// them with the context and rules the model needs (groups, recipe format,
// the current recipe, tastes, the week's plan...). See README.

const RECIPE_FORMAT = `Formato de una receta (JSON):
{
  "name": "Nombre corto y claro",
  "group": uno de los grupos disponibles o null,
  "servings": número de raciones (entero),
  "timeMinutes": minutos totales o null,
  "storageDays": días que aguanta en la nevera tras cocinarla (0 = consumir al momento) o null,
  "freezable": true si se congela bien,
  "ingredients": ["200 g de pasta", "1 cebolla", "2 cda de aceite de oliva", "1 lata de tomate triturado (krossade tomater), 400 g", "Sal y pimienta al gusto"],
  "instructions": ["Paso 1...", "Paso 2..."],
  "nutrition": {"kcal": 600, "proteinG": 30, "carbsG": 70, "fatG": 15, "fiberG": 6}
}
Reglas:
- Un ingrediente por elemento, en español, empezando por la cantidad para TODAS las raciones. Unidades: g, kg, ml, l, cda (cucharada), cdta (cucharadita) o piezas ("2 huevos"). Pesos de arroz, pasta y legumbres en crudo. Si lo sabes, añade entre paréntesis el nombre en sueco.
- "instructions": pasos cortos y concretos, sin numerar.
- "storageDays" realista: pescado 1-2, carne y pollo 3, guisos y legumbres 3-4, 0 si debe comerse al momento.
- "nutrition": estimación aproximada POR RACIÓN.`;

const JSON_ONLY = "Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después y sin bloques de código.";

function groupsLine(groups) {
  return `Grupos de comida disponibles: ${groups.map((g) => `"${g.name}"`).join(", ")}.`;
}

function baseSystem(groups) {
  return [
    "Eres el asistente de cocina de MyMeals+, una app de planificación de comidas y meal prep.",
    "Las recetas de la app son sanas, económicas y fáciles, con ingredientes típicos de supermercado sueco " +
      "(Lidl, Willys, ICA, Coop). Escribe siempre en español.",
    groupsLine(groups),
    RECIPE_FORMAT,
    JSON_ONLY,
  ].join("\n\n");
}

/** Turn a free-text description ("lentejas de mi abuela, para 4") into a full recipe. */
export function newRecipeTask(groups, description, { groupName = null } = {}) {
  return {
    kind: "recipe",
    schema: RECIPE_SCHEMA,
    system: baseSystem(groups),
    user: [
      "Crea la receta completa a partir de esta descripción del usuario. Puede ser breve o muy detallada: respeta " +
        "todo lo que diga (ingredientes, cantidades, raciones, método) y completa con criterio lo que falte.",
      `Descripción: «${description.trim()}»`,
      "Si no indica raciones, usa 2, o 4 si es un guiso o un plato que conviene cocinar en cantidad para varios días.",
      groupName ? `Debe ir en el grupo "${groupName}".` : "Elige el grupo que mejor encaje, o null si ninguno encaja.",
      "Devuelve solo el JSON de la receta.",
    ].join("\n"),
  };
}

export function recipeToJson(state, recipe) {
  return {
    name: recipe.name,
    group: state.groups.find((g) => g.id === recipe.groupId)?.name ?? null,
    servings: recipe.servings,
    timeMinutes: recipe.timeMinutes ?? null,
    storageDays: recipe.storageDays ?? null,
    freezable: !!recipe.freezable,
    ingredients: ingredientLines(recipe.ingredients),
    instructions: recipe.instructions,
    nutrition: {
      kcal: recipe.nutrition?.kcal ?? null,
      proteinG: recipe.nutrition?.proteinG ?? null,
      carbsG: recipe.nutrition?.carbsG ?? null,
      fatG: recipe.nutrition?.fatG ?? null,
      fiberG: recipe.nutrition?.fiberG ?? null,
    },
  };
}

/** One turn of the assistant chat, optionally about a specific recipe. */
export function assistantTask(state, { recipe = null, history = [], message }) {
  const parts = [];
  if (recipe) parts.push(`Receta actual (JSON):\n${JSON.stringify(recipeToJson(state, recipe))}`);
  const recent = history.slice(-6);
  if (recent.length) {
    parts.push(
      "Conversación hasta ahora:\n" +
        recent.map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.text}`).join("\n"),
    );
  }
  parts.push(`Mensaje del usuario: «${message.trim()}»`);
  return {
    kind: "assistant",
    schema: ASSISTANT_SCHEMA,
    system: [
      baseSystem(state.groups),
      'Formato de tu respuesta: {"reply": "texto para el usuario", "mode": "update" | "new" | null, "recipe": receta completa o null}.',
      [
        "Cómo responder:",
        '- Si el usuario pide cambiar la receta actual, devuelve la receta COMPLETA ya modificada en "recipe" con mode "update". ' +
          "Cambia solo lo que pida y conserva el resto. Si cambian las raciones, reescala todas las cantidades. " +
          "Actualiza tiempo, conservación y nutrición si el cambio les afecta. Si el plato cambia de naturaleza " +
          "(por ejemplo, deja de llevar carne), adapta el nombre y el grupo.",
        '- Si pide una receta distinta o nueva, devuélvela completa con mode "new".',
        "- Si solo hace una pregunta, responde en \"reply\" y deja recipe y mode en null.",
        '- "reply": una a tres frases que expliquen qué has hecho o respondan a la pregunta.',
      ].join("\n"),
    ].join("\n\n"),
    user: parts.join("\n\n"),
  };
}

function balanceLine(balance) {
  const label = { below: "faltan", ok: "bien", above: "de más", no_target: "" };
  return balance
    .filter((g) => g.targetMin != null || g.meals)
    .map((g) => `${g.groupName} ${g.meals}${g.targetMin != null ? `/${g.targetMin}-${g.targetMax} (${label[g.status]})` : ""}`)
    .join("; ");
}

/** New recipe ideas based on what the user likes. */
export function ideasTask(state, profile, { count = 3, balance = [], note = "" } = {}) {
  return {
    kind: "ideas",
    schema: IDEAS_SCHEMA,
    system: [baseSystem(state.groups), 'Formato de tu respuesta: {"ideas": [receta, receta, ...]}.'].join("\n\n"),
    user: [
      `Propón ${count} recetas NUEVAS que probablemente me gusten: que encajen con mis gustos pero aporten variedad.`,
      profile.favorites.length ? `Mis favoritas: ${profile.favorites.join(", ")}.` : "Aún no tengo favoritas.",
      profile.mostEaten.length ? `Lo que más como (veces): ${profile.mostEaten.join(", ")}.` : "",
      balance.length ? `Comidas de esta semana por grupo (hechas/objetivo): ${balanceLine(balance)}. Prioriza los grupos donde faltan.` : "",
      `No repitas ninguna de las que ya tengo: ${profile.allNames.join(", ")}.`,
      note ? `Además: ${note}` : "",
      "Que sean aptas para meal prep cuando se pueda (varias raciones que aguanten en la nevera).",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, reason: { type: "string" } },
        required: ["name", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

/**
 * Choose what to eat in a slot from the user's own recipes. The app first
 * shortlists candidates (favourites, often eaten, not had recently...) and the
 * model picks and explains using the week's context.
 */
export function suggestTask(state, { slotLabel, candidates, planned = [], leftovers = [], balance = [], profile, note = "", count = 3 }) {
  const rows = candidates.map(({ recipe, stats, daysAgo }) => ({
    name: recipe.name,
    group: state.groups.find((g) => g.id === recipe.groupId)?.name ?? null,
    servings: recipe.servings,
    minutes: recipe.timeMinutes ?? null,
    kcal: recipe.nutrition?.kcal ?? null,
    keepsDays: recipe.storageDays ?? null,
    favorite: !!recipe.favorite,
    timesEaten: stats?.timesEaten ?? 0,
    lastEatenDaysAgo: daysAgo,
  }));
  return {
    kind: "suggest",
    schema: SUGGEST_SCHEMA,
    system: [
      "Eres el asistente de cocina de MyMeals+, una app de planificación de comidas y meal prep. Escribe en español.",
      `Tu tarea: elegir las ${count} mejores recetas para una comida, SOLO entre las candidatas que te paso.`,
      "Ten en cuenta los gustos del usuario (favoritas, lo que más come), la variedad respecto a lo ya planificado, " +
        "el equilibrio de grupos de la semana, el tiempo de preparación y lo que pida el usuario.",
      `Formato de tu respuesta: {"suggestions": [{"name": "nombre EXACTO de una candidata", "reason": "motivo breve y personal, una frase"}]}.`,
      JSON_ONLY,
    ].join("\n\n"),
    user: [
      `Comida a planificar: ${slotLabel}.`,
      note.trim() ? `Lo que pide el usuario: «${note.trim()}»` : "",
      planned.length ? `Ya planificado esta semana: ${planned.join("; ")}.` : "Aún no hay nada planificado esta semana.",
      balance.length ? `Comidas de esta semana por grupo (hechas/objetivo): ${balanceLine(balance)}.` : "",
      leftovers.length ? `Ya hay sobras disponibles para esa comida (se ofrecen aparte, no las sugieras): ${leftovers.join(", ")}.` : "",
      profile.favorites.length ? `Favoritas: ${profile.favorites.join(", ")}.` : "",
      profile.mostEaten.length ? `Lo que más come (veces): ${profile.mostEaten.join(", ")}.` : "",
      `Candidatas (JSON):\n${JSON.stringify(rows)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** Second turn asking the model to fix a reply the app couldn't use. */
export function repairFollowUp(replyText, error) {
  return [
    { role: "assistant", content: String(replyText).slice(0, 8000) },
    {
      role: "user",
      content: `No he podido usar tu respuesta: ${error}. Responde de nuevo ÚNICAMENTE con el objeto JSON válido en el formato pedido, sin texto adicional.`,
    },
  ];
}

// ------------------------------------------------------------------ parsing

export class AiFormatError extends Error {}

/** Extract the JSON object from a reply (tolerates code fences or chatter). */
export function parseJsonReply(text) {
  if (typeof text !== "string" || !text.trim()) throw new AiFormatError("La respuesta está vacía.");
  let body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new AiFormatError("La respuesta no contiene un objeto JSON.");
  body = body.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    throw new AiFormatError("La respuesta no es un JSON válido. Prueba otra vez.");
  }
}

const cleanText = (v, max) =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "";

function intIn(v, min, max) {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function numIn(v, min, max) {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 10) / 10;
}

function findGroupId(groups, name) {
  if (typeof name !== "string" || !name.trim()) return null;
  const norm = (x) => stripAccents(x.toLowerCase()).replace(/[^a-z]+/g, "");
  const n = norm(name);
  return groups.find((g) => norm(g.name) === n)?.id ?? groups.find((g) => norm(g.name).startsWith(n) || n.startsWith(norm(g.name)))?.id ?? null;
}

/**
 * Validate a recipe object from the AI and turn it into the input that
 * planner.saveRecipe() takes. Throws AiFormatError if unusable.
 */
export function sanitizeRecipe(raw, groups) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new AiFormatError("La receta no tiene el formato esperado.");
  const name = cleanText(raw.name, MAX.name);
  if (!name) throw new AiFormatError("La receta no tiene nombre.");
  const lines = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
    .map((l) => cleanText(l, MAX.line).replace(/^[-*•]\s*/, ""))
    .filter(Boolean)
    .slice(0, MAX.lines);
  if (!lines.length) throw new AiFormatError("La receta no tiene ingredientes.");
  const steps = (Array.isArray(raw.instructions) ? raw.instructions : [])
    .map((l) => cleanText(l, MAX.step).replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean)
    .slice(0, MAX.steps);
  const storageDays = intIn(raw.storageDays, 0, 14);
  const freezable = raw.freezable === true;
  const n = raw.nutrition && typeof raw.nutrition === "object" ? raw.nutrition : {};
  return {
    name,
    groupId: findGroupId(groups, raw.group),
    servings: intIn(raw.servings, 1, 50) ?? 2,
    timeMinutes: intIn(raw.timeMinutes, 1, 1440),
    storageDays,
    storageText:
      storageDays == null ? null : storageDays === 0 ? "al momento" : `${storageDays} días en nevera${freezable ? " / se congela bien" : ""}`,
    freezable,
    ingredientsText: lines.join("\n"),
    instructions: steps,
    nutrition: {
      kcal: numIn(n.kcal, 0, 5000),
      proteinG: numIn(n.proteinG, 0, 500),
      carbsG: numIn(n.carbsG, 0, 1000),
      fatG: numIn(n.fatG, 0, 500),
      fiberG: numIn(n.fiberG, 0, 200),
    },
  };
}

export function parseRecipeReply(text, groups) {
  const obj = parseJsonReply(text);
  // Some models wrap it: {"recipe": {...}}
  return sanitizeRecipe(obj.recipe && !obj.name ? obj.recipe : obj, groups);
}

export function parseAssistantReply(text, groups) {
  const obj = parseJsonReply(text);
  const reply = cleanText(obj.reply, MAX.reply) || (obj.recipe ? "Aquí tienes la propuesta." : "");
  let recipe = null;
  if (obj.recipe && typeof obj.recipe === "object") recipe = sanitizeRecipe(obj.recipe, groups);
  const mode = recipe ? (obj.mode === "new" ? "new" : obj.mode === "update" ? "update" : "new") : null;
  if (!reply && !recipe) throw new AiFormatError("La respuesta está vacía.");
  return { reply, mode, recipe };
}

export function parseIdeasReply(text, groups) {
  const obj = parseJsonReply(text);
  const list = Array.isArray(obj.ideas) ? obj.ideas : Array.isArray(obj) ? obj : [];
  const ideas = [];
  for (const raw of list.slice(0, 6)) {
    try {
      ideas.push(sanitizeRecipe(raw, groups));
    } catch {
      // Skip a malformed idea, keep the rest.
    }
  }
  if (!ideas.length) throw new AiFormatError("No llegó ninguna idea válida.");
  return ideas;
}

/** What changes if a proposal replaces a recipe (shown before applying). */
export function describeChanges(state, recipe, input) {
  const before = recipeToJson(state, recipe);
  const changes = [];
  if (before.name !== input.name) changes.push(`Nombre: «${before.name}» → «${input.name}»`);
  if (before.servings !== input.servings) changes.push(`Raciones: ${before.servings} → ${input.servings}`);
  const newLines = input.ingredientsText.split("\n");
  const added = newLines.filter((l) => !before.ingredients.includes(l));
  const removed = before.ingredients.filter((l) => !newLines.includes(l));
  if (added.length) changes.push(`Ingredientes nuevos o cambiados: ${added.length}`);
  if (removed.length) changes.push(`Ingredientes quitados o cambiados: ${removed.length}`);
  if (JSON.stringify(before.instructions) !== JSON.stringify(input.instructions)) changes.push("Instrucciones actualizadas");
  if (before.nutrition.kcal !== input.nutrition.kcal && input.nutrition.kcal != null) {
    changes.push(`Calorías por ración: ${before.nutrition.kcal ?? "–"} → ${input.nutrition.kcal}`);
  }
  return changes.length ? changes : ["Sin cambios"];
}

/** Map the model's picks back to the candidate recipes (anything else is dropped). */
export function parseSuggestReply(text, candidates) {
  const obj = parseJsonReply(text);
  const list = Array.isArray(obj.suggestions) ? obj.suggestions : [];
  const norm = (x) => stripAccents(String(x).toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();
  const byName = new Map(candidates.map((c) => [norm(c.recipe.name), c.recipe]));
  const out = [];
  for (const item of list) {
    const recipe = byName.get(norm(item?.name ?? ""));
    if (!recipe || out.some((o) => o.recipe.id === recipe.id)) continue;
    out.push({ recipe, reason: cleanText(item.reason, 300) });
  }
  if (!out.length) throw new AiFormatError("Las sugerencias no corresponden a tus recetas.");
  return out;
}

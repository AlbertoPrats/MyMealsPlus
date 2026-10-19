// Parser for recetas.md-style markdown and for free-text ingredient lines.
//
// Ingredient lines are written by hand ("1 bote de garbanzos (kikärtor), 400 g
// (240 g escurridos)"), so parsing is best-effort: quantity / unit / name are
// extracted when possible and the original text is always kept in `raw`.

const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };

const MEASURE_UNITS = {
  g: "g", gr: "g", kg: "kg", ml: "ml", l: "l",
  cda: "cda", cdas: "cda", cdta: "cdta", cdtas: "cdta",
};

// Countable containers: "2 latas de atún" -> unit "lata", name "atún".
const CONTAINER_UNITS = {
  bote: "bote", botes: "bote", lata: "lata", latas: "lata",
  diente: "diente", dientes: "diente", trozo: "trozo", trozos: "trozo",
  hoja: "hoja", hojas: "hoja", rebanada: "rebanada", rebanadas: "rebanada",
  "lámina": "lámina", "láminas": "lámina", filete: "filete", filetes: "filete",
  vaso: "vaso", vasos: "vaso",
};

// "Salsa: 150 g de yogur ..." groups sub-ingredients.
const SECTION_PREFIX = /^(?<section>[A-ZÁÉÍÓÚ][^:]{0,40}):\s*(?<rest>.+)$/u;
const OPTIONAL_SECTIONS = new Set(["opcional", "recomendado"]);

const NUM = "(?:\\d+(?:[.,]\\d+)?)?[½¼¾⅓⅔]?";
const QTY_RE = new RegExp(
  `^(?<approx>~)?\\s*(?<q1>${NUM})(?:\\s*[–-]\\s*(?<q2>${NUM}))?(?:\\s*×\\s*(?<mult>${NUM}))?\\s+(?<rest>.+)$`,
  "u",
);
// "400 g", "2 × 120 g": size annotation of the previous segment.
const SIZE_ONLY_RE = new RegExp(`^~?\\s*${NUM}(\\s*×\\s*${NUM})?\\s*(g|kg|ml|l)\\s*(\\(.*\\))?$`, "iu");
// "maicena disuelta en 4 cda de agua" -> name "maicena", note "disuelta en ...".
const NAME_NOTE_RE = /\s+(?:(?=\+)|(?=(?:disuelt[ao]s?|en dados|en tiras|en tacos)\b))/u;
// "congelado previamente" describes the previous ingredient.
const PARTICIPLE_RE = /^[a-záéíóúñ]+(?:ado|ido|ada|ida)s?(?![\p{L}])/u;
const ZUMO_RE = /^(?<what>zumo|ralladura) de (?<rest>.+)$/iu;
const TO_TASTE_RE = /\s*\b(al gusto|una pizca de)\b\s*/giu;
const STORAGE_DAYS_RE = /(\d+)\s*días?/u;
const SPANISH_STARTERS = new Set([
  "o", "mejor", "la", "el", "los", "las", "sin", "mín", "opcional", "en",
  "no", "deshuesado", "pechuga", "contramuslo", "versión", "con",
]);
// Variants bought as the same thing.
const KEY_ALIASES = {
  "patata mediana": "patata",
  "contramuslo de pollo deshuesado": "contramuslo deshuesado",
  yogur: "yogur natural",
  "cebolla rallada": "cebolla",
  "ajo rallado": "ajo",
  "agua fria": "agua",
};
const CONNECTORS = new Set(["de", "del", "al", "a", "en", "con", "y", "o"]);

export function parseNumber(text) {
  if (!text) return null;
  let total = 0;
  let digits = text;
  const last = text.at(-1);
  if (last in FRACTIONS) {
    total += FRACTIONS[last];
    digits = text.slice(0, -1);
  }
  if (digits) total += parseFloat(digits.replace(",", "."));
  return total;
}

export function stripAccents(text) {
  return text.normalize("NFD").replace(/\p{Mn}/gu, "");
}

function singularize(word) {
  if (word.length > 3 && word.endsWith("nes") && "aeiou".includes(word.at(-4))) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && "aeiou".includes(word.at(-2))) return word.slice(0, -1);
  return word;
}

/** Normalized key used to add up the same ingredient across recipes. */
export function ingredientKey(name) {
  const words = stripAccents(name.toLowerCase())
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (CONNECTORS.has(w) ? w : singularize(w)));
  const key = words.join(" ").trim();
  return KEY_ALIASES[key] ?? key;
}

/** Split on `sep`, ignoring separators inside parentheses. */
export function splitTopLevel(text, sep = ",") {
  const parts = [];
  let depth = 0;
  let buf = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      parts.push(buf.trim());
      buf = "";
    } else {
      buf += ch;
    }
  }
  parts.push(buf.trim());
  return parts.filter(Boolean);
}

function extractParentheses(text) {
  const found = [...text.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]);
  const cleaned = text.replace(/\s*\([^()]*\)/g, "").trim();
  return [cleaned, found];
}

function looksSwedish(paren) {
  if (/\d/.test(paren)) return false;
  const words = paren.split(/\s+/).filter(Boolean);
  if (words.length && SPANISH_STARTERS.has(words[0].toLowerCase())) return false;
  return words.length <= 4;
}

function isUpper(ch) {
  return !!ch && ch === ch.toUpperCase() && ch !== ch.toLowerCase();
}

function stripChars(text, chars) {
  let start = 0;
  let end = text.length;
  while (start < end && chars.includes(text[start])) start++;
  while (end > start && chars.includes(text[end - 1])) end--;
  return text.slice(start, end);
}

export function parseIngredientSegment(segment, section = null, optional = false) {
  const raw = segment;
  let [text, parens] = extractParentheses(segment);
  let swedish = null;
  const notes = [];
  for (const p of parens) {
    if (swedish === null && looksSwedish(p)) swedish = p;
    else notes.push(p);
  }

  TO_TASTE_RE.lastIndex = 0;
  const toTaste = TO_TASTE_RE.test(text);
  text = stripChars(text.replace(TO_TASTE_RE, " ").trim(), " ,");

  let prefixNote = null;
  const zumo = text.match(ZUMO_RE);
  if (zumo) {
    prefixNote = zumo.groups.what.toLowerCase();
    text = zumo.groups.rest;
  }

  let quantity = null;
  let unit = null;
  const m = text.match(QTY_RE);
  if (m && (m.groups.q1 || m.groups.q2)) {
    const q1 = parseNumber(m.groups.q1);
    const q2 = parseNumber(m.groups.q2);
    if (m.groups.mult) {
      quantity = (q1 || 1) * (parseNumber(m.groups.mult) || 1); // "2 × 120 g"
    } else {
      quantity = q2 ?? q1; // ranges ("3–5 cda") are planned with the upper bound
    }
    let rest = m.groups.rest.trim();
    const space = rest.indexOf(" ");
    const first = space === -1 ? rest : rest.slice(0, space);
    const after = space === -1 ? "" : rest.slice(space + 1);
    const lowered = first.toLowerCase();
    if (lowered in MEASURE_UNITS) {
      unit = MEASURE_UNITS[lowered];
      rest = after;
    } else if (lowered in CONTAINER_UNITS && after.toLowerCase().startsWith("de ")) {
      unit = CONTAINER_UNITS[lowered];
      rest = after;
    }
    if (rest.toLowerCase().startsWith("de ")) rest = rest.slice(3);
    text = rest.trim();
  }

  const split = text.split(NAME_NOTE_RE);
  if (split.length >= 2) {
    const idx = text.search(NAME_NOTE_RE);
    const remainder = text.slice(idx).trimStart();
    text = text.slice(0, idx);
    notes.unshift(remainder.replace(/^[+ ]+/, "").trim());
  }
  if (prefixNote) notes.unshift(prefixNote);
  let name = stripChars(text.trim(), " .");
  if (!name) name = raw.trim();
  if (isUpper(name[0]) && !isUpper(name[1])) name = name[0].toLowerCase() + name.slice(1);

  return {
    raw,
    name,
    key: ingredientKey(name),
    quantity,
    unit,
    note: notes.join("; ") || null,
    swedishName: swedish,
    section,
    optional,
    toTaste: toTaste || quantity === null,
  };
}

function splitCompound(rest) {
  const items = [];
  for (const part of splitTopLevel(rest)) {
    if (QTY_RE.test(part) || SIZE_ONLY_RE.test(part)) items.push(part);
    else items.push(...part.split(/\s+y\s+|\s+o\s+(?=[a-z])/u).map((p) => p.trim()).filter(Boolean));
  }
  return items;
}

/** One markdown bullet may hold several ingredients. */
export function parseIngredientLine(line) {
  line = line.trim();
  const original = line;
  let section = null;
  let optional = false;
  const sec = line.match(SECTION_PREFIX);
  if (sec) {
    section = sec.groups.section.trim();
    line = sec.groups.rest.trim();
    optional = OPTIONAL_SECTIONS.has(section.toLowerCase());
  }

  const merged = [];
  const extras = [];
  for (const seg of splitTopLevel(line)) {
    if (merged.length && SIZE_ONLY_RE.test(seg)) {
      extras.at(-1).push(seg);
    } else if (merged.length && PARTICIPLE_RE.test(seg) && QTY_RE.test(merged.at(-1))) {
      extras.at(-1).push(seg);
    } else {
      merged.push(seg);
      extras.push([]);
    }
  }

  const results = [];
  merged.forEach((original, i) => {
    let seg = original;
    if (extras[i].length) {
      const flat = extras[i].map((e) => e.replace(/\s*\(([^()]*)\)/g, "; $1"));
      seg = `${seg} (${flat.join("; ")})`;
    }
    const hasQty = QTY_RE.test(seg) || ZUMO_RE.test(seg);
    if (!hasQty && section === null && merged.length === 1 && seg.includes(" o ") && !seg.includes("(")) {
      // "Salsa de tomate tipo taco o tomate fresco picado": one item with an alternative.
      results.push(parseIngredientSegment(seg, section, optional));
    } else if (!hasQty && (seg.includes(" y ") || seg.includes(","))) {
      for (const item of splitCompound(seg)) results.push(parseIngredientSegment(item, section, optional));
    } else {
      results.push(parseIngredientSegment(seg, section, optional));
    }
  });
  // Keep the bullet as written so the recipe editor can show it back.
  for (const r of results) r.line = original;
  return results;
}

/** Ingredient lines as the user wrote them (for the recipe editor). */
export function ingredientLines(ingredients) {
  const lines = [];
  for (const i of ingredients) {
    const line = i.line ?? i.raw;
    if (lines.at(-1) !== line) lines.push(line);
  }
  return lines;
}

/** Parse several lines (one ingredient line each) typed by the user. */
export function parseIngredientText(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .flatMap(parseIngredientLine);
}

export function parseTimeMinutes(text) {
  const h = text.match(/(\d+)\s*h/);
  const mins = text.match(/(\d+)\s*min/);
  if (!h && !mins) return null;
  return (h ? parseInt(h[1], 10) * 60 : 0) + (mins ? parseInt(mins[1], 10) : 0);
}

export function parseStorage(text) {
  const lowered = text.toLowerCase();
  const freezable = lowered.includes("congel");
  if (lowered.includes("al momento") || lowered.includes("en el día")) return [0, freezable];
  const m = lowered.match(STORAGE_DAYS_RE);
  return [m ? parseInt(m[1], 10) : null, freezable];
}

const NUTRITION_KEYS = {
  "calorías": "kcal",
  "proteínas": "proteinG",
  "hidratos de carbono": "carbsG",
  grasas: "fatG",
  fibra: "fiberG",
};

const FREQ_RE = /(?<name>[a-záéíóúñ /]+?)\s+(?<min>\d+)[–-](?<max>\d+)(?:\s*\((?<note>[^)]*)\))?/u;

function parseFrequencies(line) {
  const body = line.slice(line.indexOf(":") + 1);
  const out = {};
  for (const part of body.split("·")) {
    const m = part.trim().toLowerCase().match(FREQ_RE);
    if (m) out[m.groups.name.trim()] = [+m.groups.min, +m.groups.max, m.groups.note ?? null];
  }
  return out;
}

function matchFrequency(group, freqs) {
  const g = stripAccents(group.toLowerCase()).replaceAll(" ", "");
  for (const [name, value] of Object.entries(freqs)) {
    const n = stripAccents(name).replaceAll(" ", "");
    if (g === n || g.startsWith(n) || n.startsWith(g)) return value;
  }
  return null;
}

export function parseMarkdown(text) {
  const groups = [];
  const recipes = [];
  let freqs = {};
  let currentGroup = null;
  let recipe = null;
  let block = null;

  for (const rawLine of text.split("\n")) {
    const stripped = rawLine.trim();
    if (stripped.includes("Frecuencia semanal")) {
      freqs = parseFrequencies(stripped.replace(/^[> -]+/, ""));
      continue;
    }
    if (stripped.startsWith("## ")) {
      currentGroup = stripped.slice(3).trim();
      groups.push({ name: currentGroup, weeklyMin: null, weeklyMax: null, note: null });
      recipe = null;
      block = null;
      continue;
    }
    if (stripped.startsWith("### ")) {
      recipe = {
        name: stripped.slice(4).trim(),
        group: currentGroup ?? "Sin grupo",
        servings: 1,
        servingsNote: null,
        timeText: null,
        timeMinutes: null,
        equipment: [],
        storageText: null,
        storageDays: null,
        freezable: false,
        ingredients: [],
        instructions: [],
        nutrition: {},
      };
      recipes.push(recipe);
      block = "meta";
      continue;
    }
    if (!recipe || !stripped || stripped === "---") continue;
    const header = stripped.match(/^\*\*(.+?)\*\*$/);
    if (header) {
      const title = header[1].toLowerCase();
      if (title.startsWith("ingredientes")) block = "ingredients";
      else if (title.startsWith("valor nutricional")) block = "nutrition";
      else if (title.startsWith("instrucciones")) block = "instructions";
      continue;
    }

    if (block === "meta") {
      const m = stripped.match(/^- \*\*(.+?):\*\*\s*(.+)/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const value = m[2].trim();
      if (key === "raciones") {
        const n = value.match(/^(\d+)\s*(?:\((.+)\))?/);
        recipe.servings = n ? parseInt(n[1], 10) : 1;
        recipe.servingsNote = n?.[2] ?? null;
      } else if (key === "tiempo") {
        recipe.timeText = value;
        recipe.timeMinutes = parseTimeMinutes(value);
      } else if (key === "equipo") {
        recipe.equipment = value.toLowerCase() === "ninguno" ? [] : value.split(",").map((e) => e.trim());
      } else if (key === "conservación") {
        recipe.storageText = value;
        [recipe.storageDays, recipe.freezable] = parseStorage(value);
      }
    } else if (block === "ingredients" && stripped.startsWith("- ")) {
      recipe.ingredients.push(...parseIngredientLine(stripped.slice(2)));
    } else if (block === "nutrition" && stripped.startsWith("- ")) {
      const m = stripped.match(/^- (.+?):\s*([\d.,]+)/);
      if (m && NUTRITION_KEYS[m[1].toLowerCase()]) {
        recipe.nutrition[NUTRITION_KEYS[m[1].toLowerCase()]] = parseFloat(m[2].replace(",", "."));
      }
    } else if (block === "instructions") {
      const m = stripped.match(/^\d+\.\s+(.+)/);
      if (m) recipe.instructions.push(m[1].trim());
    }
  }

  for (const g of groups) {
    const f = matchFrequency(g.name, freqs);
    if (f) [g.weeklyMin, g.weeklyMax, g.note] = f;
  }
  return { groups, recipes };
}

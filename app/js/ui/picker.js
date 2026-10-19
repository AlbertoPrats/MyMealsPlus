// Sheet shown after pressing "+" on a slot: choose from the list (spare
// rations first, filterable by group), ask the assistant for suggestions, or
// create a new meal, which the assistant turns into a full recipe.

import { newRecipeTask, parseRecipeReply, parseSuggestReply, suggestTask } from "../core/ai-recipes.js";
import { shortDate, today, weekdayName } from "../core/dates.js";
import { recipeStats } from "../core/history.js";
import { addMeal, getMealType, picker, saveRecipe, sortedGroups } from "../core/planner.js";
import { suggestionContext } from "../core/suggest.js";
import { html, useState } from "../../vendor/preact-htm.js";
import { AiStatusLine, AiTask } from "./ai-task.js";
import { GroupChips, Sheet, Stepper, colorForGroupId, icon, navigate, run, useAppState } from "./common.js";
import { RecipePreview } from "./recipe-preview.js";

function expiryText(b) {
  if (b.frozen) return "congelado";
  if (b.daysLeft == null) return "";
  if (b.daysLeft === 0) return "caduca hoy";
  if (b.daysLeft === 1) return "caduca mañana";
  return `aguanta ${b.daysLeft} días`;
}

function recipeSub(r, stats) {
  const st = stats.get(r.id);
  return [r.groupName, `${r.servings} rac.`, r.timeMinutes ? `${r.timeMinutes} min` : null, st ? `hecha ${st.timesCooked}×` : null]
    .filter(Boolean)
    .join(" · ");
}

export function PickerSheet({ date, mealTypeId, onClose }) {
  const state = useAppState();
  const [mode, setMode] = useState("list");
  const [groupId, setGroupId] = useState(null);
  const [q, setQ] = useState("");
  const [scale, setScale] = useState(1);
  const [people, setPeople] = useState(1);
  const mealType = getMealType(state, mealTypeId);
  const groups = sortedGroups(state);
  const options = picker(state, { date, mealTypeId, groupId, q });
  const stats = recipeStats(state);

  const add = (body, message) => {
    if (run((s) => addMeal(s, { date, mealTypeId, servings: people, ...body }), message)) onClose();
  };
  const addRecipe = (r) => {
    const total = Math.max(1, Math.round(r.servings * scale));
    const spare = total - people;
    add({ recipeId: r.id, scale }, spare > 0 ? `Añadido. Quedan ${spare} raciones de sobra.` : "Añadido.");
  };
  const recipeButton = (r, sub) => html`<button class="list-item" onClick=${() => addRecipe(r)}>
    <span class="meal-bar" style=${{ background: colorForGroupId(state, r.groupId) }}></span>
    <span class="item-text">
      <span class="item-name">
        ${r.favorite ? html`<span class="fav">${icon("star", 14)}</span>` : null}${r.name}
        ${r.status === "unknown" ? html` <span class="badge muted">por completar</span>` : null}
      </span>
      <span class="item-sub">${sub}</span>
    </span>
  </button>`;

  return html`<${Sheet} title=${`${mealType.name} · ${weekdayName(date)} ${shortDate(date)}`} onClose=${onClose} tall>
    <div class="segmented" role="tablist">
      <button role="tab" aria-selected=${mode === "list"} class=${mode === "list" ? "active" : ""} onClick=${() => setMode("list")}>
        Elegir de la lista
      </button>
      <button role="tab" aria-selected=${mode === "new"} class=${mode === "new" ? "active" : ""} onClick=${() => setMode("new")}>
        Crear nueva
      </button>
    </div>

    <div class="picker-options">
      <span>Personas</span>
      <${Stepper} value=${people} onChange=${setPeople} min=${1} max=${12} label="Personas" />
      ${mode === "list"
        ? html`<span>Cantidad</span>
            <div class="mini-seg">
              ${[1, 2, 3].map(
                (x) => html`<button key=${x} class=${scale === x ? "active" : ""} onClick=${() => setScale(x)}>×${x}</button>`,
              )}
            </div>`
        : null}
    </div>

    ${mode === "list"
      ? html`
          <label class="search">
            ${icon("search", 18)}
            <input type="search" placeholder="Buscar receta" value=${q} onInput=${(e) => setQ(e.target.value)} />
          </label>
          <${GroupChips} groups=${groups} value=${groupId} onChange=${setGroupId} />

          ${options.leftovers.length
            ? html`<h3 class="list-title leftovers-title">Raciones sobrantes</h3>
                <ul class="list">
                  ${options.leftovers.map(
                    (b) => html`<li key=${b.id}>
                      <button class="list-item leftover-item" onClick=${() => add({ batchId: b.id }, "Sobras añadidas.")}>
                        <span class="meal-bar" style=${{ background: colorForGroupId(state, b.recipe.groupId) }}></span>
                        <span class="item-text">
                          <span class="item-name">${b.recipe.name}</span>
                          <span class="item-sub">
                            Quedan ${b.remainingServings} · cocinado ${weekdayName(b.cookDate)} ${shortDate(b.cookDate)}
                            ${expiryText(b) ? ` · ${expiryText(b)}` : ""}
                          </span>
                        </span>
                        <span class="badge leftover">${b.remainingServings}</span>
                      </button>
                    </li>`,
                  )}
                </ul>`
            : null}

          <${AiSuggestions}
            key=${`${groupId}`}
            state=${state}
            date=${date}
            mealTypeId=${mealTypeId}
            groupId=${groupId}
            renderPick=${(recipe, reason) => recipeButton({ ...recipe, groupName: state.groups.find((g) => g.id === recipe.groupId)?.name }, reason)}
          />

          <h3 class="list-title">Recetas</h3>
          ${options.recipes.length
            ? html`<ul class="list">
                ${options.recipes.map((r) => html`<li key=${r.id}>${recipeButton(r, recipeSub(r, stats))}</li>`)}
              </ul>`
            : html`<p class="muted pad">Ninguna receta coincide.</p>`}
        `
      : html`<${NewMeal} state=${state} groups=${groups} date=${date} mealTypeId=${mealTypeId} people=${people} onDone=${onClose} />`}
  </${Sheet}>`;
}

/** Describe a meal in your own words; the assistant writes the recipe. */
export function NewMeal({ state, groups, date, mealTypeId, people, onDone, initialDescription = "" }) {
  const [step, setStep] = useState("describe"); // describe | ai | preview
  const [description, setDescription] = useState(initialDescription);
  const [groupId, setGroupId] = useState("");
  const [input, setInput] = useState(null);
  const groupName = groups.find((g) => g.id === Number(groupId))?.name ?? null;
  const task = newRecipeTask(groups, description, { groupName });

  const save = (thenEdit) => {
    let recipeId = null;
    const ok = run((s) => {
      const r = saveRecipe(s, input);
      recipeId = r.id;
      addMeal(s, { date, mealTypeId, recipeId: r.id, servings: people });
    }, `«${input.name}» guardada y añadida.`);
    if (!ok) return;
    onDone();
    if (thenEdit) navigate(`/receta/${recipeId}/editar`);
  };
  const createUnknown = () => {
    if (run((s) => addMeal(s, { date, mealTypeId, servings: people, newMeal: { name: description, groupId: groupId ? Number(groupId) : null } }),
      "Comida creada sin receta. Complétala cuando quieras.")) onDone();
  };

  if (step === "ai") {
    return html`<div class="form">
      <p class="muted">Creando la receta de «${description.trim()}»…</p>
      <${AiTask}
        state=${state}
        task=${task}
        parse=${(text) => parseRecipeReply(text, groups)}
        onResult=${(value) => {
          setInput(value);
          setStep("preview");
        }}
        onCancel=${() => setStep("describe")}
      />
    </div>`;
  }
  if (step === "preview" && input) {
    return html`<div class="form">
      <${RecipePreview} state=${state} input=${input} />
      <button class="primary block" onClick=${() => save(false)}>${icon("check", 18)} Guardar y añadir</button>
      <div class="button-row">
        <button class="secondary" onClick=${() => save(true)}>${icon("edit", 16)} Guardar y editar</button>
        <button class="secondary" onClick=${() => setStep("ai")}>Otra versión</button>
      </div>
      <button class="text-btn" onClick=${() => setStep("describe")}>Volver</button>
    </div>`;
  }
  return html`<form class="form" onSubmit=${(e) => { e.preventDefault(); if (description.trim()) setStep("ai"); }}>
    <label>¿Qué vas a comer?
      <textarea
        rows="4"
        required
        placeholder="Lentejas de mi abuela con chorizo, para 4… o «algo rápido con pollo y arroz»"
        value=${description}
        onInput=${(e) => setDescription(e.target.value)}
      ></textarea>
    </label>
    <p class="muted small">Escribe con el detalle que quieras: el asistente completa ingredientes, cantidades, pasos y valores nutricionales.</p>
    <label>Grupo (opcional)
      <select value=${groupId} onChange=${(e) => setGroupId(e.target.value)}>
        <option value="">Que lo elija el asistente</option>
        ${groups.map((g) => html`<option key=${g.id} value=${g.id}>${g.name}</option>`)}
      </select>
    </label>
    <button class="primary block" type="submit" disabled=${!description.trim()}>${icon("sparkle", 18)} Crear receta con el asistente</button>
    <${AiStatusLine} state=${state} />
    <button type="button" class="text-btn" disabled=${!description.trim()} onClick=${createUnknown}>
      Añadir sin receta por ahora (queda «por completar»)
    </button>
  </form>`;
}

/** "What should I eat here?": the assistant picks from your recipes and says why. */
export function AiSuggestions({ state, date, mealTypeId, groupId, renderPick }) {
  const [step, setStep] = useState("idle"); // idle | ai | done
  const [note, setNote] = useState("");
  const [picks, setPicks] = useState([]);
  const [ctx, setCtx] = useState(null);
  const start = () => {
    setCtx(suggestionContext(state, today(), { date, mealTypeId, groupId }));
    setStep("ai");
  };
  return html`<section class="ai-suggest">
    <h3 class="list-title foryou-title">${icon("sparkle", 14)} Sugerencias del asistente</h3>
    ${step === "idle"
      ? html`<form class="inline-form" onSubmit=${(e) => { e.preventDefault(); start(); }}>
          <input type="text" placeholder="¿Algún antojo? (opcional)" value=${note} onInput=${(e) => setNote(e.target.value)} aria-label="Antojo" />
          <button class="secondary" type="submit">Sugerir</button>
        </form>`
      : null}
    ${step === "ai"
      ? html`<${AiTask}
          state=${state}
          task=${suggestTask(state, { ...ctx, note })}
          parse=${(text) => parseSuggestReply(text, ctx.candidates)}
          onResult=${(value) => {
            setPicks(value);
            setStep("done");
          }}
          onCancel=${() => setStep("idle")}
        />`
      : null}
    ${step === "done"
      ? html`<ul class="list">${picks.map(({ recipe, reason }) => html`<li key=${`ai${recipe.id}`}>${renderPick(recipe, reason)}</li>`)}</ul>
          <button class="text-btn" onClick=${() => setStep("idle")}>Otras sugerencias</button>`
      : null}
  </section>`;
}

// Details of a planned meal: servings, batch (freeze / size), move, delete.

import { shortDate, weekdayName } from "../core/dates.js";
import { deleteMeal, mealView, sortedMealTypes, updateBatch, updateMeal } from "../core/planner.js";
import { html, useState } from "../../vendor/preact-htm.js";
import { Sheet, Stepper, icon, navigate, run, useAppState } from "./common.js";

export function MealSheet({ mealId, onClose }) {
  const state = useAppState();
  const raw = state.meals.find((m) => m.id === mealId);
  const meal = raw ? mealView(state, raw) : null;
  const [moveDate, setMoveDate] = useState(meal?.date ?? "");
  const [moveType, setMoveType] = useState(meal?.mealTypeId ?? null);
  if (!meal) return null;

  const { batch, recipe } = meal;
  const cookType = state.mealTypes.find((t) => t.id === batch.cookMealTypeId);
  const isCookMeal = !meal.isLeftover && batch.cookMealTypeId === meal.mealTypeId && batch.cookDate === meal.date;
  const types = sortedMealTypes(state);
  const openRecipe = () => {
    onClose();
    navigate(`/receta/${recipe.id}`);
  };

  return html`<${Sheet} title=${recipe.name} onClose=${onClose}>
    ${meal.warnings.map((w) => html`<p class="alert">${icon("warning", 18)} ${w}</p>`)}

    <dl class="facts">
      <div>
        <dt>${meal.isLeftover ? "Sobras de" : "Se cocina"}</dt>
        <dd>
          ${weekdayName(batch.cookDate)} ${shortDate(batch.cookDate)}${cookType ? ` · ${cookType.name.toLowerCase()}` : " · día de cocinar"}
        </dd>
      </div>
      <div>
        <dt>Lote</dt>
        <dd>${batch.totalServings} raciones · quedan ${batch.remainingServings}</dd>
      </div>
      <div>
        <dt>Conservación</dt>
        <dd>
          ${batch.frozen ? "congelado" : batch.expiresOn ? `hasta ${weekdayName(batch.expiresOn)} ${shortDate(batch.expiresOn)}` : "sin dato"}
        </dd>
      </div>
    </dl>

    <div class="row-setting">
      <span>Personas en esta comida</span>
      <${Stepper}
        value=${meal.servings}
        onChange=${(v) => run((s) => updateMeal(s, meal.id, { servings: v }))}
        min=${1}
        max=${12}
        label="Personas"
      />
    </div>

    ${isCookMeal
      ? html`<div class="row-setting">
          <span>Cantidad a cocinar</span>
          <div class="mini-seg">
            ${[1, 2, 3].map(
              (x) => html`<button
                key=${x}
                class=${batch.scale === x ? "active" : ""}
                onClick=${() => run((s) => updateBatch(s, batch.id, { scale: x }))}
              >
                ×${x}
              </button>`,
            )}
          </div>
        </div>`
      : null}

    <div class="row-setting">
      <span>Congelado ${recipe.freezable ? html`<small class="muted">(se congela bien)</small>` : null}</span>
      <input
        type="checkbox"
        class="switch"
        checked=${batch.frozen}
        onChange=${(e) => run((s) => updateBatch(s, batch.id, { frozen: e.target.checked }))}
      />
    </div>

    <div class="row-setting">
      <span>Ya comido</span>
      <input
        type="checkbox"
        class="switch"
        checked=${meal.eaten}
        onChange=${(e) => run((s) => updateMeal(s, meal.id, { eaten: e.target.checked }))}
      />
    </div>

    <h3 class="list-title">Mover a</h3>
    <div class="move-row">
      <input type="date" value=${moveDate} onInput=${(e) => setMoveDate(e.target.value)} />
      <select value=${moveType} onChange=${(e) => setMoveType(Number(e.target.value))}>
        ${types.map((t) => html`<option key=${t.id} value=${t.id}>${t.name}</option>`)}
      </select>
      <button
        class="secondary"
        disabled=${!moveDate || (moveDate === meal.date && moveType === meal.mealTypeId)}
        onClick=${() => run((s) => updateMeal(s, meal.id, { date: moveDate, mealTypeId: moveType }), "Movido.") && onClose()}
      >
        Mover
      </button>
    </div>

    <div class="button-row">
      <button class="secondary" onClick=${openRecipe}>
        ${recipe.status === "unknown" ? "Completar receta" : "Ver receta"}
      </button>
      <button
        class="danger"
        onClick=${() => {
          if (run((s) => deleteMeal(s, meal.id), "Comida eliminada.")) onClose();
        }}
      >
        ${icon("trash", 18)} Quitar
      </button>
    </div>
  </${Sheet}>`;
}

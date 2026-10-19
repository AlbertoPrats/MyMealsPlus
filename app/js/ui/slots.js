// A day's meal slots (Comida, Cena...) with their meals and "+" buttons.
// Used by the main page and by the prep page.

import { shortDate, weekdayName } from "../core/dates.js";
import { html } from "../../vendor/preact-htm.js";
import { colorForGroupId, icon } from "./common.js";
import { openSheet } from "./sheets.js";

function mealSubtitle(state, meal) {
  const parts = [];
  if (meal.recipe.groupName) parts.push(meal.recipe.groupName);
  if (meal.isLeftover) {
    const cookType = state.mealTypes.find((t) => t.id === meal.batch.cookMealTypeId);
    parts.push(`Sobras de ${weekdayName(meal.batch.cookDate).slice(0, 3)} ${cookType ? cookType.name.toLowerCase() : ""}`.trim());
  } else if (meal.batch.totalServings > 1) {
    parts.push(`Cocinar ${meal.batch.totalServings} raciones`);
  } else {
    parts.push("Cocinar");
  }
  if (meal.servings > 1) parts.push(`${meal.servings} personas`);
  return parts.join(" · ");
}

export function MealRow({ state, meal }) {
  const unknown = meal.recipe.status === "unknown";
  return html`<button class="meal-row ${meal.eaten ? "eaten" : ""}" onClick=${() => openSheet({ type: "meal", mealId: meal.id })}>
    <span class="meal-bar" style=${{ background: colorForGroupId(state, meal.recipe.groupId) }}></span>
    <span class="meal-text">
      <span class="meal-name">${meal.recipe.name}${unknown ? html` <span class="badge muted">por completar</span>` : null}</span>
      <span class="meal-sub">${mealSubtitle(state, meal)}</span>
    </span>
    ${meal.isLeftover ? html`<span class="badge leftover">Sobras</span>` : null}
    ${meal.batch.frozen ? html`<span class="badge frozen" title="Congelado">${icon("snow", 14)}</span>` : null}
    ${meal.warnings.some((w) => !w.startsWith("Receta pendiente"))
      ? html`<span class="warn" title=${meal.warnings.join("\n")}>${icon("warning", 18)}</span>`
      : null}
    ${meal.eaten ? html`<span class="eaten-check" title="Comido">${icon("check", 18)}</span>` : null}
  </button>`;
}

export function DaySlots({ state, day, compact = false }) {
  return html`<div class="slots ${compact ? "compact" : ""}">
    ${day.slots.map(
      (slot) => html`<section key=${slot.mealType.id} class="slot card">
        <header class="slot-header">
          <h3>${slot.mealType.name}</h3>
          <button
            class="add-btn"
            aria-label=${`Añadir ${slot.mealType.name.toLowerCase()} el ${shortDate(day.date)}`}
            onClick=${() => openSheet({ type: "picker", date: day.date, mealTypeId: slot.mealType.id })}
          >
            ${icon("plus", 20)}
          </button>
        </header>
        ${slot.meals.length
          ? slot.meals.map((m) => html`<${MealRow} key=${m.id} state=${state} meal=${m} />`)
          : html`<button
              class="slot-empty"
              onClick=${() => openSheet({ type: "picker", date: day.date, mealTypeId: slot.mealType.id })}
            >
              Sin planificar · toca para añadir
            </button>`}
      </section>`,
    )}
  </div>`;
}

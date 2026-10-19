// Shows a recipe proposed by the AI (already validated) before saving it.

import { parseIngredientText } from "../core/parser.js";
import { formatAmount } from "../core/shopping.js";
import { html } from "../../vendor/preact-htm.js";
import { colorForGroupId, icon } from "./common.js";

export function RecipePreview({ state, input, changes = null }) {
  const ingredients = parseIngredientText(input.ingredientsText);
  const group = state.groups.find((g) => g.id === input.groupId);
  return html`<article class="preview card pad">
    <h3 class="preview-title">${input.name}</h3>
    <div class="tags">
      ${group
        ? html`<span class="tag"><span class="dot" style=${{ background: colorForGroupId(state, group.id) }}></span>${group.name}</span>`
        : html`<span class="tag">Sin grupo</span>`}
      <span class="tag">${input.servings} ${input.servings === 1 ? "ración" : "raciones"}</span>
      ${input.timeMinutes ? html`<span class="tag">${icon("clock", 14)} ${input.timeMinutes} min</span>` : null}
      ${input.storageText ? html`<span class="tag">${input.storageText}</span>` : null}
      ${input.nutrition?.kcal ? html`<span class="tag">${input.nutrition.kcal} kcal/ración</span>` : null}
    </div>
    ${changes?.length
      ? html`<ul class="changes">${changes.map((c, i) => html`<li key=${i}>${c}</li>`)}</ul>`
      : null}
    <details open=${changes == null}>
      <summary>${ingredients.length} ingredientes · ${input.instructions.length} pasos</summary>
      <ul class="ingredients">
        ${ingredients.map(
          (i, idx) => html`<li key=${idx}>
            <span class="qty">${formatAmount(i)}</span>
            <span>${i.name}${i.swedishName ? html` <span class="sv">${i.swedishName}</span>` : null}</span>
          </li>`,
        )}
      </ul>
      <ol class="steps">${input.instructions.map((s, idx) => html`<li key=${idx}>${s}</li>`)}</ol>
    </details>
  </article>`;
}

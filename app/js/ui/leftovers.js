// Floating orb (spare rations reminder) and the sheet it opens.

import { shortDate, today, weekdayName } from "../core/dates.js";
import { leftovers, updateBatch } from "../core/planner.js";
import { html } from "../../vendor/preact-htm.js";
import { Sheet, colorForGroupId, icon, run, useAppState } from "./common.js";
import { openSheet } from "./sheets.js";

export function Orb({ state }) {
  const data = leftovers(state, today());
  if (!data.totalSpareServings) return null;
  const urgent = data.batches.some((b) => b.expiringSoon);
  return html`<button
    class="orb ${urgent ? "urgent" : ""}"
    aria-label=${`${data.totalSpareServings} raciones sobrantes`}
    onClick=${() => openSheet({ type: "leftovers" })}
  >
    ${icon("box", 20)}
    <span class="orb-count">${data.totalSpareServings}</span>
  </button>`;
}

function expiry(b) {
  if (b.frozen) return html`<span class="badge frozen">${icon("snow", 12)} congelado</span>`;
  if (b.daysLeft == null) return null;
  const text = b.daysLeft === 0 ? "caduca hoy" : b.daysLeft === 1 ? "caduca mañana" : `${b.daysLeft} días`;
  return html`<span class="badge ${b.expiringSoon ? "urgent" : "muted"}">${text}</span>`;
}

export function LeftoversSheet({ onClose }) {
  const state = useAppState();
  const data = leftovers(state, today());
  return html`<${Sheet} title="Raciones sobrantes" onClose=${onClose}>
    ${data.batches.length
      ? html`<p class="muted">
            Al pulsar «+» en cualquier comida, estas raciones aparecen las primeras de la lista.
          </p>
          <ul class="list">
            ${data.batches.map(
              (b) => html`<li key=${b.id} class="leftover-card">
                <div class="leftover-head">
                  <span class="meal-bar" style=${{ background: colorForGroupId(state, b.recipe.groupId) }}></span>
                  <span class="item-text">
                    <span class="item-name">${b.recipe.name}</span>
                    <span class="item-sub">
                      Quedan ${b.remainingServings} de ${b.totalServings} · cocinado ${weekdayName(b.cookDate)}
                      ${shortDate(b.cookDate)}
                    </span>
                  </span>
                  ${expiry(b)}
                </div>
                <div class="button-row small">
                  <button class="secondary" onClick=${() => run((s) => updateBatch(s, b.id, { frozen: !b.frozen }), b.frozen ? "Descongelado." : "Congelado: ya no caduca.")}>
                    ${icon("snow", 16)} ${b.frozen ? "Descongelar" : "Congelar"}
                  </button>
                  <button
                    class="secondary"
                    onClick=${() => run((s) => updateBatch(s, b.id, { discardedServings: b.discardedServings + 1 }), "Ración descartada.")}
                  >
                    Descartar 1
                  </button>
                </div>
              </li>`,
            )}
          </ul>`
      : html`<p class="muted">No quedan raciones sobrantes.</p>`}
  </${Sheet}>`;
}

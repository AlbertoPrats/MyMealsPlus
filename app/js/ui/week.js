// Main page: week strip at the top and the selected day's meals below.

import { addDays, dayNumber, longDate, monthName, range, startOfWeek, today, weekdayShort } from "../core/dates.js";
import { dayView } from "../core/planner.js";
import { html, useState } from "../../vendor/preact-htm.js";
import { icon } from "./common.js";
import { DaySlots } from "./slots.js";

let rememberedDay = null;

export function WeekPage({ state }) {
  const now = today();
  const [selected, setSelectedRaw] = useState(rememberedDay ?? now);
  const setSelected = (d) => {
    rememberedDay = d;
    setSelectedRaw(d);
  };
  const weekStart = startOfWeek(selected);
  const days = range(weekStart, 7);
  const day = dayView(state, selected);
  const plannedDays = new Set(state.meals.map((m) => m.date));
  const kcal = Math.round(day.nutrition.kcal);
  const title = `${monthName(weekStart)} ${weekStart.slice(0, 4)}`;

  return html`<div class="page week-page">
    <header class="top-bar">
      <h1 class="month">${title[0].toUpperCase() + title.slice(1)}</h1>
      <div class="top-actions">
        ${selected !== now ? html`<button class="text-btn" onClick=${() => setSelected(now)}>Hoy</button>` : null}
        <button class="icon-btn" aria-label="Semana anterior" onClick=${() => setSelected(addDays(selected, -7))}>
          ${icon("left")}
        </button>
        <button class="icon-btn" aria-label="Semana siguiente" onClick=${() => setSelected(addDays(selected, 7))}>
          ${icon("right")}
        </button>
      </div>
    </header>

    <nav class="week-strip" aria-label="Días de la semana">
      ${days.map(
        (d) => html`<button
          key=${d}
          class="day-pill ${d === selected ? "selected" : ""} ${d === now ? "today" : ""}"
          aria-pressed=${d === selected}
          aria-label=${longDate(d)}
          onClick=${() => setSelected(d)}
        >
          <span class="wd">${weekdayShort(d)}</span>
          <span class="num">${dayNumber(d)}</span>
          <span class="planned-dot ${plannedDays.has(d) ? "on" : ""}"></span>
        </button>`,
      )}
    </nav>

    <div class="day-title">
      <h2>${longDate(selected)[0].toUpperCase() + longDate(selected).slice(1)}</h2>
      ${kcal ? html`<span class="kcal">${kcal} kcal</span>` : null}
    </div>

    <${DaySlots} state=${state} day=${day} />
  </div>`;
}

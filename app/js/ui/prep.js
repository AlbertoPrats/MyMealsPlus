// Meal-prep tab: periods of a few days, their plan, what to cook and the
// shopping list.

import { autofill } from "../core/autofill.js";
import { addDays, longDate, shortDate, today, weekdayName } from "../core/dates.js";
import {
  balance,
  batchView,
  batchesCookedBetween,
  calendar,
  createPrep,
  deletePrep,
  getPrep,
  prepEnd,
  prepRange,
  sortedGroups,
  sortedMealTypes,
  toggleCheck,
  updatePrep,
} from "../core/planner.js";
import { buildShoppingList, formatAmount, formatNumber, shoppingListText } from "../core/shopping.js";
import { html, useState } from "../../vendor/preact-htm.js";
import { EmptyState, Sheet, Stepper, colorForGroupId, icon, navigate, run, toast } from "./common.js";
import { DaySlots } from "./slots.js";

const prepTitle = (p) =>
  p.name || `${weekdayName(p.startDate).slice(0, 3)} ${shortDate(p.startDate)} – ${weekdayName(prepEnd(p)).slice(0, 3)} ${shortDate(prepEnd(p))}`;

// ------------------------------------------------------------------- list

export function PrepListPage({ state }) {
  const [creating, setCreating] = useState(false);
  const sessions = [...state.prepSessions].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const now = today();
  return html`<div class="page">
    <header class="top-bar">
      <h1>Preparación</h1>
      <div class="top-actions">
        <button class="text-btn" onClick=${() => setCreating(true)}>${icon("plus", 18)} Nueva</button>
      </div>
    </header>
    <p class="muted intro">
      Planifica unos días de golpe: elige las comidas, mira qué hay que cocinar y llévate la lista de la compra.
    </p>
    ${sessions.length
      ? html`<ul class="list card">
          ${sessions.map((p) => {
            const meals = state.meals.filter((m) => m.date >= p.startDate && m.date <= prepEnd(p)).length;
            const slots = p.days * sortedMealTypes(state).length;
            const past = prepEnd(p) < now;
            return html`<li key=${p.id}>
              <a class="list-item ${past ? "past" : ""}" href=${`#/prep/${p.id}`}>
                <span class="item-text">
                  <span class="item-name">${prepTitle(p)}</span>
                  <span class="item-sub">${p.days} días · ${meals}/${slots} comidas planificadas</span>
                </span>
                ${icon("right", 18)}
              </a>
            </li>`;
          })}
        </ul>`
      : html`<${EmptyState} title="Aún no hay preparaciones">
          <button class="primary" onClick=${() => setCreating(true)}>Crear la primera</button>
        </${EmptyState}>`}
    ${creating ? html`<${NewPrepSheet} onClose=${() => setCreating(false)} />` : null}
  </div>`;
}

function NewPrepSheet({ onClose }) {
  const [startDate, setStart] = useState(today());
  const [days, setDays] = useState(4);
  const [usePrepDay, setUsePrepDay] = useState(false);
  const [prepDate, setPrepDate] = useState(today());
  const [name, setName] = useState("");
  const submit = (e) => {
    e.preventDefault();
    let id = null;
    if (run((s) => (id = createPrep(s, { name, startDate, days, prepDate: usePrepDay ? prepDate : null }).id))) {
      onClose();
      navigate(`/prep/${id}`);
    }
  };
  return html`<${Sheet} title="Nueva preparación" onClose=${onClose}>
    <form class="form" onSubmit=${submit}>
      <label>Primer día<input type="date" required value=${startDate} onInput=${(e) => setStart(e.target.value)} /></label>
      <div class="row-setting">
        <span>Número de días</span>
        <${Stepper} value=${days} onChange=${setDays} min=${1} max=${14} label="Días" />
      </div>
      <p class="muted small">Del ${longDate(startDate)} al ${longDate(addDays(startDate, days - 1))}.</p>
      <label class="check">
        <input type="checkbox" checked=${usePrepDay} onChange=${(e) => setUsePrepDay(e.target.checked)} />
        Cocino todo en un día concreto
      </label>
      ${usePrepDay
        ? html`<label>Día de cocinar<input type="date" value=${prepDate} max=${startDate} onInput=${(e) => setPrepDate(e.target.value)} /></label>`
        : null}
      <label>Nombre (opcional)<input type="text" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Semana de exámenes" /></label>
      <button class="primary" type="submit">Crear</button>
    </form>
  </${Sheet}>`;
}

// ----------------------------------------------------------------- detail

export function PrepDetailPage({ state, id, tab = "plan" }) {
  const prep = state.prepSessions.find((p) => p.id === id);
  const [autofilling, setAutofilling] = useState(false);
  const [editing, setEditing] = useState(false);
  if (!prep) return html`<div class="page"><${EmptyState} title="Preparación no encontrada"><a href="#/prep">Volver</a></${EmptyState}></div>`;

  const setTab = (t) => navigate(`/prep/${id}?tab=${t}`);
  const remove = () => {
    if (!confirm(`¿Borrar la preparación «${prepTitle(prep)}»?`)) return;
    const clearMeals = confirm("¿Quitar también del calendario las comidas de estos días?\n\nAceptar: quitarlas · Cancelar: mantenerlas");
    if (run((s) => deletePrep(s, id, { clearMeals }), "Preparación borrada.")) navigate("/prep");
  };

  return html`<div class="page prep-page">
    <header class="top-bar">
      <a class="icon-btn" href="#/prep" aria-label="Volver">${icon("left")}</a>
      <h1 class="small-title">${prepTitle(prep)}</h1>
      <div class="top-actions">
        <button class="icon-btn" aria-label="Editar" onClick=${() => setEditing(true)}>${icon("edit")}</button>
        <button class="icon-btn" aria-label="Borrar" onClick=${remove}>${icon("trash")}</button>
      </div>
    </header>
    <p class="muted intro">
      ${prep.days} días, del ${longDate(prep.startDate)} al ${longDate(prepEnd(prep))}${prep.prepDate ? ` · se cocina el ${longDate(prep.prepDate)}` : ""}.
    </p>

    <div class="segmented" role="tablist">
      ${[["plan", "Plan"], ["cocinar", "Cocinar"], ["compra", "Compra"]].map(
        ([key, label]) => html`<button key=${key} role="tab" aria-selected=${tab === key} class=${tab === key ? "active" : ""} onClick=${() => setTab(key)}>${label}</button>`,
      )}
    </div>

    ${tab === "plan" ? html`<${PlanTab} state=${state} prep=${prep} onAutofill=${() => setAutofilling(true)} />` : null}
    ${tab === "cocinar" ? html`<${CookTab} state=${state} prep=${prep} />` : null}
    ${tab === "compra" ? html`<${ShoppingTab} state=${state} prep=${prep} />` : null}

    ${autofilling ? html`<${AutofillSheet} state=${state} prep=${prep} onClose=${() => setAutofilling(false)} />` : null}
    ${editing ? html`<${EditPrepSheet} prep=${prep} onClose=${() => setEditing(false)} />` : null}
  </div>`;
}

function PlanTab({ state, prep, onAutofill }) {
  const days = calendar(state, prep.startDate, prep.days);
  const bal = balance(state, prep.startDate, prep.days);
  const empty = days.reduce((n, d) => n + d.slots.filter((s) => s.mealType.active && !s.meals.length).length, 0);
  return html`
    ${empty
      ? html`<button class="primary block wand" onClick=${onAutofill}>${icon("wand", 18)} Autocompletar ${empty} huecos</button>`
      : null}
    <${BalanceCard} groups=${bal} state=${state} />
    ${days.map(
      (day) => html`<section key=${day.date} class="prep-day">
        <h2 class="prep-day-title">
          ${longDate(day.date)[0].toUpperCase() + longDate(day.date).slice(1)}
          ${day.nutrition.kcal ? html`<span class="kcal">${Math.round(day.nutrition.kcal)} kcal</span>` : null}
        </h2>
        <${DaySlots} state=${state} day=${day} compact />
      </section>`,
    )}
  `;
}

function BalanceCard({ groups, state }) {
  const relevant = groups.filter((g) => g.status !== "no_target" || g.meals);
  if (!relevant.some((g) => g.meals)) return null;
  const label = { below: "faltan", ok: "bien", above: "de más", no_target: "" };
  return html`<section class="card pad balance">
    <h2>Equilibrio</h2>
    <p class="muted small">Comidas por grupo frente a la frecuencia recomendada para estos días.</p>
    ${relevant.map((g) => {
      const max = Math.max(g.targetMax ?? 0, g.meals, 1);
      return html`<div key=${g.groupName} class="balance-row ${g.status}">
        <span class="balance-name">${g.groupName}</span>
        <span class="balance-bar">
          <span class="fill" style=${{ width: `${(g.meals / max) * 100}%`, background: colorForGroupId(state, g.groupId) }}></span>
          ${g.targetMin != null
            ? html`<span class="target" style=${{ left: `${(g.targetMin / max) * 100}%`, width: `${(((g.targetMax ?? g.targetMin) - g.targetMin) / max) * 100}%` }}></span>`
            : null}
        </span>
        <span class="balance-num">${g.meals}${g.targetMin != null ? html`<small> / ${formatNumber(g.targetMin)}–${formatNumber(g.targetMax)}</small>` : null}</span>
        <span class="balance-status">${label[g.status]}</span>
      </div>`;
    })}
  </section>`;
}

function CookTab({ state, prep }) {
  const [start, end] = prepRange(prep);
  const batches = batchesCookedBetween(state, start, end).map((b) => batchView(state, b, b.cookDate));
  if (!batches.length) return html`<${EmptyState} title="Nada que cocinar todavía">Añade comidas en la pestaña Plan.</${EmptyState}>`;
  const byDay = new Map();
  for (const b of batches) {
    if (!byDay.has(b.cookDate)) byDay.set(b.cookDate, []);
    byDay.get(b.cookDate).push(b);
  }
  const totalMinutes = batches.reduce((n, b) => n + (b.recipe.timeMinutes ?? 0), 0);
  return html`
    <p class="muted intro">${batches.length} ${batches.length === 1 ? "receta" : "recetas"} · unos ${totalMinutes} min de cocina en total.</p>
    ${[...byDay.entries()].map(
      ([date, list]) => html`<section key=${date}>
        <h3 class="list-title">${longDate(date)}</h3>
        <ul class="list card">
          ${list.map((b) => {
            const type = state.mealTypes.find((t) => t.id === b.cookMealTypeId);
            return html`<li key=${b.id}>
              <a class="list-item" href=${`#/receta/${b.recipe.id}`}>
                <span class="meal-bar" style=${{ background: colorForGroupId(state, b.recipe.groupId) }}></span>
                <span class="item-text">
                  <span class="item-name">${b.recipe.name}${b.scale !== 1 ? ` ×${b.scale}` : ""}</span>
                  <span class="item-sub">
                    ${[`${b.totalServings} raciones`, b.recipe.timeMinutes ? `${b.recipe.timeMinutes} min` : null, type ? `para la ${type.name.toLowerCase()}` : "día de cocinar",
                      b.recipe.status === "unknown" ? "receta por completar" : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                ${icon("right", 18)}
              </a>
            </li>`;
          })}
        </ul>
      </section>`,
    )}
  `;
}

function ShoppingTab({ state, prep }) {
  const [start, end] = prepRange(prep);
  const list = buildShoppingList(state, start, end, prep.checks);
  const toBuy = list.items.filter((i) => !i.inPantry && !i.checked && !(i.toTaste && !i.amounts.length));
  const rest = list.items.filter((i) => !toBuy.includes(i));
  const share = async () => {
    const text = shoppingListText(list, `Compra · ${prepTitle(prep)}`);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Lista copiada.");
      }
    } catch (e) {
      if (e?.name !== "AbortError") toast("No se pudo compartir.", "error");
    }
  };
  const item = (i) => html`<li key=${i.key}>
    <label class="shop-item ${i.checked ? "checked" : ""}">
      <input type="checkbox" checked=${i.checked} onChange=${(e) => run((s) => toggleCheck(s, prep.id, i.key, e.target.checked))} />
      <span class="item-text">
        <span class="item-name">
          ${i.name}${i.swedishName ? html` <span class="sv">${i.swedishName}</span>` : null}
          ${i.optional ? html` <span class="badge muted">opcional</span>` : null}
        </span>
        <span class="item-sub">${i.recipes.join(" · ")}</span>
      </span>
      <span class="amount">${i.amounts.length ? i.amounts.map(formatAmount).join(" + ") : "al gusto"}</span>
    </label>
  </li>`;

  if (!list.items.length && !list.unknownRecipes.length) {
    return html`<${EmptyState} title="La lista está vacía">Añade comidas en la pestaña Plan.</${EmptyState}>`;
  }
  return html`
    ${list.unknownRecipes.length
      ? html`<p class="alert">${icon("warning", 18)} Sin ingredientes todavía: ${list.unknownRecipes.map((r) => r.name).join(", ")}.</p>`
      : null}
    <div class="row-setting">
      <span class="muted">${toBuy.length} por comprar</span>
      <button class="text-btn" onClick=${share}>${icon("share", 18)} Compartir</button>
    </div>
    <ul class="list card">${toBuy.map(item)}</ul>
    ${rest.length
      ? html`<h3 class="list-title">En casa, al gusto o ya cogido</h3>
          <ul class="list card faded">${rest.map(item)}</ul>`
      : null}
    <p class="muted small pad">Las sobras no suman ingredientes: cada receta se cuenta una vez por cada vez que se cocina.</p>
  `;
}

function AutofillSheet({ state, prep, onClose }) {
  const types = sortedMealTypes(state);
  const groups = sortedGroups(state);
  const [typeIds, setTypeIds] = useState(types.map((t) => t.id));
  const [groupIds, setGroupIds] = useState([]);
  const [people, setPeople] = useState(1);
  const [cookOnPrepDay, setCookOnPrepDay] = useState(!!prep.prepDate);
  const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const go = () => {
    let created = 0;
    const ok = run((s) => {
      created = autofill(s, getPrep(s, prep.id), {
        mealTypeIds: typeIds,
        groupIds,
        servingsPerMeal: people,
        cookOnPrepDay,
      }).created.length;
    });
    if (ok) {
      toast(created ? `${created} comidas añadidas.` : "No había huecos que rellenar.");
      onClose();
    }
  };
  return html`<${Sheet} title="Autocompletar" onClose=${onClose}>
    <p class="muted">
      Rellena los huecos vacíos: primero con raciones sobrantes y después con recetas que equilibran los grupos.
      Puedes cambiar cualquier comida después.
    </p>
    <h3 class="list-title">Comidas</h3>
    <div class="chips">
      ${types.map((t) => html`<button key=${t.id} class="chip ${typeIds.includes(t.id) ? "active" : ""}" onClick=${() => toggle(typeIds, setTypeIds, t.id)}>${t.name}</button>`)}
    </div>
    <h3 class="list-title">Solo estos grupos <small class="muted">(ninguno = todos)</small></h3>
    <div class="chips">
      ${groups.map((g) => html`<button key=${g.id} class="chip ${groupIds.includes(g.id) ? "active" : ""}" onClick=${() => toggle(groupIds, setGroupIds, g.id)}>${g.name}</button>`)}
    </div>
    <div class="row-setting">
      <span>Personas por comida</span>
      <${Stepper} value=${people} onChange=${setPeople} min=${1} max=${12} label="Personas" />
    </div>
    ${prep.prepDate
      ? html`<label class="check">
          <input type="checkbox" checked=${cookOnPrepDay} onChange=${(e) => setCookOnPrepDay(e.target.checked)} />
          Cocinarlo todo el ${longDate(prep.prepDate)} (si aguanta en la nevera)
        </label>`
      : null}
    <button class="primary block" disabled=${!typeIds.length} onClick=${go}>${icon("wand", 18)} Autocompletar</button>
  </${Sheet}>`;
}

function EditPrepSheet({ prep, onClose }) {
  const [startDate, setStart] = useState(prep.startDate);
  const [days, setDays] = useState(prep.days);
  const [prepDate, setPrepDate] = useState(prep.prepDate ?? "");
  const [name, setName] = useState(prep.name ?? "");
  const save = (e) => {
    e.preventDefault();
    if (run((s) => updatePrep(s, prep.id, { startDate, days, prepDate: prepDate || null, name: name.trim() || null }), "Guardado.")) onClose();
  };
  return html`<${Sheet} title="Editar preparación" onClose=${onClose}>
    <form class="form" onSubmit=${save}>
      <label>Nombre<input type="text" value=${name} onInput=${(e) => setName(e.target.value)} /></label>
      <label>Primer día<input type="date" required value=${startDate} onInput=${(e) => setStart(e.target.value)} /></label>
      <div class="row-setting">
        <span>Número de días</span>
        <${Stepper} value=${days} onChange=${setDays} min=${1} max=${14} label="Días" />
      </div>
      <label>Día de cocinar (opcional)<input type="date" value=${prepDate} onInput=${(e) => setPrepDate(e.target.value)} /></label>
      <button class="primary" type="submit">Guardar</button>
    </form>
  </${Sheet}>`;
}

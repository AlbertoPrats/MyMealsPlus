// Asistente tab: talk to the AI about a recipe (adapt it, scale it, make it
// lighter...), ask what to eat next, or ask for new ideas based on what you
// like. Every proposal is shown first and only saved when you press a button.

import {
  assistantTask,
  describeChanges,
  ideasTask,
  parseAssistantReply,
  parseIdeasReply,
  parseSuggestReply,
  suggestTask,
} from "../core/ai-recipes.js";
import { shortDate, startOfWeek, today, weekdayName } from "../core/dates.js";
import { addMeal, balance, getMealType, saveRecipe } from "../core/planner.js";
import { nextOpenSlot, suggestionContext, tasteProfile } from "../core/suggest.js";
import { html, useEffect, useRef, useState } from "../../vendor/preact-htm.js";
import { AiStatusLine, AiTask } from "./ai-task.js";
import { EmptyState, colorForGroupId, icon, run } from "./common.js";
import { RecipePreview } from "./recipe-preview.js";

const SS_KEY = "mymealsplus-chat";
const RECIPE_CHIPS = ["Hazla vegetariana", "Para 2 raciones", "Menos calorías", "Más proteína", "Más rápida", "Sin gluten"];
const FREE_CHIPS = ["Una cena ligera con lo que suele haber en casa", "Un táper para llevar al trabajo"];

function loadChat() {
  try {
    return JSON.parse(sessionStorage.getItem(SS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveChat(chat) {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify(chat.slice(-30)));
  } catch {}
}

const slotText = (state, slot) => `${getMealType(state, slot.mealTypeId).name.toLowerCase()} del ${weekdayName(slot.date)} ${shortDate(slot.date)}`;

export function AssistantPage({ state, params }) {
  const initialRecipe = Number(params.get("receta")) || null;
  const [recipeId, setRecipeId] = useState(state.recipes.some((r) => r.id === initialRecipe) ? initialRecipe : null);
  const [chat, setChatRaw] = useState(loadChat);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(null); // {task, parse, onResult}
  const endRef = useRef(null);
  const setChat = (c) => {
    setChatRaw(c);
    saveChat(c);
  };
  const append = (msg) => setChat([...loadChat(), msg]);
  useEffect(() => endRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" }), [chat.length, running]);

  const recipe = state.recipes.find((r) => r.id === recipeId) ?? null;
  const sorted = [...state.recipes].sort((a, b) => a.name.localeCompare(b.name, "es"));

  const send = (message) => {
    const msg = message.trim();
    if (!msg || running) return;
    const history = chat.filter((m) => m.text).map((m) => ({ role: m.role, text: m.text }));
    setChat([...chat, { role: "user", text: msg }]);
    setText("");
    const targetId = recipeId;
    setRunning({
      task: assistantTask(state, { recipe, history, message: msg }),
      parse: (raw) => parseAssistantReply(raw, state.groups),
      onResult: (r) =>
        append({ role: "assistant", text: r.reply, proposal: r.recipe ? { input: r.recipe, mode: r.mode, recipeId: targetId } : null }),
    });
  };

  const askIdeas = () => {
    if (running) return;
    setChat([...chat, { role: "user", text: "Ideas de recetas nuevas para mí" }]);
    setRunning({
      task: ideasTask(state, tasteProfile(state), { balance: balance(state, startOfWeek(today()), 7) }),
      parse: (raw) => parseIdeasReply(raw, state.groups),
      onResult: (ideas) => append({ role: "assistant", text: `Aquí tienes ${ideas.length} ideas:`, ideas: ideas.map((input) => ({ input })) }),
    });
  };

  const askWhatToEat = () => {
    if (running) return;
    const slot = nextOpenSlot(state, today());
    const ctx = suggestionContext(state, today(), slot);
    setChat([...chat, { role: "user", text: `¿Qué como en la ${slotText(state, slot)}?` }]);
    setRunning({
      task: suggestTask(state, ctx),
      parse: (raw) => parseSuggestReply(raw, ctx.candidates),
      onResult: (picks) =>
        append({ role: "assistant", text: `Para la ${slotText(state, slot)}:`, picks: picks.map((p) => ({ recipeId: p.recipe.id, reason: p.reason })), slot }),
    });
  };

  const markDone = (index, key, value) => {
    const next = loadChat();
    next[index] = { ...next[index], [key]: value };
    setChat(next);
  };

  return html`<div class="page assistant-page">
    <header class="top-bar"><h1>Asistente</h1></header>
    <${AiStatusLine} state=${state} />

    <label class="recipe-context">Receta
      <select value=${recipeId ?? ""} onChange=${(e) => setRecipeId(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Ninguna · pregunta general o receta nueva</option>
        ${sorted.map((r) => html`<option key=${r.id} value=${r.id}>${r.name}</option>`)}
      </select>
    </label>

    <div class="chips">
      ${(recipe ? RECIPE_CHIPS : FREE_CHIPS).map(
        (c) => html`<button key=${c} class="chip" disabled=${!!running} onClick=${() => send(c)}>${c}</button>`,
      )}
      <button class="chip active" disabled=${!!running} onClick=${askWhatToEat}>${icon("sparkle", 14)} ¿Qué como?</button>
      <button class="chip active" disabled=${!!running} onClick=${askIdeas}>${icon("sparkle", 14)} Ideas para mí</button>
    </div>

    <section class="chat" aria-live="polite">
      ${!chat.length
        ? html`<${EmptyState} title="¿En qué te ayudo?">
            Elige una receta y pide cambios («hazla para 6», «sin lactosa»…), pregunta qué comer o pide ideas nuevas
            según lo que más te gusta.
          </${EmptyState}>`
        : null}
      ${chat.map((m, i) => html`<div key=${i} class="bubble ${m.role}">
        <p>${m.text}</p>
        ${m.proposal ? html`<${Proposal} state=${state} proposal=${m.proposal} done=${m.done} onDone=${(v) => markDone(i, "done", v)} />` : null}
        ${m.ideas
          ? m.ideas.map((idea, j) => html`<${Idea} key=${j} state=${state} input=${idea.input} saved=${m.saved?.includes(j)}
              onSaved=${() => markDone(i, "saved", [...(m.saved ?? []), j])} />`)
          : null}
        ${m.picks ? html`<${Picks} state=${state} picks=${m.picks} slot=${m.slot} added=${m.added} onAdded=${(id) => markDone(i, "added", id)} />` : null}
      </div>`)}
      ${running
        ? html`<div class="bubble assistant">
            <${AiTask}
              state=${state}
              task=${running.task}
              parse=${running.parse}
              onResult=${(value) => {
                running.onResult(value);
                setRunning(null);
              }}
              onCancel=${() => setRunning(null)}
            />
          </div>`
        : null}
      <div class="chat-end" ref=${endRef}></div>
    </section>

    <form class="chat-input" onSubmit=${(e) => { e.preventDefault(); send(text); }}>
      <textarea
        rows="2"
        placeholder=${recipe ? `Pide un cambio en «${recipe.name}»…` : "Escribe tu petición…"}
        value=${text}
        onInput=${(e) => setText(e.target.value)}
        aria-label="Mensaje para el asistente"
      ></textarea>
      <button class="primary" type="submit" disabled=${!text.trim() || !!running} aria-label="Enviar">${icon("send", 20)}</button>
    </form>
    ${chat.length && !running
      ? html`<button class="text-btn" onClick=${() => setChat([])}>Borrar conversación</button>`
      : null}
  </div>`;
}

function Proposal({ state, proposal, done, onDone }) {
  const target = proposal.recipeId != null ? state.recipes.find((r) => r.id === proposal.recipeId) : null;
  const update = proposal.mode === "update" && target;
  const changes = update ? describeChanges(state, target, proposal.input) : null;
  if (done) return html`<p class="muted small">${icon("check", 14)} ${done}</p>`;
  const apply = () => {
    if (run((s) => saveRecipe(s, proposal.input, target.id), `«${proposal.input.name}» actualizada.`)) onDone(`Aplicado a «${target.name}»`);
  };
  const saveNew = () => {
    if (run((s) => saveRecipe(s, proposal.input), `«${proposal.input.name}» guardada.`)) onDone("Guardada como receta nueva");
  };
  return html`<div class="proposal">
    <${RecipePreview} state=${state} input=${proposal.input} changes=${changes} />
    <div class="button-row">
      ${update ? html`<button class="primary" onClick=${apply}>Aplicar a «${target.name}»</button>` : null}
      <button class=${update ? "secondary" : "primary"} onClick=${saveNew}>Guardar como nueva</button>
    </div>
  </div>`;
}

function Idea({ state, input, saved, onSaved }) {
  const exists = state.recipes.some((r) => r.name.toLowerCase() === input.name.toLowerCase());
  return html`<div class="proposal">
    <${RecipePreview} state=${state} input=${input} changes=${[]} />
    ${saved || exists
      ? html`<p class="muted small">${icon("check", 14)} Guardada</p>`
      : html`<button class="secondary block" onClick=${() => run((s) => saveRecipe(s, input), `«${input.name}» guardada en Recetas.`) && onSaved()}>
          Guardar receta
        </button>`}
  </div>`;
}

function Picks({ state, picks, slot, added, onAdded }) {
  return html`<ul class="list picks">
    ${picks.map(({ recipeId, reason }) => {
      const r = state.recipes.find((x) => x.id === recipeId);
      if (!r) return null;
      return html`<li key=${recipeId} class="pick">
        <span class="meal-bar" style=${{ background: colorForGroupId(state, r.groupId) }}></span>
        <span class="item-text">
          <span class="item-name">${r.name}</span>
          <span class="item-sub">${reason}</span>
        </span>
        ${added === recipeId
          ? html`<span class="badge muted">${icon("check", 12)} Añadida</span>`
          : html`<button class="secondary small-btn" disabled=${added != null}
              onClick=${() => run((s) => addMeal(s, { ...slot, recipeId }), `«${r.name}» añadida.`) && onAdded(recipeId)}>Añadir</button>`}
      </li>`;
    })}
  </ul>`;
}

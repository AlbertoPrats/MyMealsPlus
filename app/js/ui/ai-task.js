// Runs one AI task on the configured free service: sends the request,
// validates the reply with `parse`, and if the reply can't be used asks the
// model once to correct it. Calls onResult(parsedValue) on success.

import { PROVIDERS } from "../ai/providers.js";
import { runTask } from "../ai/run.js";
import { getApiKey } from "../ai/secrets.js";
import { html, useEffect, useRef, useState } from "../../vendor/preact-htm.js";
import { icon, navigate } from "./common.js";

export function providerOf(state) {
  const id = PROVIDERS[state.ai?.provider] ? state.ai.provider : "openrouter";
  const p = PROVIDERS[id];
  return { id, p, model: state.ai?.models?.[id] || p.defaultModel };
}

function SetupNeeded({ onCancel }) {
  return html`<div class="ai-setup">
    <p>Para usar el asistente, añade una clave gratuita de OpenRouter o Groq.</p>
    <div class="button-row">
      <button class="secondary" onClick=${onCancel}>Cancelar</button>
      <button class="primary" onClick=${() => { onCancel(); navigate("/ajustes"); }}>Ir a Ajustes ▸ Asistente</button>
    </div>
  </div>`;
}

export function AiTask({ state, task, parse, onResult, onCancel }) {
  const { id, p, model } = providerOf(state);
  const [status, setStatus] = useState("checking"); // checking | setup | running | error
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => (alive.current = false), []);
  useEffect(() => {
    setError(null);
    (async () => {
      const apiKey = await getApiKey(id);
      if (!apiKey) {
        if (alive.current) setStatus("setup");
        return;
      }
      if (!alive.current) return;
      setStatus("running");
      try {
        const value = await runTask({ providerId: id, apiKey, model, task, parse });
        if (alive.current) onResult(value);
      } catch (e) {
        if (!alive.current) return;
        setError(e);
        setStatus("error");
      }
    })();
  }, [attempt]);

  if (status === "setup") return html`<${SetupNeeded} onCancel=${onCancel} />`;
  if (status === "error") {
    return html`<div>
      <p class="alert">${icon("warning", 18)} ${error.message || String(error)}</p>
      <div class="button-row">
        <button class="secondary" onClick=${onCancel}>Cancelar</button>
        ${error.setup
          ? html`<button class="primary" onClick=${() => { onCancel(); navigate("/ajustes"); }}>Revisar ajustes</button>`
          : html`<button class="primary" onClick=${() => setAttempt(attempt + 1)}>Reintentar</button>`}
      </div>
    </div>`;
  }
  return html`<div class="ai-running" role="status">
    <span class="spinner" aria-hidden="true"></span>
    <span>Pensando con ${p.name.split(" ·")[0]}…</span>
    <button class="text-btn" onClick=${onCancel}>Cancelar</button>
  </div>`;
}

export function AiStatusLine({ state }) {
  const { p, model } = providerOf(state);
  return html`<p class="muted small ai-status">
    ${icon("chat", 14)} ${p.name.split(" ·")[0]} · ${model} · <a href="#/ajustes" onClick=${(e) => { e.preventDefault(); navigate("/ajustes"); }}>cambiar</a>
  </p>`;
}

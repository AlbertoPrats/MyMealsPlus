// Ajustes ▸ Asistente: which AI service to use, its key and model.

import { PROVIDERS, PROVIDER_ORDER, complete, isAllowedModel, listModels } from "../ai/providers.js";
import { deleteApiKey, getApiKey, maskKey, setApiKey } from "../ai/secrets.js";
import { html, useEffect, useState } from "../../vendor/preact-htm.js";
import { icon, run, toast } from "./common.js";

const PING = {
  kind: "ping",
  system: "Responde únicamente con JSON.",
  user: 'Devuelve exactamente {"ok": true}',
  schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
};

export function AiSettings({ state }) {
  const providerId = PROVIDERS[state.ai?.provider] ? state.ai.provider : "openrouter";
  const p = PROVIDERS[providerId];
  const model = state.ai.models?.[providerId] || p.defaultModel;
  const [savedKey, setSavedKey] = useState(null);
  const [keyInput, setKeyInput] = useState("");
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let alive = true;
    setModels([]);
    setKeyInput("");
    getApiKey(providerId).then((k) => alive && setSavedKey(k));
    return () => (alive = false);
  }, [providerId]);

  const choose = (id) => run((s) => { s.ai.provider = id; });
  const setModel = (value) => run((s) => { s.ai.models[providerId] = value.trim(); });

  const saveKey = async (e) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    await setApiKey(providerId, keyInput);
    setSavedKey(keyInput.trim());
    setKeyInput("");
    toast("Clave guardada en este teléfono.");
  };
  const forget = async () => {
    if (!confirm(`¿Borrar la clave de ${p.name} de este teléfono?`)) return;
    await deleteApiKey(providerId);
    setSavedKey(null);
    toast("Clave borrada.");
  };
  const loadModels = async () => {
    setBusy("models");
    try {
      const list = await listModels(providerId, { apiKey: savedKey });
      setModels(list);
      toast(list.length ? `${list.length} modelos disponibles.` : "No se encontraron modelos.");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };
  const test = async () => {
    setBusy("test");
    try {
      const text = await complete(providerId, { apiKey: savedKey, model, task: PING });
      if (!/"ok"\s*:\s*true/.test(text)) throw new Error("Respondió, pero no en el formato esperado. Prueba otro modelo.");
      toast("Funciona correctamente.");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  return html`<section class="card pad ai-settings">
    <h2>Asistente</h2>
    <p class="muted small">
      El asistente crea, modifica y sugiere recetas con un modelo de IA gratuito. Elige el servicio y pega tu clave
      (gratis, sin tarjeta). Puedes cambiarlo cuando quieras.
    </p>
    <div class="provider-list" role="radiogroup" aria-label="Servicio de IA">
      ${PROVIDER_ORDER.map((id) => {
        const x = PROVIDERS[id];
        return html`<label key=${id} class="provider ${id === providerId ? "active" : ""}">
          <input type="radio" name="provider" checked=${id === providerId} onChange=${() => choose(id)} />
          <span class="item-text">
            <span class="item-name">${x.name}</span>
            <span class="item-sub">${x.cost}</span>
          </span>
        </label>`;
      })}
    </div>
    <p class="muted small">${p.info}</p>

    ${p.privacyUrl
      ? html`<p class="muted small">
          Si al probar aparece un aviso sobre la política de datos, activa los modelos gratuitos en
          <a href=${p.privacyUrl} target="_blank" rel="noopener noreferrer">ajustes de privacidad de OpenRouter ↗</a>.
        </p>`
      : null}
          <div class="row-setting">
            <span>Clave ${savedKey ? html`<code>${maskKey(savedKey)}</code>` : html`<span class="muted">sin guardar</span>`}</span>
            ${savedKey ? html`<button class="text-btn danger-text" onClick=${forget}>Borrar</button>` : null}
          </div>
          <form class="inline-form" onSubmit=${saveKey}>
            <input
              type="password"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder=${savedKey ? "Sustituir la clave…" : "Pega aquí tu clave"}
              value=${keyInput}
              onInput=${(e) => setKeyInput(e.target.value)}
              aria-label="Clave de la API"
            />
            <button class="secondary" type="submit" disabled=${!keyInput.trim()}>Guardar</button>
          </form>
          <a class="small" href=${p.keyUrl} target="_blank" rel="noopener noreferrer">Conseguir una clave ↗</a>

          <label class="model-field">Modelo
            <input type="text" list="model-options" value=${model} onChange=${(e) => setModel(e.target.value)} placeholder="nombre del modelo" />
            <datalist id="model-options">${models.map((m) => html`<option key=${m} value=${m} />`)}</datalist>
          </label>
          ${model && !isAllowedModel(providerId, model)
            ? html`<p class="alert">${icon("warning", 18)} Solo se permiten modelos gratuitos: «openrouter/free» o nombres acabados en «:free».</p>`
            : null}
          <div class="button-row">
            <button class="secondary" disabled=${!savedKey || busy} onClick=${loadModels}>${busy === "models" ? "Cargando…" : "Cargar modelos"}</button>
            <button class="secondary" disabled=${!savedKey || !model || busy} onClick=${test}>${busy === "test" ? "Probando…" : "Probar"}</button>
          </div>

    <details class="security-notes">
      <summary>${icon("lock", 14)} Privacidad y seguridad</summary>
      <ul>
        <li>Las claves se guardan solo en este teléfono, aparte de tus datos. No se incluyen en las copias de seguridad ni salen del teléfono salvo hacia el servicio al que pertenecen.</li>
        <li>Al servicio solo se envía lo necesario para cada petición: tu descripción o mensaje, la receta en la que trabajas, los nombres de los grupos y, para sugerencias e ideas, los nombres de algunas recetas tuyas, cuántas veces las has comido y lo planificado esta semana.</li>
        <li>Solo hay opciones gratuitas: no añadas tarjeta ni créditos a tus cuentas de OpenRouter o Groq y nunca podrán cobrarte. Además, la app solo usa modelos gratuitos de OpenRouter.</li>
        <li>No escribas datos personales en las peticiones: los servicios gratuitos pueden guardarlas.</li>
        <li>La app solo puede conectarse a los servicios de esta lista; cualquier otra conexión está bloqueada.</li>
      </ul>
    </details>
  </section>`;
}

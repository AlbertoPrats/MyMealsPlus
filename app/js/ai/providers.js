// AI providers: only free options with no card, no trial and no renewal.
// - OpenRouter, restricted by the app to its free models.
// - Groq's free plan.
// Keys are the user's own, stored only on the device (secrets.js).

export const PROVIDERS = {
  openrouter: {
    id: "openrouter",
    name: "OpenRouter · solo modelos gratis",
    cost: "Gratis · 50 peticiones al día",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/free",
    keyUrl: "https://openrouter.ai/settings/keys",
    privacyUrl: "https://openrouter.ai/settings/privacy",
    info:
      "La app solo permite modelos gratuitos («openrouter/free» o nombres que acaban en «:free»), así que nunca " +
      "gasta saldo. No añadas tarjeta ni créditos a la cuenta. Los proveedores de modelos gratuitos pueden guardar tus peticiones.",
  },
  groq: {
    id: "groq",
    name: "Groq · plan gratuito",
    cost: "Gratis con límites diarios",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    keyUrl: "https://console.groq.com/keys",
    info:
      "Plan gratuito con límites por minuto y por día (los ves en tu cuenta de Groq). Sin tarjeta no se te puede " +
      "cobrar: no pases al plan «Developer».",
  },
};

export const PROVIDER_ORDER = ["openrouter", "groq"];
export const DEFAULT_PROVIDER = "openrouter";

export class AiError extends Error {
  constructor(message, { retryable = false, setup = false } = {}) {
    super(message);
    this.retryable = retryable;
    this.setup = setup; // fixable in Ajustes ▸ Asistente
  }
}

/** OpenRouter models the app accepts: only free ones, so nothing can be charged. */
export function isAllowedModel(providerId, model) {
  if (providerId === "openrouter") return model === "openrouter/free" || /^[\w.-]+\/[\w.:-]+:free$/.test(model);
  return typeof model === "string" && model.trim().length > 0;
}

const TIMEOUT_MS = 120_000;

async function withTimeout(fetchImpl, url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e?.name === "AbortError") throw new AiError("El asistente tardó demasiado en responder.", { retryable: true });
    throw new AiError("No hay conexión con el servicio. Comprueba internet.", { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

function httpError(p, status, detail) {
  const text = detail ? String(detail).slice(0, 200) : "";
  const d = text ? ` (${text})` : "";
  if (p.id === "openrouter" && /data policy/i.test(text)) {
    return new AiError(
      "OpenRouter no tiene permiso para usar modelos gratuitos con tu cuenta. En openrouter.ai/settings/privacy activa " +
        "la opción que permite los modelos gratuitos (pueden guardar o entrenar con tus peticiones) y vuelve a probar.",
      { setup: true },
    );
  }
  if (status === 401 || status === 403) return new AiError(`La clave no es válida o no tiene permiso${d}.`, { setup: true });
  if (status === 402) return new AiError(`El servicio pide saldo; la app solo usa modelos gratis, prueba otro modelo gratuito${d}.`, { setup: true });
  if (status === 404) return new AiError(`Modelo no encontrado: revisa el nombre del modelo${d}.`, { setup: true });
  if (status === 429) return new AiError(`Límite gratuito alcanzado; espera un poco o prueba mañana${d}.`, { retryable: true });
  if (status >= 500) return new AiError(`El servicio falló (${status}); prueba otra vez.`, { retryable: true });
  return new AiError(`Error ${status}${d}.`);
}

async function readError(res) {
  try {
    const data = await res.json();
    return data?.error?.message ?? data?.message ?? data?.error ?? null;
  } catch {
    return null;
  }
}

/**
 * Run one task ({system, user, schema}) and return the reply text.
 * `followUp` adds turns after the first exchange (used to ask the model to
 * fix a reply that wasn't valid JSON). Both providers use the same format.
 */
export async function complete(providerId, { apiKey, model, task, followUp = [], fetchImpl = globalThis.fetch?.bind(globalThis) }) {
  const p = PROVIDERS[providerId];
  if (!p) throw new AiError("Elige un servicio en Ajustes ▸ Asistente.", { setup: true });
  if (!apiKey) throw new AiError("Falta la clave del servicio: añádela en Ajustes ▸ Asistente.", { setup: true });
  if (!isAllowedModel(providerId, model)) {
    throw new AiError(
      providerId === "openrouter"
        ? "Solo se permiten modelos gratuitos de OpenRouter («openrouter/free» o acabados en «:free»)."
        : "Falta elegir un modelo en Ajustes ▸ Asistente.",
      { setup: true },
    );
  }
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
  if (p.id === "openrouter") headers["X-Title"] = "MyMeals+";
  const body = {
    model,
    messages: [
      { role: "system", content: task.system },
      { role: "user", content: task.user },
      ...followUp,
    ],
  };
  // Ask for JSON output where the model supports it; the prompt asks for JSON too.
  if (task.schema) body.response_format = { type: "json_object" };
  const url = `${p.baseUrl}/chat/completions`;
  let res = await withTimeout(fetchImpl, url, { method: "POST", headers, body: JSON.stringify(body) });
  if ((res.status === 400 || res.status === 404) && body.response_format) {
    const detail = await readError(res);
    if (/data policy/i.test(String(detail))) throw httpError(p, res.status, detail);
    // That model doesn't support JSON mode (or no free endpoint does): plain text is fine.
    delete body.response_format;
    res = await withTimeout(fetchImpl, url, { method: "POST", headers, body: JSON.stringify(body) });
  }
  if (!res.ok) throw httpError(p, res.status, await readError(res));
  const data = await res.json();
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === "length") throw new AiError("La respuesta salió cortada; prueba otra vez.", { retryable: true });
  const text = choice?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AiError("El modelo no devolvió texto.", { retryable: true });
  return text;
}

/** Models the user can pick (for OpenRouter, only the free ones). */
export async function listModels(providerId, { apiKey, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
  const p = PROVIDERS[providerId];
  if (!p) return [];
  const res = await withTimeout(fetchImpl, `${p.baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw httpError(p, res.status, await readError(res));
  const ids = ((await res.json())?.data ?? []).map((m) => m.id).filter((x) => typeof x === "string");
  return providerId === "openrouter"
    ? ["openrouter/free", ...ids.filter((id) => isAllowedModel("openrouter", id) && id !== "openrouter/free").sort()]
    : ids.filter((id) => !/whisper|orpheus|guard|tts/i.test(id)).sort(); // chat models only
}

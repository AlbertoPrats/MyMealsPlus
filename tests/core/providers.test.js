// Provider requests, checked against a fake network (no real calls).

import assert from "node:assert/strict";
import { test } from "node:test";

import { RECIPE_SCHEMA } from "../../app/js/core/ai-recipes.js";
import { AiError, PROVIDERS, PROVIDER_ORDER, complete, isAllowedModel, listModels } from "../../app/js/ai/providers.js";

const TASK = { kind: "recipe", system: "SYS", user: "USER", schema: RECIPE_SCHEMA };

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body) : null });
    const next = responses.shift();
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "content-type": "application/json" } });
  };
  fn.calls = calls;
  return fn;
}

test("only the two free services are offered", () => {
  assert.deepEqual(PROVIDER_ORDER, ["openrouter", "groq"]);
  assert.deepEqual(Object.keys(PROVIDERS).sort(), ["groq", "openrouter"]);
});

test("OpenRouter: free model, JSON mode, bearer key", async () => {
  const f = fakeFetch([{ body: { choices: [{ message: { content: '{"name":"x"}' } }] } }]);
  const text = await complete("openrouter", { apiKey: "sk-or-1", model: PROVIDERS.openrouter.defaultModel, task: TASK, fetchImpl: f });
  assert.equal(text, '{"name":"x"}');
  const [c] = f.calls;
  assert.equal(c.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(c.headers.get("authorization"), "Bearer sk-or-1");
  assert.equal(c.body.model, "openrouter/free");
  assert.deepEqual(c.body.response_format, { type: "json_object" });
  assert.deepEqual(c.body.messages, [{ role: "system", content: "SYS" }, { role: "user", content: "USER" }]);
});

test("OpenRouter: paid models are refused before any request", async () => {
  assert.ok(isAllowedModel("openrouter", "openrouter/free"));
  assert.ok(isAllowedModel("openrouter", "meta-llama/llama-3.3-70b-instruct:free"));
  for (const paid of ["openai/gpt-5", "anthropic/claude-opus-5-5", "x/y:free:extended", "x/y :free", ":free", "openrouter/auto", ""]) {
    assert.ok(!isAllowedModel("openrouter", paid), paid);
  }
  const f = fakeFetch([]);
  await assert.rejects(complete("openrouter", { apiKey: "k", model: "openai/gpt-5", task: TASK, fetchImpl: f }), /Solo se permiten modelos gratuitos/);
  assert.equal(f.calls.length, 0);
});

test("OpenRouter: falls back to plain text when no free endpoint supports JSON mode (404)", async () => {
  const f = fakeFetch([
    { status: 404, body: { error: { message: "No endpoints found that support the requested parameters" } } },
    { body: { choices: [{ message: { content: "{}" } }] } },
  ]);
  await complete("openrouter", { apiKey: "k", model: "openrouter/free", task: TASK, fetchImpl: f });
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].body.response_format, undefined);
});

test("Groq: free plan endpoint; retries without JSON mode on 400", async () => {
  const f = fakeFetch([
    { status: 400, body: { error: { message: "response_format not supported" } } },
    { body: { choices: [{ message: { content: "{}" } }] } },
  ]);
  await complete("groq", { apiKey: "gsk_1", model: PROVIDERS.groq.defaultModel, task: TASK, fetchImpl: f });
  assert.equal(f.calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(f.calls[0].body.model, "openai/gpt-oss-120b");
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].body.response_format, undefined);
});

test("errors become clear messages", async () => {
  const unauthorized = fakeFetch([{ status: 401, body: { error: { message: "bad key" } } }]);
  await assert.rejects(complete("groq", { apiKey: "k", model: "m", task: TASK, fetchImpl: unauthorized }), /clave no es válida/);
  const limited = fakeFetch([{ status: 429, body: {} }]);
  await assert.rejects(
    complete("openrouter", { apiKey: "k", model: "openrouter/free", task: TASK, fetchImpl: limited }),
    (e) => e instanceof AiError && e.retryable && /Límite gratuito/.test(e.message),
  );
  const payment = fakeFetch([{ status: 402, body: { error: { message: "Insufficient credits" } } }]);
  await assert.rejects(complete("openrouter", { apiKey: "k", model: "openrouter/free", task: TASK, fetchImpl: payment }), /solo usa modelos gratis/);
  const policy = fakeFetch([{ status: 404, body: { error: { message: "No endpoints found matching your data policy (Free model publication)" } } }]);
  await assert.rejects(
    complete("openrouter", { apiKey: "k", model: "openrouter/free", task: TASK, fetchImpl: policy }),
    (e) => e.setup && /settings\/privacy/.test(e.message),
  );
  const cut = fakeFetch([{ body: { choices: [{ finish_reason: "length", message: { content: '{"name": "x", "ingr' } }] } }]);
  await assert.rejects(complete("groq", { apiKey: "k", model: "m", task: TASK, fetchImpl: cut }), /cortada/);
});

test("model lists: OpenRouter shows only free models, Groq only chat models", async () => {
  const f = fakeFetch([{ body: { data: [{ id: "a/b" }, { id: "x/y:free" }, { id: "openrouter/free" }] } }]);
  assert.deepEqual(await listModels("openrouter", { apiKey: "k", fetchImpl: f }), ["openrouter/free", "x/y:free"]);
  const g = fakeFetch([{ body: { data: [{ id: "whisper-large-v3" }, { id: "openai/gpt-oss-120b" }, { id: "qwen/qwen3.8-27b" }] } }]);
  assert.deepEqual(await listModels("groq", { apiKey: "k", fetchImpl: g }), ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
});

test("a missing key or unknown service never sends a request", async () => {
  const f = fakeFetch([]);
  await assert.rejects(complete("openrouter", { apiKey: "", model: "openrouter/free", task: TASK, fetchImpl: f }), /Falta la clave/);
  await assert.rejects(complete("groq", { apiKey: "k", model: "", task: TASK, fetchImpl: f }), /Falta elegir un modelo/);
  await assert.rejects(complete("manual", { apiKey: "k", model: "m", task: TASK, fetchImpl: f }), /Elige un servicio/);
  await assert.rejects(complete("anthropic", { apiKey: "k", model: "m", task: TASK, fetchImpl: f }), /Elige un servicio/);
  assert.equal(f.calls.length, 0);
});

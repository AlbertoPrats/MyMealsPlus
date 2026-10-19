// API keys, kept only on this device in their own IndexedDB store. They are
// never put in the app state, never included in backups, never logged, and
// only ever sent to the provider they belong to.

import { SECRETS_STORE, store } from "../store.js";

const memory = new Map(); // fallback when IndexedDB isn't available

function tx(mode, fn) {
  return new Promise((resolve, reject) => {
    const t = store.db.transaction(SECRETS_STORE, mode);
    const req = fn(t.objectStore(SECRETS_STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

const keyName = (providerId) => `apiKey:${providerId}`;

export async function getApiKey(providerId) {
  if (!store.db) return memory.get(keyName(providerId)) ?? null;
  return (await tx("readonly", (s) => s.get(keyName(providerId)))) ?? null;
}

export async function setApiKey(providerId, value) {
  const clean = value.trim();
  if (!store.db) {
    memory.set(keyName(providerId), clean);
    return;
  }
  await tx("readwrite", (s) => s.put(clean, keyName(providerId)));
}

export async function deleteApiKey(providerId) {
  memory.delete(keyName(providerId));
  if (store.db) await tx("readwrite", (s) => s.delete(keyName(providerId)));
}

export async function hasApiKey(providerId) {
  return !!(await getApiKey(providerId));
}

/** "sk-or-v1-…a1b2": enough to recognise a key without showing it. */
export function maskKey(key) {
  if (!key) return "";
  return key.length <= 8 ? "••••" : `${key.slice(0, 6)}…${key.slice(-4)}`;
}

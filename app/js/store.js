// Keeps the app state in memory and saves it on the phone (IndexedDB, with a
// localStorage fallback). Every change runs on a copy: if it throws, nothing
// is saved and the error message is shown to the user.
//
// MyMeals+ uses its own database name ("mymealsplus"), so it never touches the
// data of the original MyMeals app, even when both are served from the same
// website. API keys live in a separate "secrets" store (see secrets.js) and
// are never part of the state or of backups.

import { today } from "./core/dates.js";
import { syncHistory } from "./core/history.js";
import { applyChange, createState, mergeSeed, migrateState, validateBackup } from "./core/state.js";

const DB_NAME = "mymealsplus";
const STORE = "kv";
export const SECRETS_STORE = "secrets";
const KEY = "state";
const LS_KEY = "mymealsplus-state";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
      req.result.createObjectStore(SECRETS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(db, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export class Store {
  constructor() {
    this.state = null;
    this.listeners = new Set();
    this.db = null;
    this.saveError = null;
  }

  async load(seed) {
    try {
      this.db = await openDb();
    } catch {
      this.db = null;
    }
    let saved = null;
    try {
      saved = this.db ? await idbGet(this.db) : JSON.parse(localStorage.getItem(LS_KEY) ?? "null");
    } catch {
      saved = null;
    }
    let state = saved ? migrateState(saved) : createState(seed);
    if (saved && seed && saved.seedVersion !== seed.version) {
      // recetas.md changed since the last visit: add/update bundled recipes.
      state = applyChange(state, (d) => mergeSeed(d, seed)).state;
    }
    this.state = applyChange(state, (d) => syncHistory(d, today())).state;
    await this.save();
    // Ask Safari not to evict the data under storage pressure.
    navigator.storage?.persist?.().catch(() => {});
    // A day may pass while the app stays open: refresh the history on return.
    document.addEventListener?.("visibilitychange", () => {
      if (document.visibilityState === "visible") this.update(() => {});
    });
    return this.state;
  }

  async save() {
    try {
      if (this.db) await idbPut(this.db, this.state);
      else localStorage.setItem(LS_KEY, JSON.stringify(this.state));
      this.saveError = null;
    } catch (e) {
      this.saveError = e;
      console.error("Could not save", e);
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Run `fn(draft)`; on success replace the state, save and re-render. */
  update(fn) {
    const { state, result } = applyChange(this.state, (d) => {
      const r = fn(d);
      syncHistory(d, today());
      return r;
    });
    this.state = state;
    this.save();
    for (const l of this.listeners) l(state);
    return result;
  }

  replace(data) {
    const { exportedAt, ...state } = validateBackup(data);
    this.state = applyChange(state, (d) => syncHistory(d, today())).state;
    this.save();
    for (const l of this.listeners) l(this.state);
  }

  exportJson() {
    return JSON.stringify({ ...this.state, exportedAt: new Date().toISOString() });
  }
}

export const store = new Store();

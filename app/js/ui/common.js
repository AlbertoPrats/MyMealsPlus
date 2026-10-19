import { html, useEffect, useState } from "../../vendor/preact-htm.js";
import { store } from "../store.js";

// ------------------------------------------------------------------ state

/** Re-render when the store changes; returns the current state. */
export function useAppState() {
  const [state, setState] = useState(store.state);
  useEffect(() => store.subscribe(setState), []);
  return state;
}

/** Apply a change; show its error as a toast instead of crashing. Returns true on success. */
export function run(fn, successMessage = null) {
  try {
    const result = store.update(fn);
    if (successMessage) toast(typeof successMessage === "function" ? successMessage(result) : successMessage);
    return true;
  } catch (e) {
    toast(e.message || String(e), "error");
    return false;
  }
}

// ----------------------------------------------------------------- router

function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  return { path, parts: path.split("/").filter(Boolean), params: new URLSearchParams(query) };
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function navigate(path) {
  location.hash = path;
}

// ----------------------------------------------------------------- toasts

const toastListeners = new Set();
let toastId = 0;

export function toast(message, kind = "info") {
  const t = { id: ++toastId, message, kind };
  for (const l of toastListeners) l(t);
}

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (t) => {
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), t.kind === "error" ? 5000 : 2500);
    };
    toastListeners.add(on);
    return () => toastListeners.delete(on);
  }, []);
  return html`<div class="toasts" role="status" aria-live="polite">
    ${items.map((t) => html`<div key=${t.id} class="toast ${t.kind}">${t.message}</div>`)}
  </div>`;
}

// ------------------------------------------------------------------ sheet

/** Bottom sheet modal. */
export function Sheet({ title, onClose, children, actions = null, tall = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
    };
  }, []);
  return html`<div class="sheet-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <section class="sheet ${tall ? "tall" : ""}" role="dialog" aria-modal="true" aria-label=${title}>
      <header class="sheet-header">
        <h2>${title}</h2>
        ${actions}
        <button class="icon-btn" aria-label="Cerrar" onClick=${onClose}>${icon("close")}</button>
      </header>
      <div class="sheet-body">${children}</div>
    </section>
  </div>`;
}

// ------------------------------------------------------------------ bits

export function Stepper({ value, onChange, min = 1, max = 99, label }) {
  return html`<div class="stepper" aria-label=${label}>
    <button type="button" aria-label="Menos" disabled=${value <= min} onClick=${() => onChange(value - 1)}>−</button>
    <span>${value}</span>
    <button type="button" aria-label="Más" disabled=${value >= max} onClick=${() => onChange(value + 1)}>+</button>
  </div>`;
}

export function GroupChips({ groups, value, onChange }) {
  return html`<div class="chips" role="tablist">
    <button class="chip ${value == null ? "active" : ""}" onClick=${() => onChange(null)}>Todas</button>
    ${groups.map(
      (g) => html`<button key=${g.id} class="chip ${value === g.id ? "active" : ""}" onClick=${() => onChange(g.id)}>
        <span class="dot" style=${{ background: groupColor(g.sortOrder) }}></span>${g.name}
      </button>`,
    )}
  </div>`;
}

const GROUP_COLORS = ["#6a994e", "#2a7ab0", "#e09f3e", "#c44536", "#d4a017", "#8e6bbf", "#3a9d9d", "#b5651d"];

export function groupColor(sortOrder) {
  if (sortOrder == null) return "#9aa0a6";
  return GROUP_COLORS[sortOrder % GROUP_COLORS.length];
}

export function colorForGroupId(state, groupId) {
  const g = state.groups.find((x) => x.id === groupId);
  return groupColor(g?.sortOrder);
}

export function EmptyState({ title, children }) {
  return html`<div class="empty"><p class="empty-title">${title}</p>${children}</div>`;
}

// ------------------------------------------------------------------ icons

const ICONS = {
  week: "M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zM5 9h14v10H5z",
  prep: "M3 11h18v2a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7zm2-5h14v3H5zm4-3h6v2H9z",
  book: "M6 2h11a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zm0 2a1 1 0 0 0-1 1v11.2A3 3 0 0 1 6 16h11V4zm0 14a1 1 0 0 0 0 2h11v-2z",
  settings:
    "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm8.6 5.4.1-1.4-.1-1.4 2-1.6-2-3.4-2.4 1a8 8 0 0 0-2.4-1.4L15.4 2h-4l-.4 2.6a8 8 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.6-.1 1.4.1 1.4-2 1.6 2 3.4 2.4-1a8 8 0 0 0 2.4 1.4l.4 2.6h4l.4-2.6a8 8 0 0 0 2.4-1.4l2.4 1 2-3.4z",
  plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z",
  close: "m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z",
  left: "M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z",
  right: "M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z",
  box: "M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm-1-4h18v3H3zm6 7v2h6v-2z",
  warning: "M12 2 1 21h22zm-1 7h2v6h-2zm0 8h2v2h-2z",
  star: "m12 17.3 6.2 3.7-1.6-7 5.4-4.7-7.2-.6L12 2 9.2 8.7 2 9.3l5.4 4.7-1.6 7z",
  starOutline:
    "m12 15.4-3.8 2.3 1-4.3-3.3-2.9 4.4-.4L12 6.1l1.7 4 4.4.4-3.3 2.9 1 4.3zM22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2l5.5 4.7L5.8 21l6.2-3.7 6.2 3.7-1.6-7.1z",
  snow: "M11 2h2v4.6l2.6-2.6L17 5.4l-4 4V11h1.6l4-4L20 8.4 17.4 11H22v2h-4.6l2.6 2.6-1.4 1.4-4-4H13v1.6l4 4-1.4 1.4-2.6-2.6V22h-2v-4.6L8.4 20 7 18.6l4-4V13H9.4l-4 4L4 15.6 6.6 13H2v-2h4.6L4 8.4 5.4 7l4 4H11V9.4l-4-4L8.4 4 11 6.6z",
  trash: "M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z",
  share: "M12 2 7 7l1.4 1.4L11 5.8V15h2V5.8l2.6 2.6L17 7zM5 13v7h14v-7h2v9H3v-9z",
  wand: "m7.5 5.6 2.5 1.4-1.4-2.5L10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.6 5.3a1 1 0 0 0-1.4 0L1.3 18.9a1 1 0 0 0 0 1.4l2.3 2.3a1 1 0 0 0 1.4 0L16.7 11a1 1 0 0 0 0-1.4zm-1.1 5.5-2.1-2.1 2.4-2.4 2.1 2.1z",
  edit: "M3 17.2V21h3.8L17.8 10l-3.8-3.8zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8z",
  check: "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7z",
  users: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0h-1c1.2.9 2 2 2 3.5V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z",
  search: "M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z",
  chat: "M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 1-2zm3 6v2h2V9zm4 0v2h2V9zm4 0v2h2V9z",
  sparkle: "M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9zM5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7z",
  copy: "M16 1H6a2 2 0 0 0-2 2v12h2V3h10zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16h-9V7h9z",
  send: "M2 21l21-9L2 3v7l15 2-15 2z",
  lock: "M12 1a5 5 0 0 0-5 5v3H5v13h14V9h-2V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 0 1 6 0v3zm3 4a2 2 0 0 1 1 3.7V19h-2v-2.3A2 2 0 0 1 12 13z",
};

export function icon(name, size = 22) {
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true">
    <path d=${ICONS[name]} fill="currentColor" />
  </svg>`;
}

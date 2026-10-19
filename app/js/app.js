import { html, render, useEffect } from "../vendor/preact-htm.js";
import { store } from "./store.js";
import { AssistantPage } from "./ui/assistant.js";
import { Toasts, icon, useAppState, useRoute } from "./ui/common.js";
import { Orb } from "./ui/leftovers.js";
import { PrepDetailPage, PrepListPage } from "./ui/prep.js";
import { RecipeDetailPage, RecipeEditorPage, RecipeListPage } from "./ui/recipes.js";
import { SettingsPage } from "./ui/settings.js";
import { SheetHost } from "./ui/sheets.js";
import { WeekPage } from "./ui/week.js";

const TABS = [
  { path: "/", match: (p) => p.length === 0, label: "Semana", icon: "week" },
  { path: "/prep", match: (p) => p[0] === "prep", label: "Preparación", icon: "prep" },
  { path: "/recetas", match: (p) => p[0] === "recetas" || p[0] === "receta", label: "Recetas", icon: "book" },
  { path: "/asistente", match: (p) => p[0] === "asistente", label: "Asistente", icon: "chat" },
  { path: "/ajustes", match: (p) => p[0] === "ajustes", label: "Ajustes", icon: "settings" },
];

function Page({ state, route, seed }) {
  const [a, b, c] = route.parts;
  if (a === "prep" && b) return html`<${PrepDetailPage} key=${b} state=${state} id=${Number(b)} tab=${route.params.get("tab") ?? "plan"} />`;
  if (a === "prep") return html`<${PrepListPage} state=${state} />`;
  if (a === "receta" && b === "nueva") return html`<${RecipeEditorPage} key="new" state=${state} id=${null} />`;
  if (a === "receta" && c === "editar") return html`<${RecipeEditorPage} key=${`e${b}`} state=${state} id=${Number(b)} />`;
  if (a === "receta" && b) return html`<${RecipeDetailPage} key=${b} state=${state} id=${Number(b)} />`;
  if (a === "recetas") return html`<${RecipeListPage} state=${state} />`;
  if (a === "ajustes") return html`<${SettingsPage} state=${state} seed=${seed} />`;
  if (a === "asistente") return html`<${AssistantPage} key=${route.params.get("receta") ?? "chat"} state=${state} params=${route.params} />`;
  return html`<${WeekPage} state=${state} />`;
}

function App({ seed }) {
  const state = useAppState();
  const route = useRoute();
  // New page starts at the top (tabs inside a page keep their position).
  useEffect(() => window.scrollTo(0, 0), [route.path]);
  return html`
    <main class="content"><${Page} state=${state} route=${route} seed=${seed} /></main>
    <${Orb} state=${state} />
    <nav class="tab-bar" aria-label="Secciones">
      ${TABS.map(
        (t) => html`<a key=${t.path} href=${`#${t.path}`} class=${t.match(route.parts) ? "active" : ""} aria-current=${t.match(route.parts) ? "page" : null}>
          ${icon(t.icon, 24)}<span>${t.label}</span>
        </a>`,
      )}
    </nav>
    <${SheetHost} />
    <${Toasts} />
  `;
}

function UpdateBanner() {
  return html`<div class="update-banner">
    Nueva versión disponible
    <button onClick=${() => location.reload()}>Actualizar</button>
  </div>`;
}

async function main() {
  const root = document.getElementById("app");
  let seed = null;
  try {
    seed = await (await fetch("./data/recipes.json")).json();
  } catch {
    // Offline before the service worker cached it: start with saved data only.
  }
  await store.load(seed);
  root.textContent = "";
  render(html`<${App} seed=${seed} />`, root);
  document.body.classList.add("ready");

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("./sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController) return;
      const holder = document.createElement("div");
      document.body.append(holder);
      render(html`<${UpdateBanner} />`, holder);
    });
  }
}

main().catch((e) => {
  console.error(e);
  document.getElementById("app").textContent = `No se pudo iniciar la app: ${e.message}`;
});

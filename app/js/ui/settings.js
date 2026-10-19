// Settings: meal slots, pantry, backup / restore, reset.

import { addMealType, moveMealType, sortedMealTypes } from "../core/planner.js";
import { ingredientKey } from "../core/parser.js";
import { ConflictError, createState, mergeSeed } from "../core/state.js";
import { html, useEffect, useState } from "../../vendor/preact-htm.js";
import { store } from "../store.js";
import { AiSettings } from "./ai-settings.js";
import { icon, run, toast } from "./common.js";

export const APP_VERSION = "1.0.0+";

async function downloadBackup() {
  const name = `mymealsplus-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([store.exportJson()], name, { type: "application/json" });
  // On iPhone the share sheet lets you save it to Files / iCloud Drive.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Copia de MyMeals" });
      return;
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsPage({ state, seed }) {
  const [newType, setNewType] = useState("");
  const [newPantry, setNewPantry] = useState("");
  const [persisted, setPersisted] = useState(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, []);
  const types = sortedMealTypes(state, { activeOnly: false });
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;

  const importFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm("Esto reemplaza todos los datos actuales por los de la copia. ¿Continuar?")) return;
      store.replace(data);
      toast("Copia restaurada.");
    } catch (err) {
      toast(err.message || "No se pudo leer el archivo.", "error");
    }
  };

  const reset = () => {
    if (!confirm("Se borrarán tu plan, preparaciones y recetas propias. ¿Seguro?")) return;
    if (!confirm("Última confirmación: ¿borrar todo y empezar de cero?")) return;
    store.replace(createState(seed));
    toast("Datos borrados.");
  };

  return html`<div class="page settings">
    <header class="top-bar"><h1>Ajustes</h1></header>

    ${!standalone
      ? html`<section class="card pad install">
          <h2>Instalar en el iPhone</h2>
          <p>En Safari, pulsa ${icon("share", 16)} <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.
          La app funcionará sin conexión y tus datos se guardan solo en este teléfono.</p>
        </section>`
      : null}

    <${AiSettings} state=${state} />

    <section class="card pad">
      <h2>Comidas del día</h2>
      <ul class="list plain">
        ${types.map(
          (t, i) => html`<li key=${t.id} class="row-setting">
            <label class="check">
              <input type="checkbox" checked=${t.active} onChange=${(e) => run((s) => { s.mealTypes.find((x) => x.id === t.id).active = e.target.checked; })} />
              ${t.name}
            </label>
            <span>
              <button class="icon-btn" aria-label=${`Subir ${t.name}`} disabled=${i === 0} onClick=${() => run((s) => moveMealType(s, t.id, -1))}>↑</button>
              <button class="icon-btn" aria-label=${`Bajar ${t.name}`} disabled=${i === types.length - 1} onClick=${() => run((s) => moveMealType(s, t.id, 1))}>↓</button>
            </span>
          </li>`,
        )}
      </ul>
      <form class="inline-form" onSubmit=${(e) => { e.preventDefault(); if (run((s) => addMealType(s, newType), "Añadida.")) setNewType(""); }}>
        <input type="text" placeholder="Desayuno, merienda…" value=${newType} onInput=${(e) => setNewType(e.target.value)} />
        <button class="secondary" type="submit">Añadir</button>
      </form>
    </section>

    <section class="card pad">
      <h2>Siempre en casa</h2>
      <p class="muted small">Estos ingredientes aparecen al final de la lista de la compra.</p>
      <div class="chips wrap">
        ${state.pantry.map(
          (p) => html`<span key=${p.key} class="chip active">
            ${p.name}
            <button class="chip-x" aria-label=${`Quitar ${p.name}`} onClick=${() => run((s) => { s.pantry = s.pantry.filter((x) => x.key !== p.key); })}>×</button>
          </span>`,
        )}
      </div>
      <form
        class="inline-form"
        onSubmit=${(e) => {
          e.preventDefault();
          const name = newPantry.trim();
          const ok = run((s) => {
            if (!name) throw new ConflictError("Escribe un ingrediente.");
            const key = ingredientKey(name);
            if (!s.pantry.some((x) => x.key === key)) s.pantry.push({ key, name });
          });
          if (ok) setNewPantry("");
        }}
      >
        <input type="text" placeholder="aceite de oliva, comino…" value=${newPantry} onInput=${(e) => setNewPantry(e.target.value)} />
        <button class="secondary" type="submit">Añadir</button>
      </form>
    </section>

    <section class="card pad">
      <h2>Copia de seguridad</h2>
      <p class="muted small">
        Los datos solo existen en este teléfono. Si borras la app de la pantalla de inicio se pierden, así que guarda una copia
        de vez en cuando (en Archivos o iCloud Drive). También sirve para pasar tus datos a otro teléfono, o para traer
        aquí los datos de la app MyMeals original. Las claves del asistente nunca se incluyen.
      </p>
      <div class="button-row">
        <button class="secondary" onClick=${downloadBackup}>Guardar copia</button>
        <label class="secondary file-btn">Restaurar copia<input type="file" accept="application/json,.json" onChange=${importFile} /></label>
      </div>
      ${persisted === false
        ? html`<p class="muted small">Consejo: instala la app en la pantalla de inicio para que iOS no borre los datos.</p>`
        : null}
    </section>

    <section class="card pad">
      <h2>Recetas incluidas</h2>
      <p class="muted small">
        ${state.recipes.length} recetas. Las de recetas.md se actualizan solas al publicar una versión nueva; las que edites aquí
        no se sobrescriben.
      </p>
      <button
        class="secondary"
        onClick=${() => run((s) => mergeSeed(s, seed), (r) => `Recetas revisadas: ${r.created} nuevas, ${r.updated} actualizadas.`)}
      >
        Volver a cargar recetas.md
      </button>
    </section>

    <section class="card pad">
      <h2>Borrar todo</h2>
      <button class="danger" onClick=${reset}>${icon("trash", 18)} Empezar de cero</button>
    </section>

    <p class="muted small center">MyMeals+ ${APP_VERSION} · recetas ${state.seedVersion ?? "–"}</p>
  </div>`;
}

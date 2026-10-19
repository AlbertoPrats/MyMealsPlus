// One sheet open at a time, opened from anywhere with openSheet({...}).

import { html, useEffect, useState } from "../../vendor/preact-htm.js";
import { LeftoversSheet } from "./leftovers.js";
import { MealSheet } from "./meal-sheet.js";
import { PickerSheet } from "./picker.js";

const listeners = new Set();

export function openSheet(spec) {
  for (const l of listeners) l(spec);
}

export function closeSheet() {
  openSheet(null);
}

export function SheetHost() {
  const [spec, setSpec] = useState(null);
  useEffect(() => {
    listeners.add(setSpec);
    // Going to another page (e.g. "Ir a Ajustes" from a sheet) closes the sheet.
    const close = () => setSpec(null);
    window.addEventListener("hashchange", close);
    return () => {
      listeners.delete(setSpec);
      window.removeEventListener("hashchange", close);
    };
  }, []);
  if (!spec) return null;
  const onClose = () => setSpec(null);
  switch (spec.type) {
    case "picker":
      return html`<${PickerSheet} ...${spec} onClose=${onClose} />`;
    case "meal":
      return html`<${MealSheet} ...${spec} onClose=${onClose} />`;
    case "leftovers":
      return html`<${LeftoversSheet} ...${spec} onClose=${onClose} />`;
    default:
      return null;
  }
}

// Dates are plain "YYYY-MM-DD" strings: they sort correctly as text and have
// no time zone. Arithmetic goes through UTC so DST never shifts a day.

const DAY_MS = 86_400_000;

function toUTC(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function today(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
  return fromUTC(toUTC(iso) + n * DAY_MS);
}

export function diffDays(a, b) {
  return Math.round((toUTC(a) - toUTC(b)) / DAY_MS);
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayIndex(iso) {
  return (new Date(toUTC(iso)).getUTCDay() + 6) % 7;
}

export function startOfWeek(iso) {
  return addDays(iso, -weekdayIndex(iso));
}

export function range(start, days) {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

const WEEKDAYS_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function dayNumber(iso) {
  return Number(iso.slice(8, 10));
}

export function weekdayShort(iso) {
  return WEEKDAYS_SHORT[weekdayIndex(iso)];
}

export function weekdayName(iso) {
  return WEEKDAYS[weekdayIndex(iso)];
}

export function monthName(iso) {
  return MONTHS[Number(iso.slice(5, 7)) - 1];
}

/** "lunes 19 de octubre" */
export function longDate(iso) {
  return `${weekdayName(iso)} ${dayNumber(iso)} de ${monthName(iso)}`;
}

/** "19 oct" */
export function shortDate(iso) {
  return `${dayNumber(iso)} ${monthName(iso).slice(0, 3)}`;
}

// Über /admin gepflegte Ortskorrekturen; sie haben Vorrang vor packages/shared und liegen in DATA_DIR.

import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeKey, type LatLng } from "@moinkark/shared";

/** Titel-basierte Korrektur; `force` überstimmt auch eine gepflegte ChurchDesk-Koordinate. */
export interface TitleFix {
  prefix: string;
  coords: LatLng;
  force?: boolean;
}

/** Eingabefehler des Admins, beantwortet mit 400 und Grund. */
export class InvalidOverridesError extends Error {
  override name = "InvalidOverridesError";
}

export interface LocationOverrides {
  /** Normalisierter Ortsname (locationName) → Koordinate. */
  locations: Record<string, LatLng>;
  /** Präfix-Match auf dem normalisierten Titel. */
  titles: TitleFix[];
  /** Zusätzlich ausgeschlossene Kategorien (normalisiert) — ergänzen EXCLUDED_CATEGORIES. */
  categories: string[];
  /** Event-IDs, die zusätzlich zum ChurchDesk-Tag als Highlight markiert sind. */
  highlights: number[];
}

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const FILE = join(DATA_DIR, "location-overrides.json");

let overrides: LocationOverrides = { locations: {}, titles: [], categories: [], highlights: [] };

/** Ladezustand; bei "failed" ist Schreiben gesperrt, sonst überschriebe der leere Stand die Datei. */
let loadState: "unloaded" | "loaded" | "failed" = "unloaded";
let loadError = "";

/** Dieselbe Normalisierung wie in @moinkark/shared, sonst trifft eine Korrektur den Ort nicht. */
const normalizeName = normalizeKey;

/** Namen, die als Objektschlüssel die Prototypkette träfen. */
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isLatLng(v: unknown): v is LatLng {
  const c = v as LatLng;
  return (
    !!c &&
    typeof c.lat === "number" &&
    typeof c.lng === "number" &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    c.lat >= -90 &&
    c.lat <= 90 &&
    c.lng >= -180 &&
    c.lng <= 180 &&
    // 0/0 ist ein leer gelassenes Feld.
    !(c.lat === 0 && c.lng === 0)
  );
}

/** Validiert + normalisiert Fremd-Input (Admin-PUT oder Datei von Platte). */
function sanitize(raw: unknown): LocationOverrides {
  const input = raw as Partial<LocationOverrides> | null;
  const locations: Record<string, LatLng> = {};
  for (const [name, coords] of Object.entries(input?.locations ?? {})) {
    const key = normalizeName(name);
    if (!key) throw new InvalidOverridesError("Leerer Ortsname.");
    if (RESERVED_KEYS.has(key)) throw new InvalidOverridesError(`Unzulässiger Ortsname „${name}".`);
    if (!isLatLng(coords)) throw new InvalidOverridesError(`Ungültige Koordinate für „${name}".`);
    locations[key] = { lat: coords.lat, lng: coords.lng };
  }
  const titles: TitleFix[] = [];
  for (const t of Array.isArray(input?.titles) ? input.titles : []) {
    const prefix = normalizeName(t?.prefix ?? "");
    if (!prefix) throw new InvalidOverridesError("Leerer Titel-Präfix.");
    if (!isLatLng(t?.coords))
      throw new InvalidOverridesError(`Ungültige Koordinate für Titel „${t?.prefix}".`);
    titles.push({ prefix, coords: { lat: t.coords.lat, lng: t.coords.lng }, force: !!t.force });
  }
  const categories: string[] = [];
  for (const c of Array.isArray(input?.categories) ? input.categories : []) {
    const cat = normalizeName(typeof c === "string" ? c : "");
    if (!cat) throw new InvalidOverridesError("Leerer Kategorie-Name.");
    if (!categories.includes(cat)) categories.push(cat);
  }
  const highlights: number[] = [];
  for (const h of Array.isArray(input?.highlights) ? input.highlights : []) {
    const id = Number(h);
    if (!Number.isInteger(id) || id <= 0)
      throw new InvalidOverridesError(`Ungültige Highlight-Event-ID: ${h}`);
    if (!highlights.includes(id)) highlights.push(id);
  }
  return { locations, titles, categories, highlights };
}

/** Lädt einmal beim Start; eine unlesbare Datei startet ohne Korrekturen und sperrt das Speichern. */
export function loadOverrides(): void {
  try {
    overrides = sanitize(JSON.parse(readFileSync(FILE, "utf8")));
    loadState = "loaded";
    loadError = "";
    const n =
      Object.keys(overrides.locations).length +
      overrides.titles.length +
      overrides.categories.length +
      overrides.highlights.length;
    console.log(`[locations] ${n} Laufzeit-Korrektur(en) aus ${FILE} geladen.`);
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      overrides = { locations: {}, titles: [], categories: [], highlights: [] };
      loadState = "loaded";
      loadError = "";
      return;
    }
    overrides = { locations: {}, titles: [], categories: [], highlights: [] };
    loadState = "failed";
    loadError = String(e?.message ?? e);
    console.error(
      `[locations] ${FILE} nicht lesbar — laufe OHNE Laufzeit-Korrekturen. ` +
        `Speichern über /admin ist gesperrt, bis die Datei wieder lesbar ist und die API neu gestartet wurde:`,
      loadError
    );
  }
}

export function getOverrides(): LocationOverrides {
  return overrides;
}

/** Grund, warum Speichern gesperrt ist, sonst null. */
export function overridesLoadError(): string | null {
  if (loadState === "loaded") return null;
  if (loadState === "unloaded") return "Korrekturen wurden noch nicht von Platte geladen.";
  return (
    `${FILE} konnte beim Start nicht gelesen werden (${loadError}). ` +
    "Speichern würde den dort liegenden Stand überschreiben — Datei prüfen und die API neu starten."
  );
}

/** Ersetzt den kompletten Stand (Admin-PUT) und schreibt ihn atomar auf Platte. */
export function setOverrides(raw: unknown): LocationOverrides {
  const blocked = overridesLoadError();
  if (blocked) throw new Error(`Korrekturen nicht gespeichert: ${blocked}`);
  const next = sanitize(raw);
  mkdirSync(DATA_DIR, { recursive: true });
  // Letzten Stand sichern — ein Fehlklick in /admin ist damit per Hand rückholbar.
  try {
    copyFileSync(FILE, `${FILE}.bak`);
  } catch (e: any) {
    if (e?.code !== "ENOENT") throw e;
  }
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, FILE);
  overrides = next;
  return overrides;
}

// --- Lookups, Gegenstücke zu coordFixFor/coordFixForTitle/coordOverrideForTitle ---

export function dynamicCoordFixFor(locationName: string | undefined): LatLng | undefined {
  if (!locationName) return undefined;
  const key = normalizeName(locationName);
  // Nur eigene Einträge — „constructor" o.ä. würde sonst Object.prototype treffen.
  return Object.hasOwn(overrides.locations, key) ? overrides.locations[key] : undefined;
}

/** Der ganze /admin-Titel-Eintrag, weil sein `force: false` auch den Code-Vorrang aufheben muss. */
export function dynamicTitleFixFor(title: string | undefined): TitleFix | undefined {
  if (!title) return undefined;
  const t = normalizeName(title);
  return overrides.titles.find((e) => t.startsWith(e.prefix));
}

/** Ist die Kategorie über /admin ausgeschlossen? Erwartet den normalisierten Titel. */
export function isDynamicallyExcludedCategory(normTitle: string): boolean {
  return overrides.categories.includes(normTitle);
}

/** Ist das Event über /admin als Highlight markiert? */
export function isDynamicHighlight(eventId: number): boolean {
  return overrides.highlights.includes(eventId);
}

// Zur Laufzeit pflegbare Orts-Korrekturen — Ergänzung zu den statischen Tabellen
// in packages/shared (kirchen-coords.ts). Die statischen Tabellen bleiben die im
// Code versionierte Basis; was hier über /admin gepflegt wird, hat Vorrang und
// überlebt Neustarts als JSON-Datei im DATA_DIR-Volume.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeKey, type LatLng } from "@moinkark/shared";

/** Titel-basierte Korrektur; `force` überstimmt auch eine gepflegte ChurchDesk-Koordinate. */
interface TitleFix {
  prefix: string;
  coords: LatLng;
  force?: boolean;
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

/**
 * Dieselbe Normalisierung wie die statischen Tabellen in @moinkark/shared —
 * bewusst importiert statt nachgebaut: An ihr hängt, ob eine über /admin
 * gepflegte Korrektur den Ort überhaupt trifft.
 */
const normalizeName = normalizeKey;

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
    // 0/0 (Golf von Guinea) ist keine echte Korrektur, sondern ein leer gelassenes
    // Formularfeld — genauso wie bei ChurchDesk-Daten (s. geojson.ts) aussortieren.
    !(c.lat === 0 && c.lng === 0)
  );
}

/** Validiert + normalisiert Fremd-Input (Admin-PUT oder Datei von Platte). */
function sanitize(raw: unknown): LocationOverrides {
  const input = raw as Partial<LocationOverrides> | null;
  const locations: Record<string, LatLng> = {};
  for (const [name, coords] of Object.entries(input?.locations ?? {})) {
    const key = normalizeName(name);
    if (!key) throw new Error("Leerer Ortsname.");
    if (!isLatLng(coords)) throw new Error(`Ungültige Koordinate für „${name}".`);
    locations[key] = { lat: coords.lat, lng: coords.lng };
  }
  const titles: TitleFix[] = [];
  for (const t of Array.isArray(input?.titles) ? input.titles : []) {
    const prefix = normalizeName(t?.prefix ?? "");
    if (!prefix) throw new Error("Leerer Titel-Präfix.");
    if (!isLatLng(t?.coords)) throw new Error(`Ungültige Koordinate für Titel „${t?.prefix}".`);
    titles.push({ prefix, coords: { lat: t.coords.lat, lng: t.coords.lng }, force: !!t.force });
  }
  const categories: string[] = [];
  for (const c of Array.isArray(input?.categories) ? input.categories : []) {
    const cat = normalizeName(typeof c === "string" ? c : "");
    if (!cat) throw new Error("Leerer Kategorie-Name.");
    if (!categories.includes(cat)) categories.push(cat);
  }
  const highlights: number[] = [];
  for (const h of Array.isArray(input?.highlights) ? input.highlights : []) {
    const id = Number(h);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`Ungültige Highlight-Event-ID: ${h}`);
    if (!highlights.includes(id)) highlights.push(id);
  }
  return { locations, titles, categories, highlights };
}

/** Beim Start einmal von Platte laden. Fehlende Datei ist der Normalfall (leerer Stand). */
export function loadOverrides(): void {
  try {
    overrides = sanitize(JSON.parse(readFileSync(FILE, "utf8")));
    const n =
      Object.keys(overrides.locations).length +
      overrides.titles.length +
      overrides.categories.length +
      overrides.highlights.length;
    console.log(`[locations] ${n} Laufzeit-Korrektur(en) aus ${FILE} geladen.`);
  } catch (e: any) {
    if (e?.code !== "ENOENT") {
      console.error(`[locations] ${FILE} nicht lesbar — starte mit leerem Stand:`, e?.message ?? e);
    }
  }
}

export function getOverrides(): LocationOverrides {
  return overrides;
}

/** Ersetzt den kompletten Stand (Admin-PUT) und schreibt ihn atomar auf Platte. */
export function setOverrides(raw: unknown): LocationOverrides {
  const next = sanitize(raw);
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, FILE);
  overrides = next;
  return overrides;
}

// --- Lookups, Gegenstücke zu coordFixFor/coordFixForTitle/coordOverrideForTitle ---

export function dynamicCoordFixFor(locationName: string | undefined): LatLng | undefined {
  if (!locationName) return undefined;
  return overrides.locations[normalizeName(locationName)];
}

export function dynamicCoordFixForTitle(title: string | undefined): LatLng | undefined {
  if (!title) return undefined;
  const t = normalizeName(title);
  return overrides.titles.find((e) => t.startsWith(e.prefix))?.coords;
}

export function dynamicCoordOverrideForTitle(title: string | undefined): LatLng | undefined {
  if (!title) return undefined;
  const t = normalizeName(title);
  return overrides.titles.find((e) => e.force && t.startsWith(e.prefix))?.coords;
}

/** Ist die Kategorie über /admin ausgeschlossen? Erwartet den normalisierten Titel. */
export function isDynamicallyExcludedCategory(normTitle: string): boolean {
  return overrides.categories.includes(normTitle);
}

/** Ist das Event über /admin als Highlight markiert? */
export function isDynamicHighlight(eventId: number): boolean {
  return overrides.highlights.includes(eventId);
}

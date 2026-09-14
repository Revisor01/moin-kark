// Zur Laufzeit pflegbare Orts-Korrekturen — Ergänzung zu den statischen Tabellen
// in packages/shared (kirchen-coords.ts). Die statischen Tabellen bleiben die im
// Code versionierte Basis; was hier über /admin gepflegt wird, hat Vorrang und
// überlebt Neustarts als JSON-Datei im DATA_DIR-Volume.

import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeKey, type LatLng } from "@moinkark/shared";

/** Titel-basierte Korrektur; `force` überstimmt auch eine gepflegte ChurchDesk-Koordinate. */
export interface TitleFix {
  prefix: string;
  coords: LatLng;
  force?: boolean;
}

/**
 * Eingabefehler des Admins (ungültige Koordinate, leerer Name) — im Gegensatz
 * zu Schreibfehlern auf Platte. Die Route antwortet darauf mit 400 und dem
 * Grund; alles andere ist ein Serverzustand und geht nicht im Wortlaut nach außen.
 */
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

/**
 * Ob der Stand im Speicher die Datei auf Platte wirklich abbildet.
 *
 * "unloaded": loadOverrides() lief noch nicht. "loaded": Datei gelesen oder
 * nicht vorhanden (leerer Stand ist dann korrekt). "failed": Datei existiert,
 * ließ sich aber nicht lesen oder parsen — der Speicher-Stand ist leer, die
 * Datei nicht. Solange das so ist, darf nicht geschrieben werden: Ein
 * Admin-PUT würde sonst den leeren Stand über die echten Korrekturen schreiben.
 */
let loadState: "unloaded" | "loaded" | "failed" = "unloaded";
let loadError = "";

/**
 * Dieselbe Normalisierung wie die statischen Tabellen in @moinkark/shared —
 * bewusst importiert statt nachgebaut: An ihr hängt, ob eine über /admin
 * gepflegte Korrektur den Ort überhaupt trifft.
 */
const normalizeName = normalizeKey;

/**
 * Ortsnamen, die als Schlüssel eines Objektliterals die Prototypkette treffen.
 * „__proto__" würde beim Kopieren den Prototyp von `locations` umbiegen und nie
 * in der Datei landen; „constructor"/„prototype" sind keine echten Orte.
 */
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

/**
 * Beim Start einmal von Platte laden. Fehlende Datei ist der Normalfall (leerer Stand).
 *
 * Ist die Datei da, aber nicht lesbar (Volume-Rechte nach einem Deploy — schon
 * passiert) oder nicht parsebar, läuft die API trotzdem an, nur ohne die
 * Korrekturen: Der öffentliche Feed für die Apps im Store hängt an dieser Datei
 * nicht, und ein Start-Abbruch würde wegen einer Admin-Datei alle Geräte ohne
 * Termine lassen. Der Preis ist ein Feed mit fehlenden Korrekturen — sichtbar,
 * aber nicht kaputt. Was NICHT passieren darf: dass dieser leere Stand beim
 * nächsten Speichern über die Datei geschrieben wird. Deshalb merkt sich
 * loadState den Fehler und setOverrides() verweigert, bis ein Neustart die Datei
 * erfolgreich gelesen hat.
 */
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

/**
 * Warum Speichern gerade nicht möglich ist — oder null, wenn alles in Ordnung
 * ist. Für /admin, damit der Zustand vor dem ersten Klick sichtbar ist.
 */
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

/**
 * Der über /admin gepflegte Titel-Eintrag — als ganzer Eintrag, nicht nur die
 * Koordinate: Sein `force` ist maßgeblich. Ein Eintrag mit `force: false` hebt
 * damit auch den Vorrang eines gleichnamigen Code-Eintrags (TITLE_OVERRIDES)
 * auf; lieferte diese Funktion nur bei `force` etwas, fiele der Feed still auf
 * die Code-Tabelle zurück und das abgewählte Häkchen wäre wirkungslos.
 */
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

// Kirchspiel-Struktur nach Simons Vorgabe (maßgeblich — ERSETZT Handoff §2).
// 6 Kirchspiele. Zuordnung erfolgt zweistufig:
//   1. Über parishes[0].title (Gemeinde-Name) — feinste, zuverlässigste Quelle.
//   2. Fallback über die ChurchDesk-orgId.
// Simon korrigiert Detail-Zuordnungen live, sobald sichtbar.

import { normalizeKey as normalize } from "./types";

export const KIRCHSPIELE = [
  "Eider",
  "West",
  "Heide und Umgebung",
  "Mitte-Süd",
  "Geest",
  "Süd",
] as const;

export type Kirchspiel = (typeof KIRCHSPIELE)[number] | "Kirchenkreis Dithmarschen";

/** Gemeinde-/Ortsname (lowercase) → Kirchspiel. Quelle: parishes[0].title. */
const PARISH_TO_KIRCHSPIEL: Record<string, Kirchspiel> = {
  // Eider
  lunden: "Eider",
  "st. annen": "Eider",
  schlichting: "Eider",
  hemme: "Eider",
  weddingstedt: "Eider",
  hennstedt: "Eider",
  // West
  büsum: "West",
  buesum: "West",
  "urlauberseelsorge büsum": "West",
  wesselburen: "West",
  neuenkirchen: "West",
  helgoland: "West",
  // Heide und Umgebung
  heide: "Heide und Umgebung",
  "kg heide": "Heide und Umgebung",
  hemmingstedt: "Heide und Umgebung",
  wesseln: "Heide und Umgebung",
  "kirche wesseln": "Heide und Umgebung",
  lohe: "Heide und Umgebung",
  "lohe-rickelshof": "Heide und Umgebung",
  wöhrden: "Heide und Umgebung",
  woehrden: "Heide und Umgebung",
  nordhastedt: "Heide und Umgebung",
  "kg nordhastedt": "Heide und Umgebung",
  // Mitte-Süd
  meldorf: "Mitte-Süd",
  süderhastedt: "Mitte-Süd",
  suederhastedt: "Mitte-Süd",
  barlt: "Mitte-Süd",
  windbergen: "Mitte-Süd",
  "windbergen-gudendorf": "Mitte-Süd",
  gudendorf: "Mitte-Süd",
  // Geest
  albersdorf: "Geest",
  delve: "Geest",
  pahlen: "Geest",
  tellingstedt: "Geest",
  // Süd
  marne: "Süd",
  vsk: "Süd",
  "vereinigte köge": "Süd",
  brunsbüttel: "Süd",
  brunsbuettel: "Süd",
  burg: "Süd",
  eddelak: "Süd",
  "st. michaelisdonn": "Süd",
  "vereinigte süderdithmarscher köge": "Süd",
};

/** ChurchDesk-orgId → Kirchspiel (Fallback, wenn parish nicht eindeutig). */
const ORG_TO_KIRCHSPIEL: Record<number, Kirchspiel> = {
  2596: "Kirchenkreis Dithmarschen", // Dach
  2720: "Süd", // Kirchspiel Süd
  2725: "Eider", // Kirchspiel Eider
  2729: "West", // Kirchspiel West
  6572: "Heide und Umgebung", // Kirchspiel Heide
  // Einzelgemeinden (eigene Orgs) den 6 Kirchspielen zugeordnet:
  2619: "Mitte-Süd", // Meldorf
  2715: "Mitte-Süd", // Windbergen-Gudendorf
  2718: "Heide und Umgebung", // Wöhrden
  2722: "Heide und Umgebung", // Lohe-Rickelshof
  2723: "Geest", // Pahlen / Delve
  2724: "Geest", // Tellingstedt
  2753: "Geest", // Albersdorf
  2936: "Süd", // St. Michaelisdonn
  2940: "Mitte-Süd", // Süderhastedt
};

/** Org-Anzeigenamen (für orgName im Feature). */
export const ORG_NAMES: Record<number, string> = {
  2596: "Kirchenkreis Dithmarschen",
  2619: "Meldorf",
  2715: "Windbergen-Gudendorf",
  2718: "Wöhrden",
  2720: "Kirchspiel Süd",
  2722: "Lohe-Rickelshof",
  2723: "Pahlen / Delve",
  2724: "Tellingstedt",
  2725: "Kirchspiel Eider",
  2729: "Kirchspiel West",
  2753: "Albersdorf",
  2936: "St. Michaelisdonn",
  2940: "Süderhastedt",
  6572: "Kirchspiel Heide",
};



/**
 * Ermittelt das Kirchspiel: erst über den Gemeinde-Namen (parish), dann über die orgId.
 */
export function resolveKirchspiel(parish: string | undefined, orgId: number): Kirchspiel {
  if (parish) {
    const key = normalize(parish);
    if (PARISH_TO_KIRCHSPIEL[key]) return PARISH_TO_KIRCHSPIEL[key];
    // Teilstring-Match (z.B. "Heide St.-Jürgen" → "heide")
    for (const [name, ks] of Object.entries(PARISH_TO_KIRCHSPIEL)) {
      if (key.includes(name)) return ks;
    }
  }
  return ORG_TO_KIRCHSPIEL[orgId] ?? "Kirchenkreis Dithmarschen";
}

export function orgName(orgId: number): string {
  return ORG_NAMES[orgId] ?? `Org ${orgId}`;
}

/**
 * Alle Gemeinden eines Events — berücksichtigt Mehrfachzuordnung (`parishes`),
 * fällt sonst auf die einzelne `parish` zurück. Für Filter und Anzeige:
 * Ein Event „gehört" zu jeder dieser Gemeinden.
 */
export function eventParishes(p: { parish?: string; parishes?: string[] }): string[] {
  if (p.parishes?.length) return p.parishes;
  return p.parish ? [p.parish] : [];
}

/**
 * Anzeigename der Gemeinde(n): bei Mehrfachzuordnung alle ausschreiben, mit dem
 * Kirchspiel als Klammer — „Kirchspiel Eider: Hennstedt, Weddingstedt … und Hemme".
 * („Kirchspiel" allein ist für viele kein vertrauter Begriff, die Gemeindenamen sind es.)
 */
export function parishesLabel(p: {
  parish?: string;
  parishes?: string[];
  kirchspiel: string;
}): string | undefined {
  const all = eventParishes(p);
  if (all.length === 0) return undefined;
  if (all.length === 1) return all[0];
  const list = `${all.slice(0, -1).join(", ")} und ${all[all.length - 1]}`;
  return `Kirchspiel ${p.kirchspiel}: ${list}`;
}

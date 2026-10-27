// Fallback-Koordinaten für Events ohne locationObj, aus den häufigsten ChurchDesk-Koordinaten je Gemeinde.

import { normalizeKey as normalize } from "./types";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Titel-Korrektur per Präfix; `force` überstimmt auch eine gepflegte ChurchDesk-Koordinate. */
export interface TitleCoordFix {
  prefix: string;
  coords: LatLng;
  force?: boolean;
}

/** Gemeinde-Name (wie in parishes[0].title) → Koordinate. Nur über fallbackCoords() erreichbar. */
const PARISH_COORDS: Record<string, LatLng> = {
  Albersdorf: { lat: 54.147538, lng: 9.28266 },
  Brunsbüttel: { lat: 53.898038, lng: 9.141931 },
  Burg: { lat: 53.996541, lng: 9.265128 },
  Büsum: { lat: 54.129605, lng: 8.861245 },
  Eddelak: { lat: 53.945918, lng: 9.137222 },
  Hemme: { lat: 54.286582, lng: 9.019405 },
  Hennstedt: { lat: 54.284324, lng: 9.168123 },
  "KG  Nordhastedt": { lat: 54.171929, lng: 9.182254 },
  "KG Nordhastedt": { lat: 54.171929, lng: 9.182254 },
  Nordhastedt: { lat: 54.171929, lng: 9.182254 },
  "KG Heide": { lat: 54.195713, lng: 9.09261 },
  Heide: { lat: 54.195713, lng: 9.09261 },
  "Kirche Wesseln": { lat: 54.210174, lng: 9.0756 },
  Wesseln: { lat: 54.210174, lng: 9.0756 },
  // Sonst fallen Events nur mit Gemeinde auf den gröberen Org-Punkt zurück.
  "Lohe-Rickelshof": { lat: 54.1873944, lng: 9.0706326 },
  Pahlen: { lat: 54.2628322, lng: 9.2956512 },
  Delve: { lat: 54.3033433, lng: 9.2539684 },
  // Helgoland, sonst ~65 km entfernt auf dem Büsumer Pin.
  Helgoland: { lat: 54.178889, lng: 7.886389 },
  // Kirchenkreis-Termine ohne Ort in Dithmarschen bewusst in Meldorf, damit sie sichtbar bleiben.
  "Kirchenkreis Dithmarschen": { lat: 54.090562, lng: 9.074945 },
  Lunden: { lat: 54.333612, lng: 9.024191 },
  Marne: { lat: 53.95351, lng: 9.012812 },
  Meldorf: { lat: 54.090562, lng: 9.074945 },
  // St. Jacobi, sonst fällt Neuenkirchen auf Kirchspiel West in Büsum zurück.
  Neuenkirchen: { lat: 54.23672, lng: 8.9898787 },
  Schlichting: { lat: 54.313782, lng: 9.091838 },
  "St. Annen": { lat: 54.352585, lng: 9.074589 },
  "St. Michaelisdonn": { lat: 53.984218, lng: 9.114378 },
  Süderhastedt: { lat: 54.048748, lng: 9.209185 },
  Tellingstedt: { lat: 54.218911, lng: 9.274758 },
  "Urlauberseelsorge Büsum": { lat: 54.133612, lng: 8.838468 },
  "Vereinigte Süderdithmarscher Köge": { lat: 53.969656, lng: 8.961532 },
  Weddingstedt: { lat: 54.238321, lng: 9.089916 },
  Wesselburen: { lat: 54.212957, lng: 8.919594 },
  "Windbergen-Gudendorf": { lat: 54.045977, lng: 9.115475 },
  Wöhrden: { lat: 54.165051, lng: 8.997713 },
};

/** ChurchDesk-orgId → Koordinate (zweite Fallback-Stufe). */
export const ORG_COORDS: Record<number, LatLng> = {
  2596: { lat: 54.090562, lng: 9.074945 }, // Kirchenkreis Dithmarschen → Sitz Meldorf
  2619: { lat: 54.090562, lng: 9.074945 },
  2715: { lat: 54.045977, lng: 9.115475 },
  2718: { lat: 54.165051, lng: 8.997713 },
  2720: { lat: 53.898038, lng: 9.141931 },
  // Christuskirche Lohe-Rickelshof, wie in LOCATION_COORD_FIXES.
  2722: { lat: 54.1873944, lng: 9.0706326 },
  // Kirche Pahlen, wie in LOCATION_COORD_FIXES.
  2723: { lat: 54.2628322, lng: 9.2956512 },
  2724: { lat: 54.218911, lng: 9.274758 },
  2725: { lat: 54.284324, lng: 9.168123 },
  2729: { lat: 54.129605, lng: 8.861245 },
  2753: { lat: 54.147538, lng: 9.28266 },
  2936: { lat: 53.984218, lng: 9.114378 },
  2940: { lat: 54.048748, lng: 9.209185 },
  6572: { lat: 54.171929, lng: 9.182254 },
};

/** Geografisches Zentrum Dithmarschen — letzter Notnagel. */
export const DITHMARSCHEN_CENTER: LatLng = { lat: 54.12, lng: 9.05 };

/** Korrekturen falsch geokodierter Orte (Schlüssel locationName, Quelle OSM); sie gehen vor ChurchDesk. */
export const LOCATION_COORD_FIXES: Record<string, LatLng> = {
  // Kirche liegt 63 m südöstlich des Pastorats (beide „Marktstr. 2" in ChurchDesk).
  "wesselburen | st. bartholomäus": { lat: 54.2120945, lng: 8.9225438 },
  // Ohne Koordinate in ChurchDesk, hier zusätzlich am Ortsnamen festgemacht.
  "neuenkirchen | st. jacobi": { lat: 54.23672, lng: 8.9898787 },

  // --- Meldorf: Orte ohne Ort-Objekt, sonst alle auf dem Dom ---
  "ev. gemeinschaft, bütjestraße 8, meldorf": { lat: 54.0919128, lng: 9.0730915 },
  "friedrich-holm-weg 1, meldorf": { lat: 54.0905292, lng: 9.0854063 }, // Altenhilfezentrum
  "meldorf, brüttstraße 6": { lat: 54.0879819, lng: 9.0769762 }, // Tagespflege „Mook we gern"
  'hotel "zur linde", meldorf, südermarkt 1': { lat: 54.0903521, lng: 9.0725095 },
  "bargenstedt, dellbrück 15": { lat: 54.0997656, lng: 9.1828896 }, // Friesenhaus Dellbrück
  "bargenstedt, smeedbarg 2a": { lat: 54.0936708, lng: 9.1473061 },
  "gemeindehaus epenwöhrden": { lat: 54.1084099, lng: 9.051996 },
  "sarzbüttel, an der blockhütte": { lat: 54.1167, lng: 9.18333 }, // Ortsmitte (Blockhütte nicht in OSM)

  // --- Tellingstedt: drei Kirchen ohne Koordinate ---
  "friedenskirche wrohm": { lat: 54.2123552, lng: 9.3790302 },
  // Beide Schreibweisen aus ChurchDesk auf denselben geprüften Punkt.
  "st. martins-kirche": { lat: 54.219352, lng: 9.2752847 },
  "st. martins-kirche tellingstedt": { lat: 54.219352, lng: 9.2752847 },
  "st. remigius-kirche": { lat: 54.1479562, lng: 9.2822733 }, // Albersdorf
  "albersdorf | st. remigius kirche": { lat: 54.1479562, lng: 9.2822733 },

  // --- Albersdorf: Fremdorte über den Gemeinde-Fallback -----------------------
  "schafstedt grundschule": { lat: 54.0770405, lng: 9.3001471 },

  // --- Hennstedt: Turnhalle am Schulgelände ---
  "kleine turnhalle, hennstedt": { lat: 54.2874327, lng: 9.1630927 },

  // --- Weitere Orte ohne Ort-Objekt, eingemessen ---
  "lohe-rickelshof, kirche": { lat: 54.1873944, lng: 9.0706326 },
  // Nur dieser Einschulungsgottesdienst ist in der Schule.
  "schulhof watt´n meer school, wesselburen": { lat: 54.2119931, lng: 8.9166402 },
  // Trauercafé „Salzblüte", An d. Mühle 2, Büsum.
  salzblüte: { lat: 54.1352669, lng: 8.8667353 },
  // Marktandacht auf dem Rathausplatz Meldorf (Zingelstraße 2).
  "rathausplatz meldorf": { lat: 54.0893979, lng: 9.0738847 },
  // Andacht bei Boies im Garten, Osterhof 19 (Nordermeldorf/Thalingburen).
  "osterhof 19": { lat: 54.106539, lng: 9.037766 },

  // --- Pahlen und Delve: echte Kirchen und Ortsmitten statt eines Regionspunkts ---
  pahlen: { lat: 54.2628322, lng: 9.2956512 }, // Kirche, vom Nutzer geprüft
  delve: { lat: 54.3033433, lng: 9.2539684 }, // St. Marien
  "dörpling, wronbarg": { lat: 54.2601522, lng: 9.3042373 },
  tellingstedt: { lat: 54.219352, lng: 9.2752847 }, // St. Martin, vom Nutzer geprüft
};

/** Zuordnung über den Titel, nur ohne Ortsnamen, per Präfix auf dem normalisierten Titel. */
export const TITLE_COORD_FIXES: TitleCoordFix[] = [
  // Kirchenkiste auf der Watt'n Insel, eingemessen; gilt für alle Kirchenkiste-Termine (TITLE_OVERRIDES).
  { prefix: "willkommen in der kirchenkiste", coords: { lat: 54.1334736, lng: 8.8382318 } },
  // Treffpunkt ist die Fischerkirche St. Clemens.
  { prefix: "pilgern in büsum", coords: { lat: 54.1296131, lng: 8.861221 } },
  // Salzwiesen im Westen der Watt'n Insel.
  { prefix: "abendsegen bei sonnenuntergang", coords: { lat: 54.13673, lng: 8.8351529 } },

  // Trauercafé in der „Salzblüte“, Büsum.
  { prefix: "kaffee, licht & leben", coords: { lat: 54.1352669, lng: 8.8667353 } },
  // Marktandacht auf dem Rathausplatz Meldorf.
  { prefix: "marktandacht auf dem rathausplatz", coords: { lat: 54.0893979, lng: 9.0738847 } },
  // Andacht bei Boies im Garten, Osterhof 19.
  { prefix: "andacht bei boies im garten", coords: { lat: 54.106539, lng: 9.037766 } },
  // Nur die DaZ-Klassen feiern in der Schule.
  { prefix: "einschulungsgottesdienst daz-klassen", coords: { lat: 54.2119931, lng: 8.9166402 } },
  // St. Bartholomäus, sonst landet er 200 m daneben am Gemeindehaus.
  {
    prefix: "einschulungsgottesdienst watt´n meer school wesselburen",
    coords: { lat: 54.2120945, lng: 8.9225438 },
  },
  // Sportplatz Hennstedt.
  { prefix: "spendenlauf", coords: { lat: 54.2879255, lng: 9.1559349 } },
];

/** Titel-Präfixe, die auch eine gepflegte ChurchDesk-Adresse überstimmen, weil das Gelände eine Adresse für alle Orte hat. */
export const TITLE_OVERRIDES = [
  "willkommen in der kirchenkiste",
  "abendsegen bei sonnenuntergang",
];

/** Titel-basierte Zuordnung (nur wenn kein Ortsname gepflegt ist). */
export function coordFixForTitle(title: string | undefined): LatLng | undefined {
  if (!title) return undefined;
  const t = normalize(title);
  return TITLE_COORD_FIXES.find((e) => t.startsWith(e.prefix))?.coords;
}

/** Titel-Zuordnung für Reihen aus TITLE_OVERRIDES, sonst undefined. */
export function coordOverrideForTitle(title: string | undefined): LatLng | undefined {
  if (!title) return undefined;
  const t = normalize(title);
  if (!TITLE_OVERRIDES.some((p) => t.startsWith(p))) return undefined;
  return TITLE_COORD_FIXES.find((e) => t.startsWith(e.prefix))?.coords;
}

/** Korrigierte Koordinate eines Orts oder undefined. */
export function coordFixFor(locationName: string | undefined): LatLng | undefined {
  if (!locationName) return undefined;
  const key = normalize(locationName);
  // Nur eigene Einträge, „constructor“ träfe sonst Object.prototype.
  return Object.hasOwn(LOCATION_COORD_FIXES, key) ? LOCATION_COORD_FIXES[key] : undefined;
}



const PARISH_NORM: Record<string, LatLng> = Object.fromEntries(
  Object.entries(PARISH_COORDS).map(([k, v]) => [normalize(k), v])
);

/** Ermittelt Fallback-Koordinaten: erst über parish, dann orgId, dann Zentrum. */
export function fallbackCoords(parish: string | undefined, orgId: number): LatLng {
  if (parish) {
    const key = normalize(parish);
    if (Object.hasOwn(PARISH_NORM, key)) return PARISH_NORM[key];
    for (const [name, c] of Object.entries(PARISH_NORM)) {
      if (key.includes(name) || name.includes(key)) return c;
    }
  }
  return ORG_COORDS[orgId] ?? DITHMARSCHEN_CENTER;
}

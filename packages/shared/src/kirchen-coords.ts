// Fallback-Koordinaten für die ~10 % Events ohne event.locationObj.
// Generiert aus echten ChurchDesk-locationObj-Daten (häufigste Koordinate je Gemeinde/Org),
// daher real und stabil — Kirchenstandorte ändern sich nicht.

export interface LatLng {
  lat: number;
  lng: number;
}

/** Gemeinde-Name (wie in parishes[0].title) → Koordinate. */
export const PARISH_COORDS: Record<string, LatLng> = {
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
  "Kirchenkreis Dithmarschen": { lat: 54.010993, lng: 9.056248 },
  Lunden: { lat: 54.333612, lng: 9.024191 },
  Marne: { lat: 53.95351, lng: 9.012812 },
  Meldorf: { lat: 54.090562, lng: 9.074945 },
  // St. Jacobi. Fehlte hier — ohne Eintrag fiel Neuenkirchen auf die orgId 2729
  // (Kirchspiel West) zurück und landete rund 10 km entfernt in Büsum.
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
  2596: { lat: 54.010993, lng: 9.056248 },
  2619: { lat: 54.090562, lng: 9.074945 },
  2715: { lat: 54.045977, lng: 9.115475 },
  2718: { lat: 54.165051, lng: 8.997713 },
  2720: { lat: 53.898038, lng: 9.141931 },
  2722: { lat: 54.20102, lng: 9.075 }, // Lohe-Rickelshof (nahe Heide; kein eigenes Event-Sample)
  2723: { lat: 54.158, lng: 9.187 }, // Pahlen / Delve (Geest; grobe Region)
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

/**
 * Korrekturen für Orte, die ChurchDesk auf eine falsche Koordinate geokodiert.
 *
 * Hintergrund: ChurchDesk geokodiert über die eingetragene ADRESSE. Sind Kirche und
 * Pastorat/Gemeindehaus unter derselben Anschrift gepflegt (Wesselburen: beides
 * „Marktstr. 2"), bekommen beide exakt dieselbe Koordinate — ein Pin liegt dann
 * unsichtbar unter dem anderen, egal wie weit man zoomt. Der Gottesdienst in der
 * Kirche war dadurch auf der Karte nicht auffindbar.
 *
 * Schlüssel = locationName (normalisiert), Wert = tatsächliche Position.
 * Quelle der Koordinaten: OpenStreetMap (Gebäude-Geometrie).
 *
 * Diese Tabelle greift VOR der ChurchDesk-Koordinate — sie ist die Wahrheit für
 * die hier genannten Orte. Neue Fälle einfach ergänzen.
 */
export const LOCATION_COORD_FIXES: Record<string, LatLng> = {
  // Kirche liegt 63 m südöstlich des Pastorats (beide „Marktstr. 2" in ChurchDesk).
  "wesselburen | st. bartholomäus": { lat: 54.2120945, lng: 8.9225438 },
  // ChurchDesk liefert für diese Termine gar keine Koordinaten. Der Fallback über
  // PARISH_COORDS greift zwar, aber nur solange „Neuenkirchen" als parish gesetzt
  // ist — hier zusätzlich am Ortsnamen festmachen.
  "neuenkirchen | st. jacobi": { lat: 54.23672, lng: 8.9898787 },
};

/**
 * Liefert eine korrigierte Koordinate für einen Ort — oder undefined, wenn der
 * Ort nicht in der Korrekturtabelle steht (dann gilt die ChurchDesk-Angabe).
 */
export function coordFixFor(locationName: string | undefined): LatLng | undefined {
  if (!locationName) return undefined;
  return LOCATION_COORD_FIXES[normalize(locationName)];
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

const PARISH_NORM: Record<string, LatLng> = Object.fromEntries(
  Object.entries(PARISH_COORDS).map(([k, v]) => [normalize(k), v])
);

/** Ermittelt Fallback-Koordinaten: erst über parish, dann orgId, dann Zentrum. */
export function fallbackCoords(parish: string | undefined, orgId: number): LatLng {
  if (parish) {
    const key = normalize(parish);
    if (PARISH_NORM[key]) return PARISH_NORM[key];
    for (const [name, c] of Object.entries(PARISH_NORM)) {
      if (key.includes(name) || name.includes(key)) return c;
    }
  }
  return ORG_COORDS[orgId] ?? DITHMARSCHEN_CENTER;
}

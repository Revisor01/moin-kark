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
  // Kirchenkreis-Termine (Freizeiten, Fortbildungen, überörtliche Angebote) haben
  // oft gar keinen Ort in Dithmarschen — Schweden, Bispingen, wechselnde Häuser.
  // Sie werden bewusst am Kirchenkreis-Sitz Meldorf angesiedelt: So bleiben sie in
  // Karte UND Liste sichtbar und damit buchbar, statt an einem willkürlichen Punkt
  // südlich der Stadt zu hängen.
  "Kirchenkreis Dithmarschen": { lat: 54.090562, lng: 9.074945 },
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
  2596: { lat: 54.090562, lng: 9.074945 }, // Kirchenkreis Dithmarschen → Sitz Meldorf
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

  // --- Meldorf: Orte OHNE Ort-Objekt in ChurchDesk ---------------------------
  // Der Ortsname steht dort nur im Freitextfeld, es gibt keine Koordinate. Alle
  // neun Orte landeten deshalb über den Gemeinde-Fallback auf demselben Punkt
  // (Meldorfer Dom) — quer über den Kreis verteilte Termine auf einer Nadel.
  "ev. gemeinschaft, bütjestraße 8, meldorf": { lat: 54.0919128, lng: 9.0730915 },
  "friedrich-holm-weg 1, meldorf": { lat: 54.0905292, lng: 9.0854063 }, // Altenhilfezentrum
  "meldorf, brüttstraße 6": { lat: 54.0879819, lng: 9.0769762 }, // Tagespflege „Mook we gern"
  'hotel "zur linde", meldorf, südermarkt 1': { lat: 54.0903521, lng: 9.0725095 },
  "bargenstedt, dellbrück 15": { lat: 54.0997656, lng: 9.1828896 }, // Friesenhaus Dellbrück
  "bargenstedt, smeedbarg 2a": { lat: 54.0936708, lng: 9.1473061 },
  "gemeindehaus epenwöhrden": { lat: 54.1084099, lng: 9.051996 },
  "sarzbüttel, an der blockhütte": { lat: 54.1167, lng: 9.18333 }, // Ortsmitte (Blockhütte nicht in OSM)

  // --- Tellingstedt: drei verschiedene Kirchen auf einem Punkt ----------------
  // Alle drei ohne Koordinate in ChurchDesk → Gemeinde-Fallback Tellingstedt.
  // Wrohm liegt ~7 km östlich, Albersdorf ~9 km südlich.
  "friedenskirche wrohm": { lat: 54.2123552, lng: 9.3790302 },
  // Beide Schreibweisen aus ChurchDesk auf denselben geprüften Punkt.
  "st. martins-kirche": { lat: 54.219352, lng: 9.2752847 },
  "st. martins-kirche tellingstedt": { lat: 54.219352, lng: 9.2752847 },
  "st. remigius-kirche": { lat: 54.1479562, lng: 9.2822733 }, // Albersdorf
  "albersdorf | st. remigius kirche": { lat: 54.1479562, lng: 9.2822733 },

  // --- Albersdorf: Fremdorte über den Gemeinde-Fallback -----------------------
  "schafstedt grundschule": { lat: 54.0770405, lng: 9.3001471 },

  // --- Hennstedt -------------------------------------------------------------
  // Turnhalle am Schulgelände (Eider-Nordsee-Schule), lag vorher auf dem
  // Kirchenpunkt. Koordinate vom Nutzer geprüft.
  "kleine turnhalle, hennstedt": { lat: 54.2874327, lng: 9.1630927 },

  // --- Weitere Orte ohne Ort-Objekt in ChurchDesk (vom Nutzer eingemessen) ----
  // Christuskirche, Kirchenallee 14. Der bisherige Punkt war im Code nur als
  // „nahe Heide, kein eigenes Event-Sample" geschätzt.
  "lohe-rickelshof, kirche": { lat: 54.1873944, lng: 9.0706326 },
  // Watt'n Meer School, Ekenesch 15 Wesselburen. Nur DIESER eine Einschulungs-
  // gottesdienst ist in der Schule — die anderen sind in St. Bartholomäus bzw.
  // St. Jacobi (s. TITLE_COORD_FIXES unten).
  "schulhof watt´n meer school, wesselburen": { lat: 54.2119931, lng: 8.9166402 },
  // Trauercafé „Salzblüte", An d. Mühle 2, Büsum.
  salzblüte: { lat: 54.1352669, lng: 8.8667353 },
  // Marktandacht auf dem Rathausplatz Meldorf (Zingelstraße 2).
  "rathausplatz meldorf": { lat: 54.0893979, lng: 9.0738847 },
  // Andacht bei Boies im Garten, Osterhof 19 (Nordermeldorf/Thalingburen).
  "osterhof 19": { lat: 54.106539, lng: 9.037766 },

  // --- Pahlen und Delve: bisher EIN grober Geest-Punkt für vier Orte ---------
  // ORG_COORDS[2723] war mit „grobe Region" kommentiert und lag ~10 km neben
  // allen vier Orten. Hier die tatsächlichen Kirchen bzw. Ortsmitten.
  pahlen: { lat: 54.2628322, lng: 9.2956512 }, // Kirche, vom Nutzer geprüft
  delve: { lat: 54.3033433, lng: 9.2539684 }, // St. Marien
  "dörpling, wronbarg": { lat: 54.2601522, lng: 9.3042373 },
  tellingstedt: { lat: 54.219352, lng: 9.2752847 }, // St. Martin, vom Nutzer geprüft
};

/**
 * Zuordnung über den TITEL — Notnagel für Termine, die in ChurchDesk weder ein
 * Ort-Objekt noch einen Ortsnamen haben. Ohne das landen sie auf dem
 * Gemeindepunkt (Urlauberseelsorge Büsum: 31 Termine auf einer Nadel).
 *
 * Greift NUR, wenn kein Ortsname vorhanden ist — eine gepflegte Ortsangabe hat
 * immer Vorrang. Der Vergleich ist ein Präfix-Match auf dem normalisierten Titel,
 * damit Varianten wie „Kirchenkiste" / „Kirchenkiste!" beide erfasst werden.
 */
export const TITLE_COORD_FIXES: Array<{ prefix: string; coords: LatLng }> = [
  // Die Kirchenkiste steht auf der „Watt'n Insel" in der Familienlagune. ChurchDesk
  // setzt für alle Termine dort die Gelände-Adresse (Nordseestraße 79X) — die
  // Kiste selbst steht aber an einer bestimmten Stelle. Diese Koordinate ist die
  // genauere (vom Nutzer eingemessen) und gilt für ALLE Kirchenkiste-Termine,
  // auch die mit gepflegtem Ortsnamen (s. TITLE_OVERRIDES unten).
  { prefix: "willkommen in der kirchenkiste", coords: { lat: 54.1334736, lng: 8.8382318 } },
  // Treffpunkt ist die Fischerkirche St. Clemens.
  { prefix: "pilgern in büsum", coords: { lat: 54.1296131, lng: 8.861221 } },
  // Nicht bei der Kirchenkiste, sondern bei den Salzwiesen ganz im Westen der
  // Watt'n Insel („Nördlicher Aufgang zur Lagune", s. Beschreibung im Termin).
  { prefix: "abendsegen bei sonnenuntergang", coords: { lat: 54.13673, lng: 8.8351529 } },

  // Termine ohne Ort-Objekt, deren Ort nur im Titel steht:
  // Trauercafé in der „Salzblüte", An d. Mühle 2, Büsum.
  { prefix: "kaffee, licht & leben", coords: { lat: 54.1352669, lng: 8.8667353 } },
  // Marktandacht auf dem Rathausplatz Meldorf.
  { prefix: "marktandacht auf dem rathausplatz", coords: { lat: 54.0893979, lng: 9.0738847 } },
  // Andacht bei Boies im Garten, Osterhof 19.
  { prefix: "andacht bei boies im garten", coords: { lat: 54.106539, lng: 9.037766 } },
  // Nur die DaZ-Klassen feiern in der Schule (Ekenesch 15). Die beiden anderen
  // Einschulungsgottesdienste sind in St. Bartholomäus bzw. St. Jacobi — die
  // laufen ueber die Gemeinde-Fallbacks korrekt und brauchen keinen Eintrag.
  { prefix: "einschulungsgottesdienst daz-klassen", coords: { lat: 54.2119931, lng: 8.9166402 } },
  // Der Wesselburener Einschulungsgottesdienst ist in St. Bartholomäus. Ohne
  // Eintrag landet er über den Gemeinde-Fallback am Gemeindehaus (200 m daneben).
  {
    prefix: "einschulungsgottesdienst watt´n meer school wesselburen",
    coords: { lat: 54.2120945, lng: 8.9225438 },
  },
];

/**
 * Titel-Präfixe, deren Koordinate auch eine gepflegte ChurchDesk-Angabe ÜBERSTIMMT.
 *
 * Normalerweise gewinnt die Ortsangabe aus ChurchDesk. Hier ist es umgekehrt: Auf
 * dem Gelände der Familienlagune tragen alle Termine dieselbe Adresse, obwohl sie
 * an verschiedenen Stellen stattfinden (Kirchenkiste vs. Salzwiesen im Westen).
 * Für die hier genannten Reihen ist die eingemessene Koordinate die verlässlichere.
 */
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

/**
 * Titel-Zuordnung, die auch eine gepflegte ChurchDesk-Koordinate überstimmt.
 * Nur für Reihen aus TITLE_OVERRIDES — sonst undefined.
 */
export function coordOverrideForTitle(title: string | undefined): LatLng | undefined {
  if (!title) return undefined;
  const t = normalize(title);
  if (!TITLE_OVERRIDES.some((p) => t.startsWith(p))) return undefined;
  return TITLE_COORD_FIXES.find((e) => t.startsWith(e.prefix))?.coords;
}

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

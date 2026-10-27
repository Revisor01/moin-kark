// Geteilte GeoJSON-Typen von API und App.

export interface EventCategory {
  id: number;
  title: string;
  /** ChurchDesk-Farbindex (0..n) — wird im UI auf eine Palette gemappt. */
  color: number;
}

export interface EventImage {
  /** Beste verfügbare Bild-URL (i.d.R. span4_16-9). */
  url: string;
  title?: string;
  copyright?: string;
}

/** Herkunft der Koordinate: ChurchDesk, Gemeinde-/Org-Tabelle oder Korrektur. */
export type CoordSource = "event" | "fallback" | "fix";

/** Properties eines Event-Features. Felder kommen voll aus der ChurchDesk-API. */
export interface EventProps {
  /** event.id — global eindeutig, Dedup-Key. */
  id: number;
  title: string;
  /** Roh-UTC aus der API ("…Z"). Anzeige clientseitig in Europe/Berlin. */
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  /** Ob die Endzeit angezeigt werden soll (ChurchDesk showEndtime). */
  showEndtime: boolean;
  summary?: string;
  /** HTML — beim Rendern sanitizen (Web) / strippen (Native). */
  descriptionHtml?: string;
  image?: EventImage;
  categories: EventCategory[];
  contributor?: string;
  /** Kirchengemeinde (parishes[0].title) — Anzeige-Kurzform und Abwärtskompatibilität. */
  parish?: string;
  /** Alle Gemeinden bei Mehrfachzuordnung, sonst nicht gesetzt. */
  parishes?: string[];
  /** Abgeleitetes Kirchspiel (aus orgId-Mapping). */
  kirchspiel: string;
  /** ChurchDesk-Organisation, aus der das Event stammt. */
  orgId: number;
  orgName: string;
  /** Anzeige-Ort: locationName || location. */
  locationName?: string;
  address?: string;
  city?: string;
  zipcode?: string;
  price?: string;
  /** Woher die Koordinaten stammen (QA-Transparenz). */
  coordSource: CoordSource;
  /** Redaktionelles „KAT: Highlight" — Event besonders hervorheben (Liste + Karte). */
  highlight?: boolean;
}

export interface EventFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    /** [longitude, latitude] — GeoJSON-Reihenfolge! */
    coordinates: [number, number];
  };
  properties: EventProps;
}

export interface EventFeatureCollection {
  type: "FeatureCollection";
  features: EventFeature[];
  /** Meta-Infos für QA/Debugging — nicht teil des GeoJSON-Standards, aber harmlos. */
  meta?: {
    generatedAt: string;
    /** Zeitpunkt, zu dem der Stand angefordert wurde (nicht der Fensterbeginn — s. windowFrom). */
    from: string;
    /** Zeitpunkt am letzten Tag des Fensters (s. windowTo). */
    to: string;
    /** Erster Berliner Kalendertag des Fensters; optional, weil ältere Feeds ihn nicht tragen. */
    windowFrom?: string;
    /** Letzter Kalendertag des Abfragefensters in Europe/Berlin (YYYY-MM-DD). */
    windowTo?: string;
    total: number;
    withEventCoords: number;
    withFallbackCoords: number;
    orgsOk: number;
    orgsFailed: number;
    /** Orgs ohne Antwort beim letzten Refresh, deren Termine nicht als entfallen gelten; optional für ältere Feeds. */
    orgsFailedIds?: number[];
    /** Organisationen mit gesetztem Token (= abgefragt: orgsOk + orgsFailed). */
    orgsConfigured?: number;
    /** Organisationen OHNE Token — werden gar nicht abgefragt, ihre Termine fehlen dauerhaft. */
    orgsMissing?: number;
  };
}

/** Eintrag in `/categories.json`, die Antwort ist ein Array davon. */
export interface FeedCategory {
  /** Anzeigetitel — die erste gesehene Schreibweise. */
  title: string;
  /** ChurchDesk-Farbindex (0..n). */
  color: number;
  /** Anzahl Events mit dieser Kategorie im Feed. */
  count: number;
}

/** Die eine Schlüssel-Normalisierung für Tabellen und /admin-Korrekturen. */
export function normalizeKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

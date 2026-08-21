// Geteilte GeoJSON-Typen: vom Proxy erzeugt, von der App gerendert.
// Single Source of Truth — verhindert Drift zwischen Backend und Frontend.

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

/**
 * „event" = Koordinate aus ChurchDesk, „fallback" = aus der Gemeinde-/Org-Tabelle,
 * „fix" = manuell korrigiert (ChurchDesk hatte den Ort falsch geokodiert).
 */
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
  /**
   * ALLE zugeordneten Kirchengemeinden, wenn das Event in ChurchDesk mehreren
   * Gemeinden gehört (z.B. Kirchspiel-weite Termine wie die Sommerkirche).
   * Nur gesetzt bei Mehrfachzuordnung; sonst gilt `parish` allein.
   */
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
    from: string;
    to: string;
    total: number;
    withEventCoords: number;
    withFallbackCoords: number;
    orgsOk: number;
    orgsFailed: number;
  };
}

/**
 * Einheitliche Schlüssel-Normalisierung für Orts-, Gemeinde- und Titel-Vergleiche.
 *
 * Bewusst an EINER Stelle: An dieser Funktion hängen die statischen Tabellen
 * (kirchspiele.ts, kirchen-coords.ts) UND die über /admin gepflegten Korrekturen
 * in der API. Driftet eine Kopie, greifen gepflegte Korrekturen still nicht mehr.
 */
export function normalizeKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

// Platzhalterbilder: Ortsmotiv nur bei der eigenen Gemeinde, je Motiv quadratisch (Liste) und `-wide` (Detail).

const PH_DEICH = require("../assets/ph-deich.jpg");
const PH_KOHL = require("../assets/ph-kohl.jpg");
const PH_DEICH_WIDE = require("../assets/ph-deich-wide.jpg");
const PH_KOHL_WIDE = require("../assets/ph-kohl-wide.jpg");

/** Neutrale Motive für Gemeinden ohne eigenes Bild (Reihenfolge = Rotation). */
const NEUTRAL = [PH_DEICH, PH_KOHL] as const;
const NEUTRAL_WIDE = [PH_DEICH_WIDE, PH_KOHL_WIDE] as const;

/** Motiv je `parish` bzw. `city` in ChurchDesk-Schreibweise (kleingeschrieben); `parish` greift zuerst. */
const ORT_PLACEHOLDERS: Record<string, number> = {
  büsum: require("../assets/ph-buesum.jpg"),
  meldorf: require("../assets/ph-meldorf.jpg"),
  wesselburen: require("../assets/ph-wesselburen.jpg"),
  hennstedt: require("../assets/ph-hennstedt.jpg"),
  brunsbüttel: require("../assets/ph-brunsbuettel.jpg"),
  "st. michaelisdonn": require("../assets/ph-michaelisdonn.jpg"),
  marne: require("../assets/ph-marne.jpg"),
  albersdorf: require("../assets/ph-albersdorf.jpg"),
  burg: require("../assets/ph-burg.jpg"),
  "kg heide": require("../assets/ph-heide.jpg"),
  eddelak: require("../assets/ph-eddelak.jpg"),
  "pahlen und delve": require("../assets/ph-pahlen.jpg"),
  weddingstedt: require("../assets/ph-weddingstedt.jpg"),
  wöhrden: require("../assets/ph-woehrden.jpg"),
  "vereinigte süderdithmarscher köge": require("../assets/ph-koege.jpg"),
  neuenkirchen: require("../assets/ph-neuenkirchen.jpg"),
  "kirche wesseln": require("../assets/ph-wesseln.jpg"),
  "kg hemmingstedt": require("../assets/ph-hemmingstedt.jpg"),
};

/** Dieselben Motive im Panorama-Zuschnitt (Detailansicht). */
const ORT_PLACEHOLDERS_WIDE: Record<string, number> = {
  büsum: require("../assets/ph-buesum-wide.jpg"),
  meldorf: require("../assets/ph-meldorf-wide.jpg"),
  wesselburen: require("../assets/ph-wesselburen-wide.jpg"),
  hennstedt: require("../assets/ph-hennstedt-wide.jpg"),
  brunsbüttel: require("../assets/ph-brunsbuettel-wide.jpg"),
  "st. michaelisdonn": require("../assets/ph-michaelisdonn-wide.jpg"),
  marne: require("../assets/ph-marne-wide.jpg"),
  albersdorf: require("../assets/ph-albersdorf-wide.jpg"),
  burg: require("../assets/ph-burg-wide.jpg"),
  "kg heide": require("../assets/ph-heide-wide.jpg"),
  eddelak: require("../assets/ph-eddelak-wide.jpg"),
  "pahlen und delve": require("../assets/ph-pahlen-wide.jpg"),
  weddingstedt: require("../assets/ph-weddingstedt-wide.jpg"),
  wöhrden: require("../assets/ph-woehrden-wide.jpg"),
  "vereinigte süderdithmarscher köge": require("../assets/ph-koege-wide.jpg"),
  neuenkirchen: require("../assets/ph-neuenkirchen-wide.jpg"),
  "kirche wesseln": require("../assets/ph-wesseln-wide.jpg"),
  "kg hemmingstedt": require("../assets/ph-hemmingstedt-wide.jpg"),
};

/** Platzhalter eines Events, sonst stabil nach Event-ID rotierend; `variant` wählt nur den Zuschnitt. */
export function placeholderFor(
  id: number,
  parish?: string,
  city?: string,
  variant: "card" | "wide" = "card"
) {
  const table = variant === "wide" ? ORT_PLACEHOLDERS_WIDE : ORT_PLACEHOLDERS;
  for (const name of [parish, city]) {
    const key = name?.trim().toLowerCase();
    // Object.hasOwn: Ortsnamen wie „constructor" träfen sonst die Prototypkette.
    if (key && Object.hasOwn(table, key)) return table[key];
  }
  const pool = variant === "wide" ? NEUTRAL_WIDE : NEUTRAL;
  // Math.abs, weil der Modulo negativer Zahlen in JS negativ bleibt.
  return pool[Math.abs(id) % pool.length];
}

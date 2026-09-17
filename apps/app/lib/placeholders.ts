// Platzhalter-Bilder für Veranstaltungen ohne eigenes Foto.
//
// Ortsbilder NUR bei der Gemeinde, zu der sie gehören: ein Meldorfer Dom über
// einem Büsumer Termin wäre irreführend. Für alle anderen Gemeinden bleiben die
// neutralen Landschaftsmotive (Deich, Kohlfeld) — die passen überall in Dithmarschen.
//
// Die Kirchen sind gezeichnet, nicht fotografiert, und zeigen das jeweils
// namengebende Haus: Jakobuskirche Brunsbüttel, St.-Michaelis St. Michaelisdonn,
// Maria-Magdalenen Marne, St. Remigius Albersdorf, Petri-Kirche Burg,
// St.-Jürgen Heide, St. Clemens Büsum.
//
// Jedes Motiv liegt in ZWEI Zuschnitten vor, weil die beiden Anzeigeorte
// gegensätzliche Formate haben:
//
//   - Liste  (`EventCard`):  ~96 × 98 pt, also fast quadratisch → `…​.jpg`
//   - Detail (`EventSheet`): volle Breite × 200 pt, also breit   → `…-wide.jpg`
//
// Vorher gab es nur den breiten Zuschnitt (900 × 381 ≈ 2,36:1). In der Liste
// skalierte ihn `cover` auf die Höhe und schnitt links und rechts ab — übrig
// blieben 41 % der Breite, bei Hennstedt genau der Turm: zu sehen war nur die
// Spitze, das Kirchenschiff lag außerhalb. Die Zuschnitte sind deshalb je Motiv
// von Hand gesetzt (der Leuchtturm in Büsum steht rechts, nicht mittig); die
// `…-wide.jpg` sind die unveränderten Originale, aus denen sie entstanden sind.
//
// Wächst der Bestand, kommt das Motiv in BEIDEN Fassungen dazu (Schlüssel =
// parish bzw. city, kleingeschrieben).

const PH_DEICH = require("../assets/ph-deich.jpg");
const PH_KOHL = require("../assets/ph-kohl.jpg");
const PH_DEICH_WIDE = require("../assets/ph-deich-wide.jpg");
const PH_KOHL_WIDE = require("../assets/ph-kohl-wide.jpg");

/** Neutrale Motive für Gemeinden ohne eigenes Bild (Reihenfolge = Rotation). */
const NEUTRAL = [PH_DEICH, PH_KOHL] as const;
const NEUTRAL_WIDE = [PH_DEICH_WIDE, PH_KOHL_WIDE] as const;

/**
 * Gemeinde/Ort → eigenes Motiv, quadratischer Zuschnitt (Liste).
 *
 * Schlüssel ist `parish` bzw. `city` in Kleinschreibung, so wie sie aus
 * ChurchDesk kommen — deshalb steht hier „kg heide" mit Präfix und
 * „st. michaelisdonn" in der Schreibweise des Kirchspiels. Der Ort schwankt
 * dort zwischen „Sankt" und „St."; weil `parish` zuerst greift, genügt ein
 * Eintrag.
 */
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
};

/**
 * Liefert das Platzhalter-Motiv für ein Event.
 *
 * Gibt es ein Bild für die Gemeinde (parish) oder den Ort (city), kommt dieses —
 * sonst stabil rotierend eines der neutralen Motive. Die Auswahl hängt an der
 * Event-ID, nicht am Zufall: Dasselbe Event bekommt beim Scrollen, nach dem
 * Neuladen und im Detail-Sheet immer dasselbe Motiv.
 *
 * `variant` wählt nur den Zuschnitt, nie ein anderes Motiv — Liste und Detail
 * zeigen also dieselbe Kirche, einmal quadratisch und einmal breit.
 */
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

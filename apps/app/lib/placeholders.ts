// Platzhalter-Bilder für Veranstaltungen ohne eigenes Foto.
//
// Ortsbilder NUR bei der Gemeinde, zu der sie gehören: ein Meldorfer Dom über
// einem Büsumer Termin wäre irreführend. Für alle anderen Gemeinden bleiben die
// neutralen Landschaftsmotive (Deich, Kohlfeld) — die passen überall in Dithmarschen.
//
// Wächst der Bestand an Ortsbildern, kommt die Datei einfach in ORT_PLACEHOLDERS
// dazu (Schlüssel = parish bzw. city, kleingeschrieben).
const PH_DEICH = require("../assets/ph-deich.jpg");
const PH_KOHL = require("../assets/ph-kohl.jpg");

/** Neutrale Motive für Gemeinden ohne eigenes Bild. */
const NEUTRAL = [PH_DEICH, PH_KOHL] as const;

/** Gemeinde/Ort → eigenes Motiv. Schlüssel kleingeschrieben. */
const ORT_PLACEHOLDERS: Record<string, number> = {
  büsum: require("../assets/ph-buesum.jpg"),
  meldorf: require("../assets/ph-meldorf.jpg"),
  wesselburen: require("../assets/ph-wesselburen.jpg"),
  hennstedt: require("../assets/ph-hennstedt.jpg"),
};

/**
 * Liefert das Platzhalter-Motiv für ein Event.
 *
 * Gibt es ein Bild für die Gemeinde (parish) oder den Ort (city), kommt dieses —
 * sonst stabil rotierend eines der neutralen Motive. Die Auswahl hängt an der
 * Event-ID, nicht am Zufall: Dasselbe Event bekommt beim Scrollen, nach dem
 * Neuladen und im Detail-Sheet immer dasselbe Bild.
 */
export function placeholderFor(id: number, parish?: string, city?: string) {
  for (const name of [parish, city]) {
    const hit = name && ORT_PLACEHOLDERS[name.trim().toLowerCase()];
    if (hit) return hit;
  }
  // Math.abs, weil der Modulo negativer Zahlen in JS negativ bleibt.
  return NEUTRAL[Math.abs(id) % NEUTRAL.length];
}

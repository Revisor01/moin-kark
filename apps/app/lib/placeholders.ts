// Platzhalter-Bilder für Veranstaltungen ohne eigenes Foto.
//
// Statt eines einzigen Motivs rotieren sechs Dithmarschen-Illustrationen —
// sonst sieht eine Liste ohne Event-Bilder aus wie ein Kopierfehler.
//
// Die Auswahl hängt an der Event-ID, nicht am Zufall: Dasselbe Event bekommt
// beim Scrollen, nach dem Neuladen und im Detail-Sheet immer dasselbe Bild.
const PLACEHOLDERS = [
  require("../assets/ph-deich.jpg"),
  require("../assets/ph-kohl.jpg"),
  require("../assets/ph-buesum.jpg"),
  require("../assets/ph-meldorf.jpg"),
  require("../assets/ph-wesselburen.jpg"),
  require("../assets/ph-hennstedt.jpg"),
] as const;

/** Liefert für eine Event-ID stabil dasselbe Platzhalter-Motiv. */
export function placeholderFor(id: number) {
  // Math.abs, weil der Modulo negativer Zahlen in JS negativ bleibt.
  return PLACEHOLDERS[Math.abs(id) % PLACEHOLDERS.length];
}

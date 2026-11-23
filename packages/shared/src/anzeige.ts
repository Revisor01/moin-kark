// Anzeige-Namen aus den Kalenderangaben; `parish` und `title` bleiben unverändert, weil ausgelieferte Apps sie lesen.

/** Mehrfache Leerzeichen zusammenziehen, Leerzeichen vor Komma und Doppelpunkt entfernen. */
function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([,;:])/g, "$1")
    .trim();
}

/** Verwaltungs-Vorsätze vor dem Ortsnamen, längste zuerst. */
const PARISH_PREFIXES = [
  /^ev\.?-luth\.?\s+kirchengemeinde\s+/i,
  /^ev\.?\s+kirchengemeinde\s+/i,
  /^kirchengemeinde\s+/i,
  /^kg\.?\s+/i,
  /^kirche\s+/i,
];

/** „KG  Nordhastedt“ → „Nordhastedt“, „Kirche Wesseln“ → „Wesseln“; sonst nur Leerzeichen bereinigt. */
export function parishLabel(parish: string): string {
  let s = tidy(parish);
  for (const re of PARISH_PREFIXES) {
    const kurz = s.replace(re, "");
    if (kurz !== s && kurz.length > 0) {
      s = kurz;
      break;
    }
  }
  return s;
}

/** Kurze Wörter, die mitten im Titel klein bleiben, wenn ein GROSS geschriebener Abschnitt umgesetzt wird. */
const KLEINWOERTER = new Set([
  "am", "an", "auf", "aus", "bei", "das", "dem", "den", "der", "des", "die", "für", "im", "in",
  "mit", "um", "und", "vom", "von", "zu", "zum", "zur",
]);

const GROSS = /^[A-ZÄÖÜ]{3,}$/;

/** Abschnitte aus mindestens zwei GROSS geschriebenen Wörtern normal setzen; einzelne Abkürzungen (FRIDA, TSV) bleiben. */
function entschaerfeVersalien(s: string): string {
  const woerter = s.split(" ");
  const istGross = woerter.map((w) => GROSS.test(w.replace(/[^\p{L}]/gu, "")));
  return woerter
    .map((w, i) => {
      const imLauf = istGross[i] && (istGross[i - 1] || istGross[i + 1]);
      if (!imLauf) return w;
      const lower = w.toLowerCase();
      const satzanfang = i === 0 || /[-–:|.]$/.test(woerter[i - 1] ?? "");
      if (!satzanfang && KLEINWOERTER.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Titel ohne Klammerzusätze, „(Kopie)“ und angehängte Leitung; Leerzeichen und Versalien bereinigt. */
export function titleShort(title: string): string {
  let s = tidy(title);
  // Klammern auch verschachtelt entfernen, innen zuerst.
  let vorher: string;
  do {
    vorher = s;
    s = s.replace(/\s*\([^()]*\)/g, "");
  } while (s !== vorher);
  s = s.replace(/,\s*Leitung:\s*[^,]+$/i, "");
  s = entschaerfeVersalien(tidy(s));
  // Reste wie ein Bindestrich am Ende.
  s = s.replace(/[\s,;:–-]+$/, "").trim();
  return s.length >= 3 ? s : tidy(title);
}

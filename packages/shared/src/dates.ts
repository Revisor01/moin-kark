// Kalendertag in Europe/Berlin — EINE Implementierung für API und App.
//
// Vorher gab es dieselbe Logik viermal (API-Abfragefenster, Tageswechsel-Refetch,
// „heute/morgen" in Erinnerungen, Datumsfilter). Alle lösten dasselbe Problem:
// Der Tag wechselt in Berlin, nicht in UTC.

const BERLIN_TZ = "Europe/Berlin";

/**
 * Kalendertag in Europe/Berlin als YYYY-MM-DD.
 *
 * Bewusst NICHT toISOString(): das liefert immer UTC. Zwischen Mitternacht und
 * 01:00 (Winter) bzw. 02:00 (Sommer) Berliner Zeit ist das UTC-Datum noch der
 * Vortag — ein daraus gebildetes Abfragefenster begänne nachts beim Vortag und
 * schlösse bereits gelaufene Events ein. Die TZ-Umgebungsvariable des Prozesses
 * spielt keine Rolle, die Zone steht hier fest.
 *
 * en-CA liefert das Datum als ISO-Form; die Feldoptionen sind ausdrücklich
 * gesetzt, damit keine Engine (Node/ICU, Hermes) auf ein anderes Kurzformat
 * ausweicht.
 */
export function berlinDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

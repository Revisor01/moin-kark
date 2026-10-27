// Berliner Kalendertag, eine Implementierung für API und App.

const BERLIN_TZ = "Europe/Berlin";

/** Berliner Kalendertag als YYYY-MM-DD; nicht toISOString(), das wäre nachts noch der Vortag. */
export function berlinDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

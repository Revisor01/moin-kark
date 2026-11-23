// Adresszeile und Seitentitel der Web-Karte folgen dem geöffneten Termin, damit Kopieren und Verlauf den Termin treffen.

const START_TITLE = "Moin Kark – Termine der Kirche in Dithmarschen auf einer Karte";

/** Pfad mit Termin; andere Parameter bleiben erhalten. */
export function addressFor(currentSearch: string, eventId: number | null): string {
  const params = new URLSearchParams(currentSearch);
  if (eventId === null) params.delete("event");
  else params.set("event", String(eventId));
  const q = params.toString();
  return q ? `/?${q}` : "/";
}

export function pageTitleFor(eventTitle: string | null): string {
  return eventTitle ? `${eventTitle} – Moin Kark` : START_TITLE;
}

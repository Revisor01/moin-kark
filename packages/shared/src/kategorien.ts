// Kategorien aller Gemeinden auf einen Namen bringen, serverseitig am Event, weil die App per String filtert; Gottesdienst und Andacht bleiben getrennt.

import { normalizeKey } from "./types";

/** Schreibweise → kanonischer Name, Schlüssel normalisiert und um Schrägstriche entklammert. */
const ZUSAMMENLEGUNG: Record<string, string> = {};

function eintragen(kanonisch: string, schreibweisen: string[]): void {
  for (const s of schreibweisen) ZUSAMMENLEGUNG[schluessel(s)] = kanonisch;
}

/** Wie `normalizeKey`, aber ohne Leerraum um Schrägstriche und Bindestriche. */
function schluessel(s: string): string {
  return normalizeKey(s).replace(/\s*([/-])\s*/g, "$1");
}

eintragen("Kinder & Jugend", [
  "Kinder/Jugendliche",
  "Kinder / Jugendliche",
  "Kinder u. Jugend",
  "Kinder- und Jugendarbeit",
  "Kinder und Jugendliche",
  "Kinder & Familien",
  "Kinder- und Jugendwerk",
  "Jugendarbeit",
]);

eintragen("Kirchenmusik", [
  "Kirchenmusik",
  "Musikalische Proben",
  "Musikalische Probe",
  "Chor",
  "Chorproben",
]);

eintragen("Konzerte", ["Konzerte", "Konzert"]);
eintragen("Treffpunkt", ["Treffpunkt", "Treffpunkte", "Treffen"]);
eintragen("Senioren", ["Senioren", "Senior:innen"]);

// Die Mischform gehört zum Gottesdienst; „Andacht" allein bleibt eigenständig.
eintragen("Gottesdienst", ["Gottesdienst", "Gottesdienst - Andacht"]);

/** Kanonischer Name; Unbekanntes kommt nur getrimmt zurück, damit Neues nicht verschwindet. */
export function kanonischeKategorie(titel: string): string {
  return ZUSAMMENLEGUNG[schluessel(titel)] ?? titel.trim();
}

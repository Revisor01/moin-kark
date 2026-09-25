// Kategorien über die Gemeinden hinweg auf einen Namen bringen.
//
// In ChurchDesk benennt jede Gemeinde ihre Kategorien selbst. Dieselbe Sache
// heißt dadurch bis zu achtmal anders und erscheint im Filter als acht Knöpfe.
// Gemessen am 25.09.2026 im Feed: 215 Kinder/Jugend-Termine in acht
// Schreibweisen, 195 Musik-Termine in fünf, 123 Treffpunkte in drei.
//
// Die Zusammenlegung passiert serverseitig an den Events selbst, nicht nur in
// der Kategorienliste: Die App vergleicht Filter-Chip und Event-Kategorie über
// den Titel-String (s. filters.ts). Nur wenn beide Seiten denselben Namen
// sehen, greift der Filter.
//
// Bewusst NICHT zusammengelegt: Gottesdienst und Andacht. Das sind zwei
// Formate, keine zwei Schreibweisen.

import { normalizeKey } from "./types";

/**
 * Schreibweise → kanonischer Name. Schlüssel sind normalisiert
 * (`normalizeKey`: getrimmt, Leerraum vereinheitlicht, kleingeschrieben);
 * Schrägstriche werden zusätzlich entklammert, damit „Kinder/Jugendliche" und
 * „Kinder / Jugendliche" denselben Schlüssel ergeben.
 */
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

/**
 * Der Name, unter dem eine Kategorie in Filter und Feed erscheint.
 *
 * Unbekannte Kategorien kommen unverändert zurück (nur getrimmt) — die Tabelle
 * ist eine Korrekturliste, kein Filter. Neue Schreibweisen aus ChurchDesk
 * tauchen dadurch als eigener Eintrag auf, statt still zu verschwinden.
 */
export function kanonischeKategorie(titel: string): string {
  return ZUSAMMENLEGUNG[schluessel(titel)] ?? titel.trim();
}

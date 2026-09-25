// Nutzungsmessung über die eigene Umami-Installation (t.godsapp.de).
//
// Selbst gehostet in Deutschland, ohne Cookies, ohne IP-Speicherung. Gemessen
// wird, WAS benutzt wird — nie WER. Keine Termin-IDs, keine Titel, keine
// Ortsnamen, keine Anzahlen: Bei einer Gemeinde mit drei Aktiven ist eine
// Anzahl bereits identifizierend.
//
// Zwei Umami-Eigenheiten, beide am 25.09.2026 gegen t.godsapp.de gemessen:
//
//  1. Umami antwortet auf JEDE Anfrage mit HTTP 200, verwirft aber alles, dessen
//     User-Agent nach `okhttp` aussieht — genau den schickt React Native auf
//     Android. Gemessen: okhttp verworfen, Dalvik und CFNetwork gespeichert.
//     Ohne eigenen Header misst man auf Android nichts und merkt es nicht.
//  2. Umami zählt Besucher NUR über Seitenaufrufe. Ein Seitenaufruf ist
//     `type:'event'` OHNE `name`; `type:'pageview'` lehnt Umami mit 400 ab.
//
// Derselbe eigene User-Agent behebt nebenbei, dass Umami iOS-Anfragen aus
// React Native sonst als „desktop ohne OS" verbucht.

import { Platform } from "react-native";

const UMAMI = "https://t.godsapp.de/api/send";

/** Website „Moin Kark App" in Umami. Kein Geheimnis — steht bei jeder getrackten Seite im Quelltext. */
const WEBSITE = "e393f7f4-b798-4d20-887a-6b0c866d76ca";

const HOSTNAME = "karte.moin-kark.de";

/**
 * Browserartiger User-Agent, damit Umami die Anfrage nicht verwirft (s. oben).
 * Bewusst ehrlich: Der App-Name steht drin, es ist keine Tarnung.
 */
const USER_AGENT =
  "Mozilla/5.0 (Mobile; MoinKark) AppleWebKit/605.1.15 (KHTML, like Gecko) MoinKark/1.0";

/**
 * Läuft nur im Release — im Entwicklungsbetrieb wird nichts gesendet, sonst
 * verfälschen Testläufe die Zahlen.
 *
 * `__DEV__` setzt der Metro-Bundler; im Vitest-Lauf gibt es das Symbol nicht,
 * deshalb die Prüfung über `globalThis` statt direkt (sonst ReferenceError).
 */
const AKTIV = (globalThis as { __DEV__?: boolean }).__DEV__ === false;

/**
 * Erlaubte Ereignisse und je Merkmal die erlaubten Werte.
 *
 * Positivliste statt Regex, mit Absicht: Ein Regex ließe jede
 * Kleinbuchstabenfolge durch — also auch einen Termintitel. Steht ein Wert
 * nicht hier, fällt das Merkmal weg und das Ereignis geht trotzdem raus.
 * Ein unbekannter Ereignisname wird gar nicht gesendet, sonst wäre jeder
 * Tippfehler ein neuer Name im Dashboard.
 */
export const EREIGNISSE = {
  "termin-geoeffnet": { quelle: ["liste", "karte", "gemerkt", "link", "mitteilung"] },
  "termin-gemerkt": { aktion: ["gemerkt", "entfernt"] },
  "erinnerung-gesetzt": { vorlauf: ["aus", "vorabend", "zwei-stunden", "beides"] },
  "erinnerung-ausgeloest": {},
  "filter-genutzt": { filter: ["zeit", "kirchspiel", "art", "zuruecksetzen"] },
  "geteilt": { weg: ["system", "zwischenablage"] },
  "bereich-geoeffnet": { bereich: ["karte", "liste", "filter", "profil", "merkliste"] },
} as const;

export type Ereignis = keyof typeof EREIGNISSE;

function plattform(): string {
  return Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
}

/** Merkmale auf die erlaubten Werte eindampfen. */
function pruefen(name: Ereignis, merkmale: Record<string, unknown>): Record<string, string> {
  const erlaubt = EREIGNISSE[name] as Record<string, readonly string[]>;
  const raus: Record<string, string> = { plattform: plattform() };
  for (const [k, v] of Object.entries(merkmale)) {
    const werte = erlaubt[k];
    if (werte && typeof v === "string" && werte.includes(v)) raus[k] = v;
  }
  return raus;
}

async function senden(nutzlast: Record<string, unknown>): Promise<void> {
  if (!AKTIV) return;
  try {
    await fetch(UMAMI, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ type: "event", payload: nutzlast }),
    });
  } catch {
    // Messung darf die App nie stören — kein Netz, kein Problem.
  }
}

/**
 * Seitenaufruf. Zählt Besucher und Sitzungen; benannte Ereignisse allein
 * ergäben im Dashboard „0 Besucher".
 */
export async function trackScreen(pfad: string): Promise<void> {
  await senden({
    website: WEBSITE,
    hostname: HOSTNAME,
    url: `/${pfad}`,
    data: { plattform: plattform() },
  });
}

/**
 * Benanntes Ereignis.
 *
 * Erst nach der erfolgreichen Aktion aufrufen, nicht beim Tippen: Ein Klick,
 * der in einem Fehler endet, ist keine Nutzung.
 */
export async function track(
  name: Ereignis,
  merkmale: Record<string, unknown> = {}
): Promise<void> {
  if (!(name in EREIGNISSE)) return;
  await senden({
    website: WEBSITE,
    hostname: HOSTNAME,
    url: "/",
    name,
    data: pruefen(name, merkmale),
  });
}

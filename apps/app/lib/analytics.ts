// Nutzungsmessung über die eigene Umami-Installation: was benutzt wird, nie wer.

import { Platform } from "react-native";

const UMAMI = "https://t.godsapp.de/api/send";

/** Website „Moin Kark App" in Umami. Kein Geheimnis — steht bei jeder getrackten Seite im Quelltext. */
const WEBSITE = "e393f7f4-b798-4d20-887a-6b0c866d76ca";

const HOSTNAME = "karte.moin-kark.de";

/** Browserartiger User-Agent, weil Umami okhttp-Anfragen still verwirft (gemessen am 25.09.2026). */
const USER_AGENT =
  "Mozilla/5.0 (Mobile; MoinKark) AppleWebKit/605.1.15 (KHTML, like Gecko) MoinKark/1.0";

/** Nur im Release; `__DEV__` über `globalThis`, weil es in Vitest fehlt. */
const AKTIV = (globalThis as { __DEV__?: boolean }).__DEV__ === false;

/** Erlaubte Ereignisse und Werte als Positivliste, weil ein Regex auch Termintitel durchließe. */
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

/** Seitenaufruf; nur darüber zählt Umami Besucher. */
export async function trackScreen(pfad: string): Promise<void> {
  await senden({
    website: WEBSITE,
    hostname: HOSTNAME,
    url: `/${pfad}`,
    data: { plattform: plattform() },
  });
}

/** Benanntes Ereignis, erst nach der erfolgreichen Aktion senden. */
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

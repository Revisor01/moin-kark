import { Linking, Platform, Share } from "react-native";
import * as StoreReview from "expo-store-review";

/**
 * Teilen von Terminen und der App selbst.
 *
 * Geteilt wird immer die Web-Karte mit `?event=<id>`. Ist die App installiert,
 * fängt sie den Link als Universal Link (iOS) bzw. App Link (Android) ab und
 * öffnet den Termin direkt; sonst öffnet er im Browser dieselbe Ansicht. Damit
 * funktioniert ein geteilter Link für alle — mit App wie ohne.
 *
 * Voraussetzung dafür sind die Zuordnungsdateien auf dem Server
 * (`apple-app-site-association` und `assetlinks.json` unter
 * `karte.moin-kark.de/.well-known/`). Fehlen sie, landet der Link im Browser —
 * die Web-Karte zeigt den Termin dann trotzdem.
 */

const WEB_BASE = "https://karte.moin-kark.de";
const SHARE_BASE = "https://moin-kark.de";

/**
 * Öffentlicher Link auf einen einzelnen Termin.
 *
 * Die Hauptdomain, nicht die Karte und nicht die API: Die Karte ist eine
 * Single-Page-App, Crawler sehen dort nur ein leeres Grundgerüst — ein
 * geteilter Link erschien in WhatsApp ohne Bild und Text. Die API könnte die
 * Vorschau liefern, aber „api.moin-kark.de" liest sich für Empfänger:innen
 * technisch und wirkt wie ein Fehler. Deshalb `moin-kark.de/event/<id>`:
 * Apache reicht den Pfad intern an die API weiter (s. apps/web/.htaccess),
 * die Vorschau kommt von dort, und die Adresse bleibt wiedererkennbar.
 */
export function eventShareUrl(id: number): string {
  return `${SHARE_BASE}/event/${id}`;
}

/** Link auf die App-Seite, zum Weiterempfehlen. */
export function appShareUrl(): string {
  return "https://moin-kark.de";
}

interface ShareableEvent {
  id: number;
  title: string;
  parish?: string;
  locationName?: string;
}

/**
 * Baut den Text, der im Teilen-Dialog landet: Titel, Zeit, Ort, Leerzeile, Link.
 * Die Zeitangabe kommt von außen, damit hier keine zweite Formatierung
 * entsteht — im Sheet steht dieselbe Zeile.
 */
export function eventShareMessage(event: ShareableEvent, timeLabel: string): string {
  const place = placeLine(event.locationName, event.parish);
  const head = [event.title, timeLabel, place].filter(Boolean).join("\n");
  // Signatur ans Ende: Wo gar keine Linkvorschau geladen wird (SMS, manche
  // Messenger), steht sonst nur eine nackte URL und niemand sieht, woher der
  // Termin kommt.
  return `${head}\n\n${eventShareUrl(event.id)}\n\n${SIGNATUR}`;
}

/** Steht unter jedem geteilten Termin. */
const SIGNATUR = "Moin Kark — die App für Kirche in Dithmarschen in deiner Nähe";

/**
 * „St. Bartholomäus, Wesselburen" — aber ohne Dopplung, wenn der Ortsname die
 * Gemeinde schon enthält („St. Bartholomäus Wesselburen").
 */
function placeLine(locationName?: string, parish?: string): string {
  if (!locationName) return parish ?? "";
  if (!parish) return locationName;
  if (locationName.toLowerCase().includes(parish.toLowerCase())) return locationName;
  return `${locationName}, ${parish}`;
}

/**
 * Liest die Event-ID aus einem eingehenden Link — egal ob Universal Link
 * (`https://karte.moin-kark.de/?event=42`) oder eigenes Schema
 * (`kkdith://?event=42`). Alles Unplausible ergibt null, damit ein kaputter
 * Link still ins Leere läuft statt die App zu stören.
 */
export function eventIdFromUrl(url: string): number | null {
  // Zwei Formen: der Vorschau-Link der API (`/event/<id>`, so wird geteilt) und
  // die Karten-URL (`?event=<id>`, so kommt der Web-Aufruf und das eigene Schema).
  const match = /[?&]event=([^&#]*)/.exec(url) ?? /\/event\/([^/?#]*)/.exec(url);
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  // Nur positive Ganzzahlen: ChurchDesk-IDs sehen so aus. `Number()` allein
  // würde "12.5" und " 4 " durchlassen.
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

/**
 * Kann diese Umgebung teilen?
 *
 * Nativ immer. Im Browser hängt es an `navigator.share` — das können alle
 * mobilen Browser und Safari, ältere Desktop-Browser nicht. Früher war der
 * Knopf auf Web pauschal ausgeblendet; das war zu grob, denn genau auf dem
 * Handy im Browser will man teilen.
 *
 * Wo es fehlt, springt `shareEvent` auf die Zwischenablage um — deshalb gibt
 * diese Prüfung dort ebenfalls `true`.
 */
export function canShare(): boolean {
  if (Platform.OS !== "web") return true;
  if (typeof navigator === "undefined") return false;
  return typeof (navigator as any).share === "function" || !!navigator.clipboard;
}

/** Teilt einen Termin über den System-Dialog. */
export async function shareEvent(event: ShareableEvent, timeLabel: string): Promise<void> {
  const message = eventShareMessage(event, timeLabel);
  try {
    // iOS trennt Text und URL; Android hängt `url` NICHT an, dort muss der
    // Link im Text stehen — er steht in beiden Fällen schon in `message`.
    await Share.share({ message, title: event.title });
  } catch {
    // Browser ohne navigator.share werfen hier. Dann in die Zwischenablage,
    // damit der Knopf trotzdem etwas tut — Abbruch durch die Nutzerin fällt
    // ebenfalls hierher, aber ein zweites Mal Kopieren schadet nicht.
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(message).catch(() => {});
    }
  }
}

/** Teilt die App selbst (Weiterempfehlung). */
export async function shareApp(): Promise<void> {
  try {
    await Share.share({
      message: `${SIGNATUR}\n\n${appShareUrl()}`,
    });
  } catch {
    // Abbruch durch die Nutzerin ist kein Fehler.
  }
}

/** Store-Seiten für den Rückfallweg, wenn der In-App-Dialog nicht geht. */
const STORE_URLS = {
  ios: "https://apps.apple.com/app/id6781438884?action=write-review",
  android: "market://details?id=de.godsapp.moinkark",
} as const;

const PLAY_WEB = "https://play.google.com/store/apps/details?id=de.godsapp.moinkark";

/**
 * Bewerten. Bevorzugt den systemeigenen Dialog (bleibt in der App), sonst die
 * Store-Seite.
 *
 * Achtung: Apple blendet den In-App-Dialog nur ein paarmal im Jahr wirklich ein
 * und meldet trotzdem Erfolg — deshalb hängt hier bewusst kein „Danke“-Zustand
 * dran. Wer nichts sieht, tippt eben nochmal und landet dann im Store.
 */
export async function rateApp(): Promise<void> {
  try {
    if ((await StoreReview.hasAction()) && (await StoreReview.isAvailableAsync())) {
      await StoreReview.requestReview();
      return;
    }
  } catch {
    // Fällt unten auf die Store-Seite zurück.
  }
  const url = Platform.OS === "ios" ? STORE_URLS.ios : STORE_URLS.android;
  try {
    const ok = await Linking.canOpenURL(url);
    await Linking.openURL(ok ? url : PLAY_WEB);
  } catch {
    // Ohne Store-App und ohne Browser ist nichts zu machen.
  }
}

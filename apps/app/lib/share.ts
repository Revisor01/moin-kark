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
 * Baut den Text, der im Teilen-Dialog landet: der Link, darunter die Signatur.
 *
 * Titel, Zeit und Ort stehen bewusst NICHT davor. iMessage und WhatsApp zeigen
 * die Linkvorschau nur, wenn die Nachricht im Wesentlichen aus dem Link
 * besteht; mit Text davor behandeln sie sie als gewöhnliche Nachricht und
 * lassen Bild und Beschreibung weg. Genau diese Angaben liefert die Vorschau
 * aber selbst (og:title, og:description) — im Text waren sie eine Dopplung,
 * die das Bild gekostet hat.
 *
 * `timeLabel` bleibt im Aufruf, damit die Signatur der Funktion stabil ist und
 * das Sheet nichts umbauen muss.
 */
export function eventShareMessage(event: ShareableEvent, _timeLabel?: string): string {
  // Signatur hinter den Link: Wo gar keine Vorschau geladen wird (SMS, manche
  // Messenger), steht sonst nur eine nackte URL und niemand sieht, woher der
  // Termin kommt.
  return `${eventShareUrl(event.id)}\n\n${SIGNATUR}`;
}

/** Steht unter jedem geteilten Termin. */
const SIGNATUR = "Moin Kark — Kirche. In deiner Nähe.";

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
  const link = eventShareUrl(event.id);
  const message = eventShareMessage(event, timeLabel);

  // Im Browser direkt und synchron teilen: `navigator.share` verlangt eine
  // „transient user activation" und muss im Klick-Ereignis selbst laufen. Der
  // Umweg über Share.share von react-native-web kostet sie — Safari auf dem
  // iPhone lehnte dann mit NotAllowedError ab, und der Knopf tat scheinbar
  // nichts. Kein `await` vor diesem Aufruf, sonst ist die Aktivierung
  // ebenfalls verbraucht.
  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    const nav = navigator as Navigator & {
      share?: (d: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: event.title, text: SIGNATUR, url: link });
        return;
      } catch {
        // Abbruch durch die Nutzerin oder abgelehnt: unten die Zwischenablage.
      }
    }
    if (nav.clipboard) await nav.clipboard.writeText(`${link}\n\n${SIGNATUR}`).catch(() => {});
    return;
  }

  try {
    // iOS und Web kennen ein eigenes Feld `url` und behandeln `message` als
    // reinen Text. Stand der Link nur im Text, erkannte iMessage ihn NICHT als
    // Link: keine Vorschau mit Bild, und ein Tipp darauf öffnete weder Seite
    // noch App. Im Browser kam stattdessen der ganze Infoblock als Text an.
    // Deshalb dort den Link in `url` und nur die Signatur als Text — sonst
    // erschiene er doppelt. (react-native-web reicht `url` an
    // `navigator.share({url})` weiter.)
    //
    // Android verwirft `url`: Share.js baut dort ein neues Objekt aus nur
    // `title` und `message` (die Doku listet `url` fuer beide Plattformen —
    // im Quelltext kommt es auf Android nie an). Dort muss der Link im Text
    // stehen.
    await Share.share(
      Platform.OS === "android"
        ? { message, title: event.title }
        : { url: link, message: SIGNATUR, title: event.title }
    );
  } catch {
    // Abbruch durch die Nutzerin ist kein Fehler. Der Browser ist oben schon
    // abgehandelt und kommt hier nicht mehr an.
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

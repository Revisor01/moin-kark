import { Linking, Platform, Share } from "react-native";
import * as StoreReview from "expo-store-review";

/** Teilen von Terminen und der App; der Link öffnet mit App die App und sonst die Web-Karte. */

const WEB_BASE = "https://karte.moin-kark.de";
const SHARE_BASE = "https://moin-kark.de";

/** Link `moin-kark.de/event/<id>`, weil Crawler in der SPA nichts sehen und die API-Domain wie ein Fehler wirkt. */
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

/** Nur Link und Signatur, weil Messenger mit Text davor die Vorschau weglassen; `timeLabel` bleibt für die Signatur. */
export function eventShareMessage(event: ShareableEvent, _timeLabel?: string): string {
  // Signatur, damit ohne Vorschau sichtbar ist, woher der Termin kommt.
  return `${eventShareUrl(event.id)}\n\n${SIGNATUR}`;
}

/** Steht unter jedem geteilten Termin. */
const SIGNATUR = "Moin Kark — Kirche. In deiner Nähe.";

/** Event-ID aus einem Universal Link oder dem eigenen Schema, sonst null. */
export function eventIdFromUrl(url: string): number | null {
  const match = /[?&]event=([^&#]*)/.exec(url) ?? /\/event\/([^/?#]*)/.exec(url);
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  // Nur positive Ganzzahlen, `Number()` ließe "12.5" und " 4 " durch.
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

/** Ob geteilt werden kann; ohne `navigator.share` nimmt `shareEvent` die Zwischenablage. */
export function canShare(): boolean {
  if (Platform.OS !== "web") return true;
  if (typeof navigator === "undefined") return false;
  return typeof (navigator as any).share === "function" || !!navigator.clipboard;
}

/** Teilt einen Termin über den System-Dialog. */
export async function shareEvent(event: ShareableEvent, timeLabel: string): Promise<void> {
  const link = eventShareUrl(event.id);
  const message = eventShareMessage(event, timeLabel);

  // Synchron im Klick, weil `navigator.share` eine frische Nutzeraktivierung verlangt; kein `await` davor.
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
    // iOS und Web brauchen den Link in `url`, sonst keine Vorschau; Android verwirft `url`, dort muss er in den Text.
    await Share.share(
      Platform.OS === "android"
        ? { message, title: event.title }
        : { url: link, message: SIGNATUR, title: event.title }
    );
  } catch {
    // Abbruch ist kein Fehler.
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

/** Bewerten über den Systemdialog, sonst den Store; kein „Danke“, weil Apple Erfolg meldet, ohne ihn zu zeigen. */
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

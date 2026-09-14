// Lokale Erinnerungen an gemerkte Events (kein Server, läuft on-device).
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EventFeature } from "@moinkark/shared";

export type ReminderPref = "evening" | "2h" | "both" | "off";
const REMINDER_KEY = "kkd:reminderPref";
export const DEFAULT_REMINDER: ReminderPref = "evening";

// Map: eventId -> [notificationIds]. Damit wir beim Entfernen gezielt canceln.
const MAP_KEY = "kkd:reminderMap";

// Scheduling gibt es nur nativ. Auf Web sind alle Funktionen No-ops (sonst Crash).
const IS_WEB = Platform.OS === "web";

if (!IS_WEB) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensurePermission(): Promise<boolean> {
  if (IS_WEB) return false;
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === "granted";
}

async function loadMap(): Promise<Record<number, string[]>> {
  const raw = await AsyncStorage.getItem(MAP_KEY);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
async function saveMap(m: Record<number, string[]>) {
  await AsyncStorage.setItem(MAP_KEY, JSON.stringify(m)).catch(() => {});
}

/**
 * Serialisiert alle Lese-Ändern-Schreiben-Zyklen auf der Reminder-Map.
 *
 * Ohne das überschreiben sich parallele Aufrufe gegenseitig: Wer ein Event
 * schnell hintereinander merkt und wieder entmerkt, löste sonst ein `cancel`
 * aus, das die Map noch ohne die gerade geplanten IDs las — die Erinnerung
 * feuerte später für ein längst entmerktes Event. Der Abgleich beim Start
 * stößt zudem mehrere Aufrufe gleichzeitig an.
 */
let mapQueue: Promise<unknown> = Promise.resolve();
function withMap<T>(fn: (map: Record<number, string[]>) => Promise<T>): Promise<T> {
  const run = mapQueue.then(async () => {
    const map = await loadMap();
    try {
      return await fn(map);
    } finally {
      // Auch nach einem Fehler speichern: Was bis dahin geplant wurde, muss in
      // der Map stehen — sonst lässt es sich nie mehr abbrechen und meldet
      // sich für einen längst entmerkten Termin.
      await saveMap(map);
    }
  });
  // Kette am Leben halten, auch wenn ein Glied scheitert.
  mapQueue = run.catch(() => undefined);
  return run;
}

export async function getReminderPref(): Promise<ReminderPref> {
  const raw = await AsyncStorage.getItem(REMINDER_KEY);
  if (raw === "evening" || raw === "2h" || raw === "both" || raw === "off") return raw;
  return DEFAULT_REMINDER;
}

const BERLIN_TZ = "Europe/Berlin";

/** „Fr, 19. Juni · 12:00 Uhr" in Berlin-Zeit. */
function formatWhen(start: Date): string {
  const day = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TZ,
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(start);
  const time = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(start);
  return `${day} · ${time} Uhr`;
}

/** „heute"/„morgen"/Wochentag relativ zu now — anhand des Kalendertags in Berlin. */
function relativeDay(start: Date, now: Date): string {
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: BERLIN_TZ }).format(d); // YYYY-MM-DD
  const sk = dayKey(start);
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 86400_000));
  if (sk === today) return "Heute";
  if (sk === tomorrow) return "Morgen";
  return new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN_TZ, weekday: "long" }).format(start);
}

/**
 * Höchstzahl gleichzeitig geplanter Termine. iOS hält pro App nur 64 ausstehende
 * Mitteilungen und verwirft darüber hinaus still — bei „Beides" sind das zwei
 * pro Termin. 30 Termine (= 60 Mitteilungen) lassen Luft für die sofortigen
 * Hinweise („entfällt"/„verschoben"); was dahinter liegt, rückt beim Abgleich
 * nach (reconcileReminders).
 */
export const MAX_PLANNED_EVENTS = 30;

/** Die nächsten (künftigen) Termine in Startreihenfolge, gedeckelt. */
function nextUpcoming(saved: EventFeature[]): EventFeature[] {
  const now = Date.now();
  return saved
    .filter((f) => new Date(f.properties.startUtc).getTime() > now)
    .sort((a, b) => Date.parse(a.properties.startUtc) - Date.parse(b.properties.startUtc))
    .slice(0, MAX_PLANNED_EVENTS);
}

/** Plant die Erinnerung(en) für ein Event gemäß Präferenz. Vergangene Zeiten werden übersprungen. */
export async function scheduleForEvent(f: EventFeature, pref: ReminderPref): Promise<void> {
  if (IS_WEB || pref === "off") return;
  const start = new Date(f.properties.startUtc);
  const now = Date.now();
  const triggers: { date: Date; lead: string }[] = [];

  if (pref === "evening" || pref === "both") {
    // Vorabend 18:00 Ortszeit; ist das schon vorbei (Event heute/gleich) → 3h vorher.
    const evening = new Date(start);
    evening.setDate(start.getDate() - 1);
    evening.setHours(18, 0, 0, 0);
    const chosen = evening.getTime() > now ? evening : new Date(start.getTime() - 3 * 3600_000);
    triggers.push({ date: chosen, lead: "" });
  }
  if (pref === "2h" || pref === "both") {
    triggers.push({ date: new Date(start.getTime() - 2 * 3600_000), lead: "In 2 Stunden · " });
  }

  // Titel: „Erinnerung: <Event>" — Body: relativer Tag + volles Datum/Uhrzeit + Ort.
  const place = f.properties.locationName ?? f.properties.parish ?? f.properties.kirchspiel;
  const when = formatWhen(start);

  await withMap(async (map) => {
    // Vorhandene Planungen für dieses Event zuerst abräumen — sonst sammeln sich
    // bei erneutem Planen (Termin verschoben, Präferenz gewechselt) Doppel-
    // Benachrichtigungen an.
    for (const old of map[f.properties.id] ?? []) {
      await Notifications.cancelScheduledNotificationAsync(old).catch(() => {});
    }
    const ids: string[] = [];
    delete map[f.properties.id];
    for (const t of triggers) {
      if (t.date.getTime() <= now) continue; // Vergangenheit überspringen
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: f.properties.title,
          // z.B. „In 2 Stunden · Heute, Fr 19. Juni · 12:00 Uhr — Büsum, St. Clemens"
          // „Heute"/„Morgen" bezogen auf den ZUSTELLzeitpunkt, nicht auf jetzt:
        // eine heute geplante Erinnerung für morgen früh wird morgen zugestellt
        // und hätte sonst „Morgen" gemeldet, obwohl das Event dann heute ist.
        body: `${t.lead}${relativeDay(start, t.date)}, ${when}${place ? ` — ${place}` : ""}`,
          data: { eventId: f.properties.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: t.date },
      });
      ids.push(id);
      // Sofort eintragen: Schlägt die nächste Planung fehl, bleibt diese abbrechbar.
      map[f.properties.id] = ids;
    }
  });
}

/**
 * Gleicht die geplanten Erinnerungen mit dem Bestand ab, ohne alles neu zu planen:
 * fehlende (z. B. nach einem früheren Fehlalarm gelöschte) werden nachgeplant,
 * verwaiste (entmerkt, entfallen, jenseits des Deckels) abgeräumt.
 * `keep` = gemerkte Termine, die gerade nicht im Feed stehen (Teilausfall) —
 * deren Planungen bleiben unangetastet.
 */
export async function reconcileReminders(
  saved: EventFeature[],
  pref: ReminderPref,
  keep: Iterable<number> = []
): Promise<void> {
  if (IS_WEB) return;
  const target = pref === "off" ? [] : nextUpcoming(saved);
  const targetIds = new Set(target.map((f) => f.properties.id));
  const keepIds = pref === "off" ? new Set<number>() : new Set(keep);
  const missing = await withMap(async (map) => {
    for (const key of Object.keys(map)) {
      const id = Number(key);
      if (targetIds.has(id) || keepIds.has(id)) continue;
      for (const nid of map[id] ?? []) {
        await Notifications.cancelScheduledNotificationAsync(nid).catch(() => {});
      }
      delete map[id];
    }
    return target.filter((f) => !map[f.properties.id]?.length);
  });
  for (const f of missing) await scheduleForEvent(f, pref).catch(() => {});
}

/** Bricht alle geplanten Erinnerungen für ein Event ab. */
export async function cancelForEvent(eventId: number): Promise<void> {
  if (IS_WEB) return;
  await withMap(async (map) => {
    for (const id of map[eventId] ?? []) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    }
    delete map[eventId];
  });
}

/** Plant alle gemerkten Events neu (z.B. nach Präferenz-Wechsel). */
export async function rescheduleAll(saved: EventFeature[], pref: ReminderPref): Promise<void> {
  if (IS_WEB) return;
  // Leeren ebenfalls über die Queue, damit es sich nicht mit laufenden
  // Einzelplanungen überholt.
  await withMap(async (map) => {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    for (const key of Object.keys(map)) delete map[key as unknown as number];
  });
  if (pref === "off") return;
  for (const f of nextUpcoming(saved)) await scheduleForEvent(f, pref);
}

export async function setReminderPref(pref: ReminderPref): Promise<void> {
  await AsyncStorage.setItem(REMINDER_KEY, pref).catch(() => {});
}

/**
 * Die zuletzt angetippte Mitteilung — oder `null` im Web.
 *
 * `Notifications.useLastNotificationResponse()` wirft im Web („is not available
 * on web"), und zwar beim Rendern: Die Web-Fassung startete dadurch gar nicht
 * mehr. Hier gekapselt statt am Aufrufer verzweigt, weil ein Hook nicht bedingt
 * aufgerufen werden darf — die Reihenfolge muss auf jeder Plattform gleich sein.
 */
export function useLastNotificationTap(): Notifications.NotificationResponse | null {
  // Im Web existiert der Hook nicht; der Platzhalter hält die Hook-Reihenfolge
  // stabil und liefert immer null.
  const hook = IS_WEB ? () => null : Notifications.useLastNotificationResponse;
  return hook() ?? null;
}

/** Verbraucht die gespeicherte Antwort, damit sie nicht erneut greift. */
export function clearLastNotificationTap(): void {
  if (IS_WEB) return;
  Notifications.clearLastNotificationResponse();
}

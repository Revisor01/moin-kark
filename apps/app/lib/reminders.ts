// Lokale Erinnerungen an gemerkte Events (kein Server, läuft on-device).
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EventFeature } from "@kkd/shared";

export type ReminderPref = "evening" | "2h" | "both" | "off";
export const REMINDER_KEY = "kkd:reminderPref";
export const DEFAULT_REMINDER: ReminderPref = "evening";

// Map: eventId -> [notificationIds]. Damit wir beim Entfernen gezielt canceln.
const MAP_KEY = "kkd:reminderMap";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensurePermission(): Promise<boolean> {
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

export async function getReminderPref(): Promise<ReminderPref> {
  const raw = await AsyncStorage.getItem(REMINDER_KEY);
  if (raw === "evening" || raw === "2h" || raw === "both" || raw === "off") return raw;
  return DEFAULT_REMINDER;
}

/** Plant die Erinnerung(en) für ein Event gemäß Präferenz. Vergangene Zeiten werden übersprungen. */
export async function scheduleForEvent(f: EventFeature, pref: ReminderPref): Promise<void> {
  if (pref === "off") return;
  const start = new Date(f.properties.startUtc);
  const now = Date.now();
  const triggers: { date: Date; label: string }[] = [];

  if (pref === "evening" || pref === "both") {
    // Tag vor Event, 18:00 Ortszeit. Bei Event am selben Tag: 3h vorher.
    const ev = new Date(start);
    const evening = new Date(ev);
    evening.setDate(ev.getDate() - 1);
    evening.setHours(18, 0, 0, 0);
    const chosen = evening.getTime() > now ? evening : new Date(start.getTime() - 3 * 3600_000);
    triggers.push({ date: chosen, label: "Morgen" });
  }
  if (pref === "2h" || pref === "both") {
    triggers.push({ date: new Date(start.getTime() - 2 * 3600_000), label: "In 2 Stunden" });
  }

  const map = await loadMap();
  const ids: string[] = map[f.properties.id] ?? [];
  for (const t of triggers) {
    if (t.date.getTime() <= now) continue; // Vergangenheit überspringen
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: f.properties.title,
        body: `${t.label}: ${f.properties.parish ?? f.properties.kirchspiel}`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: t.date },
    });
    ids.push(id);
  }
  map[f.properties.id] = ids;
  await saveMap(map);
}

/** Bricht alle geplanten Erinnerungen für ein Event ab. */
export async function cancelForEvent(eventId: number): Promise<void> {
  const map = await loadMap();
  for (const id of map[eventId] ?? []) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }
  delete map[eventId];
  await saveMap(map);
}

/** Plant alle gemerkten Events neu (z.B. nach Präferenz-Wechsel). */
export async function rescheduleAll(saved: EventFeature[], pref: ReminderPref): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  await saveMap({});
  if (pref === "off") return;
  for (const f of saved) await scheduleForEvent(f, pref);
}

export async function setReminderPref(pref: ReminderPref): Promise<void> {
  await AsyncStorage.setItem(REMINDER_KEY, pref).catch(() => {});
}

// Lokaler Abgleich gemerkter Events beim App-Start.
// Erkennt: Event gelöscht (nicht mehr in Daten) oder verschoben (Zeit/Ort geändert).
// Feuert dann eine lokale, klickbare Notification — ganz ohne Server/Push.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EventFeature } from "@kkd/shared";

const IS_WEB = Platform.OS === "web";

// Snapshot der gemerkten Events vom letzten Abgleich: id -> Kernfelder.
const SNAP_KEY = "kkd:savedSnapshot";

interface Snap {
  startUtc: string;
  title: string;
  locationName: string | null;
}
type SnapMap = Record<number, Snap>;

function toSnap(f: EventFeature): Snap {
  return {
    startUtc: f.properties.startUtc,
    title: f.properties.title,
    locationName: f.properties.locationName ?? null,
  };
}

async function loadSnap(): Promise<SnapMap> {
  const raw = await AsyncStorage.getItem(SNAP_KEY);
  try {
    return raw ? (JSON.parse(raw) as SnapMap) : {};
  } catch {
    return {};
  }
}

async function saveSnap(m: SnapMap) {
  await AsyncStorage.setItem(SNAP_KEY, JSON.stringify(m)).catch(() => {});
}

/** Sofort sichtbare (klickbare) Mitteilung. data.eventId steuert den Tap. */
async function notify(title: string, body: string, eventId: number | null) {
  if (IS_WEB) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: eventId != null ? { eventId } : {} },
    trigger: null, // sofort
  }).catch(() => {});
}

export interface SyncResult {
  removed: number[]; // IDs die nicht mehr existieren
  changed: number[]; // IDs mit geänderter Zeit/Ort
}

/**
 * Gleicht die gemerkten Events gegen die frischen Daten ab und meldet Wegfall/Änderung.
 * `savedIds` = aktuell gemerkte IDs, `all` = alle frischen Features.
 * Gibt zurück, was sich geändert hat (für ggf. Reminder-Neuplanung im Aufrufer).
 */
export async function syncSavedEvents(
  savedIds: number[],
  all: EventFeature[]
): Promise<SyncResult> {
  const result: SyncResult = { removed: [], changed: [] };
  if (IS_WEB || savedIds.length === 0) {
    // Snapshot trotzdem aktuell halten (für späteren echten Abgleich).
    await rebuildSnapshot(savedIds, all);
    return result;
  }

  const prev = await loadSnap();
  const byId = new Map(all.map((f) => [f.properties.id, f]));

  for (const id of savedIds) {
    const before = prev[id];
    const now = byId.get(id);

    // Erstes Mal gesehen (kein Snapshot) → nur aufnehmen, nicht melden.
    if (!before) continue;

    if (!now) {
      // Event existiert nicht mehr → nur melden, wenn es noch nicht vorbei war.
      if (new Date(before.startUtc).getTime() > Date.now()) {
        result.removed.push(id);
        await notify(
          "Veranstaltung entfällt",
          `„${before.title}" wurde aus dem Kalender entfernt.`,
          null
        );
      }
      continue;
    }

    const timeChanged = before.startUtc !== now.properties.startUtc;
    const placeChanged = (before.locationName ?? null) !== (now.properties.locationName ?? null);
    if (timeChanged || placeChanged) {
      result.changed.push(id);
      const what = timeChanged ? "Termin geändert" : "Ort geändert";
      await notify(
        `${what}: ${now.properties.title}`,
        timeChanged
          ? "Die Uhrzeit dieser gemerkten Veranstaltung hat sich geändert. Tippen für Details."
          : "Der Ort dieser gemerkten Veranstaltung hat sich geändert. Tippen für Details.",
        id
      );
    }
  }

  await rebuildSnapshot(savedIds, all);
  return result;
}

/** Snapshot neu aufbauen: nur noch gemerkte, existierende Events. */
async function rebuildSnapshot(savedIds: number[], all: EventFeature[]) {
  const byId = new Map(all.map((f) => [f.properties.id, f]));
  const next: SnapMap = {};
  for (const id of savedIds) {
    const f = byId.get(id);
    if (f) next[id] = toSnap(f);
    // gelöschte Events fallen aus dem Snapshot → werden nicht doppelt gemeldet.
  }
  await saveSnap(next);
}

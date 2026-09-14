// Lokaler Abgleich gemerkter Events beim App-Start und bei neuen Daten.
// Erkennt: Event gelöscht (nicht mehr in Daten) oder verschoben (Zeit/Ort geändert).
// Feuert dann eine lokale, klickbare Notification — ganz ohne Server/Push.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EventFeature } from "@moinkark/shared";
import { isPast } from "./filters";
import {
  cancelForEvent,
  reconcileReminders,
  rescheduleAll,
  scheduleForEvent,
  type ReminderPref,
} from "./reminders";

const IS_WEB = Platform.OS === "web";

/**
 * Teilmenge der Feed-Metadaten, die der Abgleich braucht. Bewusst lose typisiert:
 * `orgsFailedIds` (welche Gemeinden ausgefallen sind) liefert die API erst seit
 * kurzem — ältere Stände kennen nur die Zahl `orgsFailed`. Beides optional, weil
 * auch Antworten ohne `meta` verkraftet werden müssen.
 */
export type FeedMeta = {
  orgsFailed?: number;
  orgsFailedIds?: number[];
};

// Snapshot der gemerkten Events vom letzten Abgleich: id -> Kernfelder.
const SNAP_KEY = "kkd:savedSnapshot";

interface Snap {
  startUtc: string;
  title: string;
  locationName: string | null;
  /** Herkunfts-Gemeinde — fehlt in Snapshots älterer App-Fassungen. */
  orgId?: number;
}
type SnapMap = Record<number, Snap>;

function toSnap(f: EventFeature): Snap {
  return {
    startUtc: f.properties.startUtc,
    title: f.properties.title,
    locationName: f.properties.locationName ?? null,
    orgId: f.properties.orgId,
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

/**
 * Teilausfall der API: Eine ChurchDesk-Gemeinde hat nicht geantwortet, der Feed
 * kam trotzdem (Status 200) — nur ohne deren Termine. Die fehlen dann nicht,
 * weil sie abgesagt wären, sondern weil die Quelle gerade schweigt.
 * Ohne Gemeindeliste (ältere API) oder ohne bekannte Herkunft (alter Snapshot)
 * wird im Zweifel geschont: ein ausgebliebener Hinweis ist billiger als ein
 * falscher „entfällt".
 */
function partialOutage(meta: FeedMeta | undefined): { affects: (orgId: number | undefined) => boolean } {
  const failed = meta?.orgsFailed ?? 0;
  if (!(failed > 0)) return { affects: () => false };
  const listed = Array.isArray(meta?.orgsFailedIds)
    ? meta.orgsFailedIds.filter((n): n is number => typeof n === "number")
    : [];
  const ids = listed.length > 0 ? new Set(listed) : null;
  return { affects: (orgId) => ids === null || orgId === undefined || ids.has(orgId) };
}

export interface SyncResult {
  removed: number[]; // IDs die nicht mehr existieren
  changed: number[]; // IDs mit geänderter Zeit/Ort
}

/**
 * Gleicht die gemerkten Events gegen die frischen Daten ab und meldet Wegfall/Änderung.
 * `savedIds` = aktuell gemerkte IDs, `all` = alle frischen Features, `meta` = Feed-Metadaten
 * (Teilausfall-Erkennung). Gibt zurück, was sich geändert hat (für Reminder-Neuplanung im Aufrufer).
 */
export async function syncSavedEvents(
  savedIds: number[],
  all: EventFeature[],
  meta?: FeedMeta
): Promise<SyncResult> {
  const result: SyncResult = { removed: [], changed: [] };
  if (IS_WEB || savedIds.length === 0) {
    // Snapshot trotzdem aktuell halten (für späteren echten Abgleich).
    await rebuildSnapshot(savedIds, all);
    return result;
  }

  const prev = await loadSnap();
  const byId = new Map(all.map((f) => [f.properties.id, f]));
  const outage = partialOutage(meta);
  // Termine, die nur wegen eines Teilausfalls fehlen: Snapshot-Eintrag behalten,
  // sonst gälten sie beim nächsten Lauf als „erstmals gesehen".
  const spared: SnapMap = {};

  for (const id of savedIds) {
    const before = prev[id];
    const now = byId.get(id);

    // Erstes Mal gesehen (kein Snapshot) → nur aufnehmen, nicht melden.
    if (!before) continue;

    if (!now) {
      if (outage.affects(before.orgId)) {
        spared[id] = before;
        continue;
      }
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

  await rebuildSnapshot(savedIds, all, spared);
  return result;
}

/** Gemerkte Start-Zeiten aus dem letzten Snapshot (id -> startUtc), auch für Events,
 *  die nicht mehr im Feed stehen. Dient dem Aufräumen vergangener Likes. */
export async function loadSnapshotStartTimes(): Promise<Record<number, string>> {
  const snap = await loadSnap();
  const out: Record<number, string> = {};
  for (const [id, s] of Object.entries(snap)) out[Number(id)] = s.startUtc;
  return out;
}

/** Snapshot neu aufbauen: gemerkte, existierende Events — plus die geschonten. */
async function rebuildSnapshot(savedIds: number[], all: EventFeature[], spared: SnapMap = {}) {
  const byId = new Map(all.map((f) => [f.properties.id, f]));
  const next: SnapMap = {};
  for (const id of savedIds) {
    const f = byId.get(id);
    if (f) next[id] = toSnap(f);
    else if (spared[id]) next[id] = spared[id];
    // gelöschte Events fallen aus dem Snapshot → werden nicht doppelt gemeldet.
  }
  await saveSnap(next);
}

export interface SavedSyncInput {
  savedIds: number[];
  features: EventFeature[];
  meta: FeedMeta | undefined;
  reminderPref: ReminderPref;
  removeMany: (ids: number[]) => void;
}

/**
 * Kompletter Abgleich-Lauf gegen frische Daten: vergangene Likes aufräumen,
 * Wegfall/Verschiebung melden, Merkliste und Erinnerungen nachziehen.
 */
export async function runSavedSync(input: SavedSyncInput): Promise<SyncResult> {
  const { savedIds, features, meta, reminderPref, removeMany } = input;
  const byId = new Map(features.map((f) => [f.properties.id, f]));

  // Vergangene Likes dauerhaft aufräumen — sowohl Events, die noch im Feed
  // stehen (über isPast) als auch verwaiste (nicht mehr im Feed), deren
  // Startzeit aus dem Snapshot in der Vergangenheit liegt.
  const snapTimes = await loadSnapshotStartTimes();
  const nowMs = Date.now();
  const pastIds = savedIds.filter((id) => {
    const f = byId.get(id);
    if (f) return isPast(f);
    const startUtc = snapTimes[id];
    // Verwaist + Startzeit vorbei → war ein vergangenes Event → entfernen.
    // Verwaist ohne bekannte Startzeit → in Ruhe lassen (kein Snapshot).
    return startUtc ? new Date(startUtc).getTime() < nowMs : false;
  });
  if (pastIds.length) {
    removeMany(pastIds);
    for (const id of pastIds) await cancelForEvent(id).catch(() => {});
  }
  const pastSet = new Set(pastIds);
  const ids = savedIds.filter((id) => !pastSet.has(id));

  const res = await syncSavedEvents(ids, features, meta);

  // Entfallene Termine verlassen auch die Merkliste — sonst zählt das Profil
  // Phantome und die ID bleibt für immer im Speicher.
  if (res.removed.length) {
    removeMany(res.removed);
    for (const id of res.removed) await cancelForEvent(id).catch(() => {});
  }
  const removedSet = new Set(res.removed);
  const remaining = ids.filter((id) => !removedSet.has(id));

  // Verschobene Termine: Erinnerung auf die neue Zeit setzen.
  if (reminderPref !== "off") {
    for (const id of res.changed) {
      await cancelForEvent(id).catch(() => {});
      const f = byId.get(id);
      if (f) await scheduleForEvent(f, reminderPref).catch(() => {});
    }
  }

  const remainingSet = new Set(remaining);
  const savedNow = features.filter((f) => remainingSet.has(f.properties.id) && !isPast(f));

  // Einmalig nach dem Update: ALLE Reminder neu planen, damit alte (falsch
  // formatierte „Morgen"-) Benachrichtigungen durch die korrekte Variante ersetzt werden.
  if (reminderPref !== "off") {
    const KEY = "kkd:reminderFormatV2";
    if (!(await AsyncStorage.getItem(KEY))) {
      await rescheduleAll(savedNow, reminderPref);
      await AsyncStorage.setItem(KEY, "1");
    }
  }

  // Bestand angleichen: fehlende Erinnerungen nachplanen (etwa nach einem
  // früheren Fehlalarm), Deckel halten, Waisen abräumen. Gemerkte Termine, die
  // gerade nicht im Feed stehen (Teilausfall), bleiben unangetastet.
  const offFeed = remaining.filter((id) => !byId.has(id));
  await reconcileReminders(savedNow, reminderPref, offFeed);

  return res;
}

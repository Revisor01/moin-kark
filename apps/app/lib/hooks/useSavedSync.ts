// Abgleich der gemerkten Events gegen die Daten (entfällt / verschoben →
// lokale Mitteilung, Erinnerungen nachziehen). Ausgezogen aus dem Home-Screen,
// damit die Ablauflogik ohne Karte und Sheets testbar ist.
import { useEffect, useRef } from "react";
import type { EventFeature } from "@moinkark/shared";
import type { ReminderPref } from "../reminders";
import { runSavedSync, type FeedMeta } from "../savedSync";

export interface SavedSyncArgs {
  features: EventFeature[];
  meta: FeedMeta | undefined;
  /** Zeitstempel der letzten erfolgreichen Netzantwort (React Query), 0 = noch keine. */
  dataUpdatedAt: number;
  saved: Set<number>;
  savedLoaded: boolean;
  removeMany: (ids: number[]) => void;
  reminderPref: ReminderPref;
  reminderLoaded: boolean;
}

export function useSavedSync(args: SavedSyncArgs) {
  const { features, meta, dataUpdatedAt, saved, savedLoaded, removeMany, reminderPref, reminderLoaded } = args;
  // Zeitstempel der Netzantwort, gegen die zuletzt abgeglichen wurde.
  const lastSyncedAt = useRef(0);
  // Läufe hintereinander ausführen, nie parallel — sonst überholen sich zwei
  // Snapshot-Schreibvorgänge.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    // `reminderLoaded` abwarten: sonst liefe der Abgleich mit der Default-
    // Präferenz und plante Erinnerungen, die abgeschaltet sein sollten.
    if (!savedLoaded || !reminderLoaded) return;
    // Nur gegen FRISCHE Netzdaten abgleichen. Beim Start liegen Merkliste,
    // Präferenz und der Zwischenspeicher der letzten Sitzung lange vor der
    // Netzantwort vor — ein Lauf gegen den Zwischenspeicher vergliche alt mit
    // alt, fände nichts und ließe die Erinnerung auf der alten Uhrzeit stehen.
    // `dataUpdatedAt` ist 0, solange nur der Zwischenspeicher da ist, und
    // ändert sich mit jeder erfolgreichen Antwort — auch beim Versions-Poll
    // und beim Tageswechsel in laufender Sitzung. Der Snapshot verhindert,
    // dass dieselbe Änderung zweimal gemeldet wird.
    if (dataUpdatedAt === 0 || dataUpdatedAt === lastSyncedAt.current) return;
    lastSyncedAt.current = dataUpdatedAt;
    const savedIds = [...saved];
    queue.current = queue.current
      .then(() => runSavedSync({ savedIds, features, meta, reminderPref, removeMany }))
      .catch(() => {});
  }, [features, meta, dataUpdatedAt, saved, savedLoaded, removeMany, reminderPref, reminderLoaded]);
}

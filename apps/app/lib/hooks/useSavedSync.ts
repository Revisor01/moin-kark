// Abgleich gemerkter Events gegen frische Daten, ausgelagert, damit er ohne Karte testbar ist.
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
  // Nacheinander, sonst überholen sich zwei Snapshot-Schreibvorgänge.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    // Sonst plante der Abgleich mit der Standardpräferenz abgeschaltete Erinnerungen.
    if (!savedLoaded || !reminderLoaded) return;
    // Nur gegen frische Netzdaten (`dataUpdatedAt` > 0), sonst verglich der Start alt mit alt.
    if (dataUpdatedAt === 0 || dataUpdatedAt === lastSyncedAt.current) return;
    lastSyncedAt.current = dataUpdatedAt;
    const savedIds = [...saved];
    queue.current = queue.current
      .then(() => runSavedSync({ savedIds, features, meta, reminderPref, removeMany }))
      .catch(() => {});
  }, [features, meta, dataUpdatedAt, saved, savedLoaded, removeMany, reminderPref, reminderLoaded]);
}

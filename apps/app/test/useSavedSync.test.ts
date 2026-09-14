import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  feature,
  flush,
  inDays,
  notifications,
  renderHook,
  scheduledRequests,
  storage,
} from "./helpers";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@react-native-async-storage/async-storage", async () => ({
  default: (await import("./helpers")).storage,
}));
vi.mock("expo-notifications", async () => (await import("./helpers")).notifications);

import { useSavedSync, type SavedSyncArgs } from "../lib/hooks/useSavedSync";

const SNAP_KEY = "kkd:savedSnapshot";
const FORMAT_KEY = "kkd:reminderFormatV2";

function args(over: Partial<SavedSyncArgs> = {}): SavedSyncArgs {
  return {
    features: [],
    meta: { orgsFailed: 0 },
    dataUpdatedAt: 0,
    saved: new Set<number>(),
    savedLoaded: true,
    removeMany: vi.fn(),
    reminderPref: "evening",
    reminderLoaded: true,
    ...over,
  };
}

/** Snapshot vom „letzten Start" hinterlegen. */
function seedSnapshot(entries: Record<number, { startUtc: string; title: string; orgId: number }>) {
  const snap: Record<number, unknown> = {};
  for (const [id, e] of Object.entries(entries)) snap[Number(id)] = { ...e, locationName: null };
  storage.seed(SNAP_KEY, JSON.stringify(snap));
}

beforeEach(() => {
  storage.reset();
  notifications.reset();
  storage.seed(FORMAT_KEY, "1"); // einmalige Format-Migration ist längst gelaufen
});

describe("useSavedSync", () => {
  it("gleicht erst gegen frische Netzdaten ab — nicht gegen den Zwischenspeicher", async () => {
    // Der gemeldete Fehler: Beim Start liegen Merkliste, Präferenz und der
    // Zwischenspeicher der letzten Sitzung lange vor der Netzantwort vor. Der
    // Abgleich lief gegen den alten Stand (alt == alt → nichts zu melden), die
    // Netzantwort mit dem verschobenen Termin löste keinen zweiten Lauf aus.
    const T_ALT = inDays(3);
    const T_NEU = inDays(5);
    seedSnapshot({ 1: { startUtc: T_ALT, title: "Gottesdienst", orgId: 5 } });
    const cached = [feature({ id: 1, orgId: 5, startUtc: T_ALT, title: "Gottesdienst" })];
    const fresh = [feature({ id: 1, orgId: 5, startUtc: T_NEU, title: "Gottesdienst" })];

    const hook = await renderHook(useSavedSync, args({ features: cached, saved: new Set([1]) }));
    await flush();
    await flush();
    expect(scheduledRequests().immediate).toHaveLength(0);

    await hook.rerender(args({ features: fresh, saved: new Set([1]), dataUpdatedAt: Date.now() }));
    await vi.waitFor(() => expect(scheduledRequests().immediate).toHaveLength(1));
    expect(scheduledRequests().immediate[0].content.title).toBe("Termin geändert: Gottesdienst");

    // Die Erinnerung steht auf der NEUEN Zeit: Vorabend von T_NEU liegt nach T_ALT.
    await vi.waitFor(() => {
      const map = JSON.parse(storage.peek("kkd:reminderMap") ?? "{}") as Record<number, string[]>;
      expect(map[1]).toHaveLength(1);
    });
    const timed = scheduledRequests().timed;
    const last = timed[timed.length - 1];
    expect(last.content.data).toEqual({ eventId: 1 });
    expect(last.trigger?.date.getTime()).toBeGreaterThan(new Date(T_ALT).getTime());
    await hook.unmount();
  });

  it("wiederholt den Abgleich bei jeder neuen Netzantwort, meldet aber nichts doppelt", async () => {
    const T1 = inDays(3);
    const T2 = inDays(5);
    const T3 = inDays(7);
    seedSnapshot({ 1: { startUtc: T1, title: "Konzert", orgId: 5 } });
    const at = (t: string) => [feature({ id: 1, orgId: 5, startUtc: t, title: "Konzert" })];

    const hook = await renderHook(
      useSavedSync,
      args({ features: at(T2), saved: new Set([1]), dataUpdatedAt: 1_000 })
    );
    await vi.waitFor(() => expect(scheduledRequests().immediate).toHaveLength(1));

    // Gleiche Daten, neuer Abruf (z. B. Versions-Poll) → kein zweiter Hinweis.
    await hook.rerender(args({ features: at(T2), saved: new Set([1]), dataUpdatedAt: 2_000 }));
    await flush();
    await flush();
    expect(scheduledRequests().immediate).toHaveLength(1);

    // Erneut verschoben → wieder ein Hinweis, noch in derselben Sitzung.
    await hook.rerender(args({ features: at(T3), saved: new Set([1]), dataUpdatedAt: 3_000 }));
    await vi.waitFor(() => expect(scheduledRequests().immediate).toHaveLength(2));
    await hook.unmount();
  });

  it("wartet, bis Merkliste und Erinnerungs-Präferenz gelesen sind", async () => {
    seedSnapshot({ 1: { startUtc: inDays(3), title: "Konzert", orgId: 5 } });
    const fresh = [feature({ id: 1, orgId: 5, startUtc: inDays(5), title: "Konzert" })];

    const hook = await renderHook(
      useSavedSync,
      args({ features: fresh, saved: new Set([1]), dataUpdatedAt: 1_000, savedLoaded: false })
    );
    await flush();
    await flush();
    expect(scheduledRequests().immediate).toHaveLength(0);

    await hook.rerender(args({ features: fresh, saved: new Set([1]), dataUpdatedAt: 1_000 }));
    await vi.waitFor(() => expect(scheduledRequests().immediate).toHaveLength(1));
    await hook.unmount();
  });

  it("nimmt entfallene Termine aus der Merkliste und bricht ihre Erinnerung ab", async () => {
    seedSnapshot({ 1: { startUtc: inDays(3), title: "Konzert", orgId: 5 } });
    storage.seed("kkd:reminderMap", JSON.stringify({ 1: ["alt-1"] }));
    const removeMany = vi.fn();

    const hook = await renderHook(
      useSavedSync,
      args({ features: [], saved: new Set([1]), dataUpdatedAt: 1_000, removeMany })
    );
    await vi.waitFor(() => expect(removeMany).toHaveBeenCalledWith([1]));
    await vi.waitFor(() =>
      expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("alt-1")
    );
    await hook.unmount();
  });

  it("bei Teilausfall bleibt der Termin in der Merkliste und die Erinnerung bestehen", async () => {
    seedSnapshot({ 1: { startUtc: inDays(3), title: "Konzert", orgId: 5 } });
    storage.seed("kkd:reminderMap", JSON.stringify({ 1: ["alt-1"] }));
    const removeMany = vi.fn();

    const hook = await renderHook(
      useSavedSync,
      args({
        features: [],
        meta: { orgsFailed: 1, orgsFailedIds: [5] },
        saved: new Set([1]),
        dataUpdatedAt: 1_000,
        removeMany,
      })
    );
    await flush();
    await flush();
    await flush();
    expect(removeMany).not.toHaveBeenCalled();
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith("alt-1");
    expect(scheduledRequests().immediate).toHaveLength(0);
    await hook.unmount();
  });

  it("plant die Erinnerung eines gemerkten Termins nach, wenn sie fehlt", async () => {
    // Geräte, die den Teilausfall-Fehler schon erlitten haben: Herz gesetzt,
    // Snapshot-Eintrag und Erinnerung aber weg. Der Abgleich holt das nach.
    const f = feature({ id: 1, orgId: 5, startUtc: inDays(3), title: "Konzert" });

    const hook = await renderHook(
      useSavedSync,
      args({ features: [f], saved: new Set([1]), dataUpdatedAt: 1_000 })
    );
    await vi.waitFor(() => {
      const map = JSON.parse(storage.peek("kkd:reminderMap") ?? "{}") as Record<number, string[]>;
      expect(map[1]).toHaveLength(1);
    });
    expect(scheduledRequests().timed).toHaveLength(1);
    expect(scheduledRequests().timed[0].content.data).toEqual({ eventId: 1 });
    await hook.unmount();
  });
});

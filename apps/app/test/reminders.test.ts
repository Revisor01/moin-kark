import { beforeEach, describe, expect, it, vi } from "vitest";
import { feature, inDays, notifications, scheduledRequests, storage } from "./helpers";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@react-native-async-storage/async-storage", async () => ({
  default: (await import("./helpers")).storage,
}));
vi.mock("expo-notifications", async () => (await import("./helpers")).notifications);

import {
  MAX_PLANNED_EVENTS,
  cancelForEvent,
  reconcileReminders,
  rescheduleAll,
  scheduleForEvent,
} from "../lib/reminders";

const MAP_KEY = "kkd:reminderMap";
const readMap = () => JSON.parse(storage.peek(MAP_KEY) ?? "{}") as Record<number, string[]>;

beforeEach(() => {
  storage.reset();
  notifications.reset();
});

describe("scheduleForEvent", () => {
  it("merkt sich die erste Mitteilung auch, wenn die zweite Planung fehlschlägt", async () => {
    // Der gemeldete Fehler: Präferenz „Beides", zweite Planung wirft → die Map
    // wurde nicht gespeichert, die erste Mitteilung war nicht mehr abbrechbar
    // und feuerte, obwohl der Termin längst entmerkt war.
    notifications.scheduleNotificationAsync
      .mockResolvedValueOnce("n1")
      .mockRejectedValueOnce(new Error("boom"));
    const f = feature({ id: 7, startUtc: inDays(3) });

    await expect(scheduleForEvent(f, "both")).rejects.toThrow("boom");

    expect(readMap()).toEqual({ 7: ["n1"] });
    await cancelForEvent(7);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("n1");
    expect(readMap()).toEqual({});
  });

  it("plant bei „Beides“ zwei Mitteilungen und verzeichnet beide", async () => {
    const f = feature({ id: 7, startUtc: inDays(3) });
    await scheduleForEvent(f, "both");
    expect(readMap()).toEqual({ 7: ["n1", "n2"] });
    expect(scheduledRequests().timed).toHaveLength(2);
  });
});

describe("Deckel für ausstehende Mitteilungen (iOS: 64)", () => {
  it("rescheduleAll plant höchstens MAX_PLANNED_EVENTS Termine — die nächsten zuerst", async () => {
    expect(MAX_PLANNED_EVENTS).toBe(30);
    // 40 Termine, absichtlich in zufälliger Reihenfolge übergeben.
    const all = Array.from({ length: 40 }, (_, i) => feature({ id: i + 1, startUtc: inDays(i + 2) }));
    const shuffled = [...all].sort((a, b) => (a.properties.id % 7) - (b.properties.id % 7));

    await rescheduleAll(shuffled, "both");

    const timed = scheduledRequests().timed;
    expect(timed).toHaveLength(60);
    const plannedIds = new Set(timed.map((r) => r.content.data?.eventId));
    expect([...plannedIds].sort((a, b) => a! - b!)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1)
    );
    expect(Object.keys(readMap())).toHaveLength(30);
  });
});

describe("reconcileReminders", () => {
  it("plant fehlende Erinnerungen nach und räumt verwaiste ab", async () => {
    storage.seed(MAP_KEY, JSON.stringify({ 2: ["x2"], 99: ["x99"] }));
    const f1 = feature({ id: 1, startUtc: inDays(3) });
    const f2 = feature({ id: 2, startUtc: inDays(4) });

    await reconcileReminders([f1, f2], "evening");

    // Termin 1 hatte keine Erinnerung → genau eine geplant; Termin 2 bleibt unangetastet.
    const timed = scheduledRequests().timed;
    expect(timed).toHaveLength(1);
    expect(timed[0].content.data).toEqual({ eventId: 1 });
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("x99");
    expect(readMap()).toEqual({ 1: ["n1"], 2: ["x2"] });
  });

  it("hält den Deckel: nur die nächsten MAX_PLANNED_EVENTS Termine bleiben geplant", async () => {
    const all = Array.from({ length: 35 }, (_, i) => feature({ id: i + 1, startUtc: inDays(i + 2) }));
    // Vorher war ausgerechnet der späteste Termin geplant — der muss weichen.
    storage.seed(MAP_KEY, JSON.stringify({ 35: ["spaet"] }));

    await reconcileReminders(all, "evening");

    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("spaet");
    const map = readMap();
    expect(Object.keys(map)).toHaveLength(30);
    expect(map[35]).toBeUndefined();
    expect(map[1]).toHaveLength(1);
    expect(map[30]).toHaveLength(1);
  });

  it("bei Präferenz „Aus“ wird nichts geplant und Vorhandenes abgeräumt", async () => {
    storage.seed(MAP_KEY, JSON.stringify({ 1: ["a1"] }));
    await reconcileReminders([feature({ id: 1, startUtc: inDays(3) })], "off");
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("a1");
    expect(readMap()).toEqual({});
  });
});

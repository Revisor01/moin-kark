import { beforeEach, describe, expect, it, vi } from "vitest";
import { feature, inDays, notifications, scheduledRequests, storage } from "./helpers";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@react-native-async-storage/async-storage", async () => ({
  default: (await import("./helpers")).storage,
}));
vi.mock("expo-notifications", async () => (await import("./helpers")).notifications);

import { loadSnapshotStartTimes, syncSavedEvents } from "../lib/savedSync";

const SNAP_KEY = "kkd:savedSnapshot";

beforeEach(() => {
  storage.reset();
  notifications.reset();
});

describe("syncSavedEvents — Teilausfall der API", () => {
  it("meldet bei vollständigem Feed einen entfallenen Termin (Grundfall)", async () => {
    const f = feature({ id: 1, orgId: 5, startUtc: inDays(3), title: "Gottesdienst" });
    await syncSavedEvents([1], [f], { orgsFailed: 0 }); // Snapshot anlegen
    notifications.reset();

    const res = await syncSavedEvents([1], [], { orgsFailed: 0 });

    expect(res.removed).toEqual([1]);
    const { immediate } = scheduledRequests();
    expect(immediate).toHaveLength(1);
    expect(immediate[0].content.title).toBe("Veranstaltung entfällt");
    expect(immediate[0].content.body).toContain("Gottesdienst");
  });

  it("Teilausfall ohne Gemeindeliste: fehlende Termine gelten NICHT als entfallen", async () => {
    // Der gemeldete Fehler: Kirchspiel Eider antwortet einmal nicht, der Feed
    // kommt trotzdem mit Status 200 — bisher: „Veranstaltung entfällt" pro
    // gemerktem Termin, Erinnerung weg, Snapshot-Eintrag weg.
    const f = feature({ id: 1, orgId: 5, startUtc: inDays(3), title: "Gottesdienst" });
    await syncSavedEvents([1], [f], { orgsFailed: 0 });
    notifications.reset();

    const res = await syncSavedEvents([1], [], { orgsFailed: 1 });

    expect(res.removed).toEqual([]);
    expect(scheduledRequests().immediate).toHaveLength(0);
    // Der Snapshot bleibt erhalten — sonst gälte der Termin beim nächsten
    // Abgleich als „erstmals gesehen" und eine Verschiebung bliebe stumm.
    expect(await loadSnapshotStartTimes()).toEqual({ 1: f.properties.startUtc });
  });

  it("nach dem Teilausfall wird eine zwischenzeitliche Verschiebung noch erkannt", async () => {
    const f = feature({ id: 1, orgId: 5, startUtc: inDays(3), title: "Gottesdienst" });
    await syncSavedEvents([1], [f], { orgsFailed: 0 });
    await syncSavedEvents([1], [], { orgsFailed: 1 }); // Gemeinde fehlt
    notifications.reset();

    const moved = feature({ id: 1, orgId: 5, startUtc: inDays(3, 1), title: "Gottesdienst" });
    const res = await syncSavedEvents([1], [moved], { orgsFailed: 0 });

    expect(res.changed).toEqual([1]);
    const { immediate } = scheduledRequests();
    expect(immediate).toHaveLength(1);
    expect(immediate[0].content.title).toBe("Termin geändert: Gottesdienst");
    expect(immediate[0].content.data).toEqual({ eventId: 1 });
  });

  it("Teilausfall MIT Gemeindeliste: nur Termine der ausgefallenen Gemeinden werden geschont", async () => {
    const eider = feature({ id: 1, orgId: 5, startUtc: inDays(3), title: "Eider-Termin" });
    const west = feature({ id: 2, orgId: 7, startUtc: inDays(4), title: "West-Termin" });
    await syncSavedEvents([1, 2], [eider, west], { orgsFailed: 0 });
    notifications.reset();

    // Org 5 ist ausgefallen, Org 7 hat geantwortet — und Termin 2 ist wirklich weg.
    const res = await syncSavedEvents([1, 2], [], { orgsFailed: 1, orgsFailedIds: [5] });

    expect(res.removed).toEqual([2]);
    const { immediate } = scheduledRequests();
    expect(immediate).toHaveLength(1);
    expect(immediate[0].content.body).toContain("West-Termin");
    expect(await loadSnapshotStartTimes()).toEqual({ 1: eider.properties.startUtc });
  });

  it("alter Snapshot ohne Gemeinde-Kennung wird bei Teilausfall geschont, auch mit Gemeindeliste", async () => {
    // Snapshots aus der Store-Fassung kennen keine orgId. Im Zweifel schonen.
    const startUtc = inDays(3);
    storage.seed(
      SNAP_KEY,
      JSON.stringify({ 1: { startUtc, title: "Alt", locationName: null } })
    );

    const res = await syncSavedEvents([1], [], { orgsFailed: 1, orgsFailedIds: [7] });

    expect(res.removed).toEqual([]);
    expect(scheduledRequests().immediate).toHaveLength(0);
    expect(await loadSnapshotStartTimes()).toEqual({ 1: startUtc });
  });

  it("ohne meta (alte Antwortform) verhält sich der Abgleich wie bei vollständigem Feed", async () => {
    const f = feature({ id: 1, orgId: 5, startUtc: inDays(3) });
    await syncSavedEvents([1], [f]);
    notifications.reset();

    const res = await syncSavedEvents([1], []);

    expect(res.removed).toEqual([1]);
    expect(scheduledRequests().immediate).toHaveLength(1);
  });
});

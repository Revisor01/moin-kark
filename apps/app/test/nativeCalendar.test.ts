import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nativeEventData, type CalendarEvent } from "../lib/calendar";

const plattform = vi.hoisted(() => ({ OS: "ios" as "ios" | "android" }));
const kalender = vi.hoisted(() => ({
  createEventInCalendarAsync: vi.fn(),
  requestCalendarPermissionsAsync: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: plattform }));
vi.mock("expo-calendar/legacy", () => kalender);

const { addEventNatively } = await import("../lib/nativeCalendar");

const termin: CalendarEvent = {
  id: 4711,
  title: "Orgelkonzert (Kopie)",
  titleShort: "Orgelkonzert",
  startUtc: "2026-12-24T15:00:00.000Z",
  endUtc: "2026-12-24T16:30:00.000Z",
  allDay: false,
  locationName: "St. Bartholomäus",
  address: "Markt 1",
  zipcode: "25764",
  city: "Wesselburen",
};
const ganztags: CalendarEvent = {
  ...termin,
  allDay: true,
  startUtc: "2026-12-23T23:00:00.000Z",
  endUtc: "2026-12-24T22:59:59.000Z",
};

describe("nativeEventData", () => {
  it("füllt Kurztitel, Zeiten, Ort mit Anschrift, Link und Zeitzone", () => {
    expect(nativeEventData(termin, "ios")).toEqual({
      title: "Orgelkonzert",
      startDate: new Date("2026-12-24T15:00:00.000Z"),
      endDate: new Date("2026-12-24T16:30:00.000Z"),
      allDay: false,
      location: "St. Bartholomäus, Markt 1, 25764 Wesselburen",
      notes: "https://moin-kark.de/event/4711",
      url: "https://moin-kark.de/event/4711",
      timeZone: "Europe/Berlin",
    });
  });

  it("setzt bei unbrauchbarem Ende eine Stunde an und lässt fehlenden Ort weg", () => {
    const d = nativeEventData(
      { ...termin, endUtc: termin.startUtc, locationName: undefined, address: undefined, zipcode: undefined, city: undefined },
      "android"
    );
    expect(d.endDate).toEqual(new Date("2026-12-24T16:00:00.000Z"));
    expect(d.location).toBeUndefined();
  });

  it("ganztägig auf iOS: Berliner Zeiten mit Zeitzone Berlin", () => {
    const d = nativeEventData(ganztags, "ios");
    expect([d.allDay, d.startDate.toISOString(), d.timeZone]).toEqual([true, "2026-12-23T23:00:00.000Z", "Europe/Berlin"]);
  });

  it("ganztägig auf Android: UTC-Mitternacht, Ende exklusiv", () => {
    const d = nativeEventData(ganztags, "android");
    expect([d.startDate.toISOString(), d.endDate.toISOString(), d.timeZone]).toEqual([
      "2026-12-24T00:00:00.000Z",
      "2026-12-25T00:00:00.000Z",
      "UTC",
    ]);
  });
});

describe("addEventNatively", () => {
  beforeEach(() => {
    kalender.createEventInCalendarAsync.mockReset();
    kalender.requestCalendarPermissionsAsync.mockReset();
    plattform.OS = "ios";
  });

  it("öffnet den System-Dialog mit den Termindaten", async () => {
    kalender.createEventInCalendarAsync.mockResolvedValue({ action: "saved", id: "1" });
    expect(await addEventNatively(termin)).toBe(true);
    expect(kalender.createEventInCalendarAsync).toHaveBeenCalledTimes(1);
    expect(kalender.createEventInCalendarAsync.mock.calls[0][0]).toEqual(nativeEventData(termin, "ios"));
    expect(kalender.requestCalendarPermissionsAsync).not.toHaveBeenCalled();
  });

  it("zählt Abbrechen als erledigt", async () => {
    kalender.createEventInCalendarAsync.mockResolvedValue({ action: "canceled", id: null });
    expect(await addEventNatively(termin)).toBe(true);
  });

  it("fragt auf iOS unter 17 nach Zugriff und versucht es einmal neu", async () => {
    kalender.createEventInCalendarAsync.mockRejectedValueOnce(new Error("permission")).mockResolvedValueOnce({ action: "saved" });
    kalender.requestCalendarPermissionsAsync.mockResolvedValue({ granted: true });
    expect(await addEventNatively(termin)).toBe(true);
    expect(kalender.createEventInCalendarAsync).toHaveBeenCalledTimes(2);
  });

  it("gibt false ohne Zugriff, ohne zweiten Versuch", async () => {
    kalender.createEventInCalendarAsync.mockRejectedValue(new Error("permission"));
    kalender.requestCalendarPermissionsAsync.mockResolvedValue({ granted: false });
    expect(await addEventNatively(termin)).toBe(false);
    expect(kalender.createEventInCalendarAsync).toHaveBeenCalledTimes(1);
  });

  it("gibt auf Android bei Fehler false, ohne Berechtigung zu verlangen", async () => {
    plattform.OS = "android";
    kalender.createEventInCalendarAsync.mockRejectedValue(new Error("kein Kalender"));
    expect(await addEventNatively(termin)).toBe(false);
    expect(kalender.requestCalendarPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe("Termin-Blatt", () => {
  const sheet = readFileSync(new URL("../components/EventSheet.tsx", import.meta.url), "utf8");

  it("öffnet nativ nie die .ics-Adresse, weil iOS daraus ein Abo macht", () => {
    const knopf = sheet.slice(sheet.indexOf('art: "termin"'), sheet.indexOf("In den Kalender</Text>"));
    expect(knopf).toContain("addEventNatively(p)");
    expect(knopf).toMatch(/if \(IS_WEB\) \{\s*openCalendar\(addToCalendarUrl/);
    expect(knopf).not.toContain("calendarFileUrl");
  });
});

describe("Einbindung von expo-calendar", () => {
  const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
  const app = JSON.parse(read("app.json")).expo;

  it("braucht ab iOS 17 nur Schreibzugriff und nennt dafür einen deutschen Text", () => {
    const plugin = app.plugins.find((x: unknown) => Array.isArray(x) && x[0] === "expo-calendar");
    expect(plugin[1].writeOnlyAccess).toBe(true);
    const plist = read("ios/MoinKark/Info.plist");
    expect(plist).toMatch(/<key>NSCalendarsWriteOnlyAccessUsageDescription<\/key>\s*<string>Legt Termine/);
    expect(plist).toMatch(/<key>NSCalendarsUsageDescription<\/key>\s*<string>Legt Termine/);
    expect(plist).not.toContain("NSRemindersUsageDescription");
    expect(plist).not.toContain("NSCalendarsFullAccessUsageDescription");
  });

  it("verlangt auf Android keine Kalender-Berechtigung, der Dialog kommt ohne aus", () => {
    expect(app.android.blockedPermissions).toEqual([
      "android.permission.READ_CALENDAR",
      "android.permission.WRITE_CALENDAR",
    ]);
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain('<uses-permission android:name="android.permission.READ_CALENDAR" tools:node="remove"/>');
    expect(manifest).toContain('<uses-permission android:name="android.permission.WRITE_CALENDAR" tools:node="remove"/>');
  });

  it("steht im Podfile.lock", () => {
    expect(read("ios/Podfile.lock")).toContain("- ExpoCalendar (from `../../../node_modules/expo-calendar/ios`)");
  });
});

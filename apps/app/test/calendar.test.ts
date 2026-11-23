import { describe, expect, it } from "vitest";
import {
  addToCalendarUrl,
  calendarFileUrl,
  googleCalendarUrl,
  subscribeUrl,
  usesGoogleCalendar,
  type CalendarEvent,
} from "../lib/calendar";

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

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";

describe("calendarFileUrl", () => {
  it("zeigt außerhalb von /event/, das Android-Apps bis 1.0.x abfangen", () => {
    expect(calendarFileUrl(4711)).toBe("https://api.moin-kark.de/calendar/4711.ics");
  });
});

describe("usesGoogleCalendar", () => {
  it("nimmt Google nur auf Android, nativ wie im Browser", () => {
    expect(usesGoogleCalendar("android")).toBe(true);
    expect(usesGoogleCalendar("web", ANDROID_UA)).toBe(true);
    expect(usesGoogleCalendar("web", IPHONE_UA)).toBe(false);
    expect(usesGoogleCalendar("web")).toBe(false);
    expect(usesGoogleCalendar("ios")).toBe(false);
  });
});

describe("googleCalendarUrl", () => {
  it("füllt Titel, Zeit in UTC, Zeitzone, Ort und Link", () => {
    const url = new URL(googleCalendarUrl(termin));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: "TEMPLATE",
      text: "Orgelkonzert",
      dates: "20261224T150000Z/20261224T163000Z",
      ctz: "Europe/Berlin",
      details: "https://moin-kark.de/event/4711",
      location: "St. Bartholomäus, Markt 1, 25764 Wesselburen",
    });
  });

  it("nimmt ohne Kurztitel den Titel und lässt fehlenden Ort weg", () => {
    const url = new URL(googleCalendarUrl({ ...termin, titleShort: undefined, locationName: undefined, address: undefined, zipcode: undefined, city: undefined }));
    expect(url.searchParams.get("text")).toBe("Orgelkonzert (Kopie)");
    expect(url.searchParams.has("location")).toBe(false);
  });

  it("schreibt ganztägige Termine als Berliner Datum mit exklusivem Ende", () => {
    const url = new URL(
      googleCalendarUrl({ ...termin, allDay: true, startUtc: "2026-12-23T23:00:00.000Z", endUtc: "2026-12-24T22:59:59.000Z" })
    );
    expect(url.searchParams.get("dates")).toBe("20261224/20261225");
  });

  it("setzt bei unbrauchbarem Ende eine Stunde an", () => {
    const url = new URL(googleCalendarUrl({ ...termin, endUtc: termin.startUtc }));
    expect(url.searchParams.get("dates")).toBe("20261224T150000Z/20261224T160000Z");
  });
});

describe("addToCalendarUrl", () => {
  it("gibt iOS und Desktop die Kalenderdatei, Android die Google-Vorlage", () => {
    expect(addToCalendarUrl(termin, "ios")).toBe("https://api.moin-kark.de/calendar/4711.ics");
    expect(addToCalendarUrl(termin, "web", IPHONE_UA)).toBe("https://api.moin-kark.de/calendar/4711.ics");
    expect(addToCalendarUrl(termin, "android")).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&/);
  });
});

describe("subscribeUrl", () => {
  it("abonniert per webcal, auf Android über Google Kalender", () => {
    expect(subscribeUrl("Büsum", "ios")).toBe("webcal://api.moin-kark.de/calendar.ics?parish=B%C3%BCsum");
    expect(subscribeUrl("Heide", "web", IPHONE_UA)).toBe("webcal://api.moin-kark.de/calendar.ics?parish=Heide");
    expect(subscribeUrl("Heide", "android")).toBe(
      "https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fapi.moin-kark.de%2Fcalendar.ics%3Fparish%3DHeide"
    );
  });
});

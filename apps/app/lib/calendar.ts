// Termin in den eigenen Kalender: .ics für Apple und Desktop, Google-Kalender auf Android.

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "https://api.moin-kark.de";

export type CalendarPlatform = "ios" | "android" | "web";

/** Unter /calendar/, weil Android-Apps bis 1.0.x jeden /event/-Link selbst öffnen. */
export function calendarFileUrl(id: number): string {
  return `${API_BASE}/calendar/${id}.ics`;
}

/** Android und Android-Browser: Google Kalender kann keine .ics-Datei öffnen, nur diese Vorlage. */
export function usesGoogleCalendar(platform: CalendarPlatform, userAgent?: string): boolean {
  if (platform === "android") return true;
  return platform === "web" && /android/i.test(userAgent ?? "");
}

/** UTC-Schreibweise der Google-Vorlage: 20261224T160000Z. */
function googleStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Ganztägig: Datum in Berliner Zeit, Ende exklusiv. */
function berlinDate(iso: string, plusDays = 0): string {
  const d = new Date(new Date(iso).getTime() + plusDays * 86400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/-/g, "");
}

export interface CalendarEvent {
  id: number;
  title: string;
  titleShort?: string;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  locationName?: string;
  address?: string;
  zipcode?: string;
  city?: string;
}

/** Vorlage „Termin anlegen“ im Google Kalender, mit Link zurück zum Termin. */
export function googleCalendarUrl(p: CalendarEvent): string {
  const start = new Date(p.startUtc).getTime();
  const endRaw = new Date(p.endUtc).getTime();
  const endIso = new Date(Number.isFinite(endRaw) && endRaw > start ? endRaw : start + 3600_000).toISOString();
  const dates = p.allDay
    ? `${berlinDate(p.startUtc)}/${berlinDate(endIso, 1)}`
    : `${googleStamp(p.startUtc)}/${googleStamp(endIso)}`;
  const location = [p.locationName, p.address, [p.zipcode, p.city].filter(Boolean).join(" ")]
    .filter((x) => !!x && x.trim() !== "")
    .join(", ");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: p.titleShort ?? p.title,
    dates,
    ctz: "Europe/Berlin",
    details: `https://moin-kark.de/event/${p.id}`,
  });
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Ziel für „In den Kalender“. */
export function addToCalendarUrl(p: CalendarEvent, platform: CalendarPlatform, userAgent?: string): string {
  return usesGoogleCalendar(platform, userAgent) ? googleCalendarUrl(p) : calendarFileUrl(p.id);
}

/** Abo aller Termine einer Gemeinde: webcal für Apple und Desktop, Google Kalender auf Android. */
export function subscribeUrl(parish: string, platform: CalendarPlatform, userAgent?: string): string {
  const https = `${API_BASE}/calendar.ics?parish=${encodeURIComponent(parish)}`;
  const webcal = https.replace(/^https?:/, "webcal:");
  if (usesGoogleCalendar(platform, userAgent))
    return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  return webcal;
}

/** Felder für den System-Dialog „Termin anlegen“ (iOS EKEventEditViewController, Android ACTION_INSERT). */
export interface NativeEventData {
  title: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  location?: string;
  notes: string;
  url: string;
  timeZone: string;
}

/** Berliner Kalendertag als UTC-Mitternacht; Android erwartet ganztägige Termine so. */
function berlinDayUtc(iso: string, plusDays = 0): Date {
  const [y, m, d] = berlinDate(iso).match(/^(\d{4})(\d{2})(\d{2})$/)!.slice(1).map(Number);
  return new Date(Date.UTC(y, m - 1, d + plusDays));
}

export function nativeEventData(p: CalendarEvent, platform: "ios" | "android"): NativeEventData {
  const start = new Date(p.startUtc);
  const endRaw = new Date(p.endUtc).getTime();
  const end = new Date(Number.isFinite(endRaw) && endRaw > start.getTime() ? endRaw : start.getTime() + 3600_000);
  const location = [p.locationName, p.address, [p.zipcode, p.city].filter(Boolean).join(" ")]
    .filter((x) => !!x && x.trim() !== "")
    .join(", ");
  const link = `https://moin-kark.de/event/${p.id}`;
  // Ganztägig: Android rechnet in UTC-Tagen mit exklusivem Ende, iOS nimmt den Tag in der Zeitzone des Termins.
  const androidAllDay = p.allDay && platform === "android";
  const lastDayIso = new Date(end.getTime() - 1000).toISOString();
  return {
    title: p.titleShort ?? p.title,
    startDate: androidAllDay ? berlinDayUtc(p.startUtc) : start,
    endDate: androidAllDay ? berlinDayUtc(lastDayIso, 1) : end,
    allDay: p.allDay,
    location: location || undefined,
    notes: link,
    url: link,
    timeZone: androidAllDay ? "UTC" : "Europe/Berlin",
  };
}

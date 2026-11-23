// Kalenderdateien nach RFC 5545: einzelner Termin und Abo mit Filtern.

import { normalizeKey, parishLabel, type EventFeature } from "@moinkark/shared";

const CRLF = "\r\n";
const PRODID = "-//Moin Kark//Termine Kirchenkreis Dithmarschen//DE";
const UID_DOMAIN = "moin-kark.de";
const SHARE_BASE = "https://moin-kark.de/event/";

/** Europe/Berlin mit den Regeln seit 1996; Kalender ohne Zeitzonendatenbank brauchen den Block. */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "X-LIC-LOCATION:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** TEXT-Werte: Backslash, Semikolon, Komma und Zeilenumbruch maskieren (RFC 5545, 3.3.11). */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Zeilen über 75 Oktette falten, ohne ein UTF-8-Zeichen zu zerteilen (RFC 5545, 3.1). */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  // Folgezeilen beginnen mit einem Leerzeichen, das mitzählt.
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74;
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

const berlinParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function berlin(d: Date): { date: string; time: string } {
  const p = Object.fromEntries(berlinParts.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}${p.month}${p.day}`, time: `${p.hour}${p.minute}${p.second}` };
}

/** UTC-Zeitstempel für DTSTAMP. */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Folgetag eines Datums YYYYMMDD. */
function nextDay(yyyymmdd: string): string {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8) + 1));
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** HTML grob zu Text, wie im Termin-Blatt; Redaktions-Marker fallen weg. */
function htmlToText(html?: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .split("\n")
    .filter((l) => !/^\s*(KAT|URL|INFO|TAG|TAGS|LINK|BILD|FOTO|INTERN)\s*:/i.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function prop(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

/** Ein VEVENT; DTSTAMP kommt vom Datenstand, damit dieselbe Datei bei gleichem Stand gleich bleibt. */
export function veventLines(f: EventFeature, stamp: Date): string[] {
  const p = f.properties;
  const start = new Date(p.startUtc);
  const endRaw = new Date(p.endUtc);
  const end = Number.isFinite(endRaw.getTime()) && endRaw > start ? endRaw : new Date(start.getTime() + 3600_000);
  const lines = ["BEGIN:VEVENT", `UID:${p.id}@${UID_DOMAIN}`, `DTSTAMP:${utcStamp(stamp)}`];

  if (p.allDay) {
    const s = berlin(start).date;
    // Ganztägig endet in ChurchDesk am letzten Tag kurz vor Mitternacht; DTEND ist exklusiv.
    const e = berlin(new Date(end.getTime() - 1000)).date;
    lines.push(`DTSTART;VALUE=DATE:${s}`, `DTEND;VALUE=DATE:${nextDay(e < s ? s : e)}`);
  } else {
    const s = berlin(start);
    const e = berlin(end);
    lines.push(`DTSTART;TZID=Europe/Berlin:${s.date}T${s.time}`, `DTEND;TZID=Europe/Berlin:${e.date}T${e.time}`);
  }

  const title = p.titleShort ?? p.title;
  lines.push(prop("SUMMARY", escapeText(title)));

  const ort = [p.locationName, p.address, [p.zipcode, p.city].filter(Boolean).join(" ")]
    .filter((x): x is string => !!x && x.trim() !== "")
    .filter((x, i, all) => all.indexOf(x) === i)
    .join(", ");
  if (ort) lines.push(prop("LOCATION", escapeText(ort)));
  const [lng, lat] = f.geometry.coordinates;
  lines.push(`GEO:${lat.toFixed(6)};${lng.toFixed(6)}`);

  const gemeinde = p.parishLabel ?? (p.parish ? parishLabel(p.parish) : undefined);
  const text = (p.summary?.trim() || htmlToText(p.descriptionHtml)).trim();
  const desc = [
    title !== p.title ? p.title : "",
    text,
    gemeinde ? `Kirchengemeinde ${gemeinde}` : "",
    p.price ? `Eintritt: ${p.price}` : "",
    `${SHARE_BASE}${p.id}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  lines.push(prop("DESCRIPTION", escapeText(desc)));
  lines.push(prop("URL", `${SHARE_BASE}${p.id}`));
  const cats = p.categories.map((c) => escapeText(c.title)).filter(Boolean);
  if (cats.length) lines.push(prop("CATEGORIES", cats.join(",")));
  lines.push("END:VEVENT");
  return lines;
}

/** Ganzer Kalender; endet mit CRLF, wie RFC 5545 es für jede Zeile verlangt. */
export function buildCalendar(
  features: EventFeature[],
  opts: { name: string; stamp: Date; subscription?: boolean }
): string {
  const head = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    prop("X-WR-CALNAME", escapeText(opts.name)),
    "X-WR-TIMEZONE:Europe/Berlin",
  ];
  // Abos holen sich stündlich den neuen Stand.
  if (opts.subscription) head.push("REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H");
  const body = features.flatMap((f) => veventLines(f, opts.stamp));
  return [...head, ...VTIMEZONE, ...body, "END:VCALENDAR"].join(CRLF) + CRLF;
}

/** Kommagetrennte Filterwerte, normalisiert wie Tabellen und /admin. */
function filterValues(raw?: string): string[] {
  return (raw ?? "")
    .split(",")
    .map((v) => normalizeKey(v))
    .filter(Boolean);
}

export interface CalendarFilter {
  parish?: string;
  category?: string;
  kirchspiel?: string;
}

/** Filter fürs Abo: Gemeinde roh oder als Anzeige-Name, Kategorie, Kirchspiel; innerhalb eines Filters reicht ein Treffer. */
export function filterFeatures(features: EventFeature[], filter: CalendarFilter): EventFeature[] {
  const parishes = filterValues(filter.parish);
  const categories = filterValues(filter.category);
  const kirchspiele = filterValues(filter.kirchspiel);
  return features.filter((f) => {
    const p = f.properties;
    if (parishes.length) {
      const names = (p.parishes ?? (p.parish ? [p.parish] : [])).flatMap((n) => [
        normalizeKey(n),
        normalizeKey(parishLabel(n)),
      ]);
      if (!parishes.some((x) => names.includes(x))) return false;
    }
    if (categories.length && !p.categories.some((c) => categories.includes(normalizeKey(c.title))))
      return false;
    if (kirchspiele.length && !kirchspiele.includes(normalizeKey(p.kirchspiel))) return false;
    return true;
  });
}

/** Name des Abos, damit es im Kalender nicht nur „Moin Kark“ heißt. */
export function calendarName(filter: CalendarFilter): string {
  const teile = [filter.parish, filter.category, filter.kirchspiel && `Kirchspiel ${filter.kirchspiel}`]
    .map((t) => t?.trim())
    .filter(Boolean);
  return teile.length ? `Moin Kark: ${teile.join(", ")}` : "Moin Kark: alle Termine";
}

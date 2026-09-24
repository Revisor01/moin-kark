// Moin Kark API — Read-Only Aggregator für die Kirchenkreis-Dithmarschen-Eventkarte.
// Hält die 14 ChurchDesk-Read-Tokens server-seitig, liefert ein dedupliziertes GeoJSON.

import { createHash, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import {
  LOCATION_COORD_FIXES,
  TITLE_COORD_FIXES,
  TITLE_OVERRIDES,
  type EventFeatureCollection,
} from "@moinkark/shared";
import { buildFeatureCollection, extractCategories, EXCLUDED_CATEGORIES } from "./aggregate.js";
import { fmtDate } from "./churchdesk.js";
import { SwrCache } from "./cache.js";
import { hasHighlightTag } from "./geojson.js";
import {
  getOverrides,
  InvalidOverridesError,
  loadOverrides,
  overridesLoadError,
  setOverrides,
} from "./locations.js";
import {
  adminPage,
  eventPreviewPage,
  statusPage,
  type FallbackGroup,
  type StatusData,
} from "./pages.js";

// Laufzeit-Korrekturen beim Import lesen, nicht erst im serve()-Callback: Sonst
// bleibt der Ladezustand "unloaded", solange kein Server läuft (Tests, künftige
// Einbindung als Modul) — und in diesem Zustand ist Speichern gesperrt, obwohl
// die Datei in Ordnung ist. Der Zustand muss stehen, bevor der erste Request
// /admin erreicht; der Aufruf ist idempotent und ohne Datei ein No-op.
loadOverrides();

/**
 * Zahl aus der Umgebung, mit Rückfall auf den Standard.
 *
 * Ohne die Prüfung würde ein Tippfehler (CACHE_TTL_MS=abc) zu NaN führen: der
 * Cache gälte nie als frisch und setInterval(…, NaN) feuerte im Millisekundentakt
 * gegen ChurchDesk; ein NaN-Fenster ließe zudem jede Anfrage mit 500 scheitern.
 */
function envInt(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) {
    console.warn(`[moinkark-api] ${name}="${raw}" ist ungültig — nutze ${fallback}.`);
    return fallback;
  }
  return Math.floor(n);
}

const PORT = envInt("PORT", 8787);
const TTL_MS = envInt("CACHE_TTL_MS", 20 * 60 * 1000); // 20 min
const DEFAULT_DAYS = envInt("DEFAULT_WINDOW_DAYS", 60);

/**
 * Mindestlänge des Admin-Tokens. Der Vergleich ist konstantzeitig, aber die
 * Sicherheit hängt allein an der Entropie des Tokens — und ein einstelliger
 * Wert wurde bisher genauso angenommen wie ein langer. Zu kurz ⇒ /admin bleibt
 * aus, als wäre gar keins gesetzt (Warnung im Log statt stiller Annahme).
 */
const ADMIN_TOKEN_MIN_LENGTH = 24;
const ADMIN_TOKEN = readAdminToken();

function readAdminToken(): string | undefined {
  const raw = process.env.ADMIN_TOKEN?.trim();
  if (!raw) return undefined;
  if (raw.length < ADMIN_TOKEN_MIN_LENGTH) {
    console.warn(
      `[moinkark-api] ADMIN_TOKEN ist kürzer als ${ADMIN_TOKEN_MIN_LENGTH} Zeichen — /admin bleibt deaktiviert.`
    );
    return undefined;
  }
  return raw;
}

/** Feed-Antworten dürfen eine Minute lang aus Browser- und Proxy-Caches kommen. */
const FEED_CACHE_CONTROL = "public, max-age=60";
/** Fester Text für Clients — die Ursache steht im Log, nicht in der Antwort. */
const FEED_UNAVAILABLE = "Datenstand nicht verfügbar.";

// CORS-Allowlist: kommagetrennt in ALLOWED_ORIGINS, sonst Dev-Defaults.
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ??
  "http://localhost:8081,http://localhost:19006,http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const cache = new SwrCache<EventFeatureCollection>({ ttlMs: TTL_MS });

/**
 * Das Zeitfenster ist serverseitig fest: heute + DEFAULT_DAYS. Die frühere
 * `?from=`/`?to=`-Unterstützung ist bewusst entfernt — kein Client nutzte sie,
 * aber jeder beliebige Parameter erzeugte einen eigenen Cache-Eintrag samt
 * kompletter 14-Org-Fetch-Kaskade (Token- und Speicher-Schutz).
 */
function currentWindow(): { from: Date; to: Date; key: string } {
  const from = new Date();
  // Endtag als Berliner Kalenderdatum: heutiger Berliner Tag + DEFAULT_DAYS.
  // Ein Millisekunden-Offset (DEFAULT_DAYS × 24 h) ergäbe über einen
  // Zeitumstellungs-Wechsel hinweg kurz nach Mitternacht 59 oder 61 Tage.
  // Mittag UTC liegt in Berlin immer am selben Kalendertag (13/14 Uhr).
  const [y, m, d] = fmtDate(from).split("-").map(Number);
  const to = new Date(Date.UTC(y, m - 1, d + DEFAULT_DAYS, 12));
  // Schlüssel über den Berliner Kalendertag (wie das Abfragefenster selbst) —
  // mit UTC würde er kurz nach Mitternacht noch auf den Vortag zeigen.
  const key = `${fmtDate(from)}_${fmtDate(to)}`;
  return { from, to, key };
}

function getCollection(): Promise<EventFeatureCollection> {
  const { from, to, key } = currentWindow();
  return cache.get(key, () => buildFeatureCollection(from, to));
}

const app = new Hono();

// Das GeoJSON ist ~700 KB und geht überwiegend an Mobilfunk-Clients; gzip drückt
// das auf einen Bruchteil. Muss VOR den Routen stehen, um deren Antworten zu sehen.
app.use("*", compress());

app.use(
  "*",
  cors({
    // Fremde Origins bekommen keinen Allow-Origin-Header (null) statt fälschlich
    // den ersten erlaubten — der Browser blockt so oder so, aber das ist die
    // ehrliche Antwort und im Debugging eindeutig.
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
  })
);

app.get("/", (c) => c.json({ service: "moinkark-api", status: "ok" }));

/**
 * Betriebszustand aus dem jüngsten Datenstand — ohne selbst einen Fetch
 * auszulösen (der Auto-Refresh hält den Cache warm):
 * - ok:       Daten da, alle Orgs haben geantwortet.
 * - degraded: Daten da, aber mind. eine Org fiel beim letzten Refresh aus
 *             (z. B. abgelaufener Einzeltoken — deren Events fehlen still!)
 *             oder hat gar kein Token (beim Redeploy verlorene ENV-Zeile —
 *             deren Events fehlen dauerhaft, ohne je als Ausfall zu zählen).
 * - stale:    letzter erfolgreicher Refresh liegt > 3×TTL zurück (Refresh hängt/scheitert).
 * - starting: noch gar kein Datenstand (Kaltstart).
 */
function statusData(): StatusData & { orgsConfigured?: number; orgsMissing?: number } {
  const latest = cache.peekLatest();
  const meta = latest?.value.meta;
  if (!latest || !meta) return { status: "starting", fallback: [] };
  const ageSeconds = (Date.now() - latest.updatedAt) / 1000;
  const orgsMissing = meta.orgsMissing ?? 0;
  const status: StatusData["status"] =
    ageSeconds > (3 * TTL_MS) / 1000
      ? "stale"
      : meta.orgsFailed > 0 || orgsMissing > 0
        ? "degraded"
        : "ok";

  // Fallback-Sichtfenster: Welche Orte liegen mangels Koordinate auf dem
  // Gemeinde-Pin? Gruppiert nach Ortsname (bzw. Gemeinde, wenn keiner gepflegt ist).
  const groups = new Map<string, FallbackGroup>();
  for (const f of latest.value.features) {
    if (f.properties.coordSource !== "fallback") continue;
    const name =
      f.properties.locationName ?? `(kein Ortsname) — ${f.properties.parish ?? f.properties.orgName}`;
    const g = groups.get(name) ?? { name, count: 0, titles: [] };
    g.count++;
    if (!g.titles.includes(f.properties.title)) g.titles.push(f.properties.title);
    groups.set(name, g);
  }
  const fallback = [...groups.values()].sort((a, b) => b.count - a.count);

  return {
    status,
    generatedAt: meta.generatedAt,
    ageSeconds,
    events: meta.total,
    orgsOk: meta.orgsOk,
    orgsFailed: meta.orgsFailed,
    orgsConfigured: meta.orgsConfigured,
    orgsMissing,
    withEventCoords: meta.withEventCoords,
    fallback,
  };
}

app.get("/healthz", (c) => {
  const d = statusData();
  const http = d.status === "ok" || d.status === "degraded" ? 200 : 503;
  return c.json(
    {
      status: d.status,
      events: d.events,
      orgsOk: d.orgsOk,
      orgsFailed: d.orgsFailed,
      orgsConfigured: d.orgsConfigured,
      orgsMissing: d.orgsMissing,
      generatedAt: d.generatedAt,
      cacheAgeSeconds: d.ageSeconds == null ? undefined : Math.round(d.ageSeconds),
    },
    http
  );
});

app.get("/status.json", (c) => c.json(statusData()));
app.get("/status", (c) => c.html(statusPage(statusData())));

/**
 * Gemeinsamer Rahmen der drei Feed-Routen: Datenstand holen, Kennung als ETag
 * mitgeben und bei passendem If-None-Match mit 304 ohne Inhalt antworten.
 *
 * Zwischen zwei Refreshes ist der Feed byte-identisch — ohne Kennung im Header
 * serialisierte und komprimierte der Server ~700 KB trotzdem für jede Anfrage
 * neu (gemessen 4,4 ms CPU pro Aufruf). Der Fingerprint existiert für
 * /version.json ohnehin; als ETag ist er fertig.
 *
 * Fehler gehen als fester Text nach außen: Die interne Meldung nannte u. a. das
 * Schema der Token-Variablen und Dateipfade — die gehören ins Log.
 */
async function feedResponse(
  c: Context,
  body: (fc: EventFeatureCollection) => unknown
): Promise<Response> {
  let fc: EventFeatureCollection;
  try {
    fc = await getCollection();
  } catch (e: any) {
    console.error(`[${c.req.path}]`, e?.message ?? e);
    return c.json({ error: FEED_UNAVAILABLE }, 500);
  }
  const etag = etagFor(fc);
  c.header("ETag", etag);
  c.header("Cache-Control", FEED_CACHE_CONTROL);
  if (etagMatches(c.req.header("If-None-Match"), etag)) return c.body(null, 304);
  return c.json(body(fc));
}

/**
 * ETag von vornherein schwach (W/): Die Compress-Middleware liefert den Feed
 * gzip-kodiert und stufte einen starken ETag ohnehin auf W/ herab — so ist die
 * Kennung auf 200 und 304 dieselbe, und der Client schickt genau sie zurück.
 */
function etagFor(fc: EventFeatureCollection): string {
  return `W/"${fingerprintOf(fc)}"`;
}

/** If-None-Match: Liste von Kennungen, schwach oder stark, oder `*`. */
function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const want = etag.replace(/^W\//, "");
  return header.split(",").some((t) => {
    const tag = t.trim();
    return tag === "*" || tag.replace(/^W\//, "") === want;
  });
}

app.get("/events.geojson", (c) => feedResponse(c, (fc) => fc));

/**
 * Kurz-Kennung des aktuellen Datenbestands (Hash über alle Events).
 *
 * Die App fragt das alle paar Minuten ab — die Antwort ist ein paar Bytes groß
 * statt ~700 KB. Ändert sich der Hash, lädt sie das GeoJSON neu. So kommen
 * redaktionelle Änderungen (Highlight gesetzt, Titel korrigiert, Termin abgesagt)
 * zeitnah an, ohne dass jedes Gerät im Minutentakt den vollen Feed zieht.
 */
function fingerprint(fc: EventFeatureCollection): string {
  const h = createHash("sha1");
  // Alle Felder, die in der App sichtbar sind — auch Beschreibung, Bild und
  // Kategorien: eine korrigierte Beschreibung muss ankommen, und Kategorien
  // steuern zusätzlich die Filter-Chips.
  //
  // Zeilen werden vor dem Hashen sortiert, weil die Feature-Reihenfolge sonst aus
  // den ChurchDesk-Antworten stammt. Liefert die API dieselben Events anders
  // sortiert, änderte sich der Hash ohne inhaltliche Änderung — und jedes Gerät
  // lüde ~700 KB umsonst.
  const lines = fc.features.map((f) => {
    const p = f.properties;
    return (
      `${p.id}|${p.startUtc}|${p.endUtc ?? ""}|${p.allDay ? 1 : 0}|${p.showEndtime ? 1 : 0}|` +
      `${p.title}|${p.highlight ? 1 : 0}|` +
      `${f.geometry.coordinates.join(",")}|${p.locationName ?? ""}|` +
      `${p.summary ?? ""}|${p.descriptionHtml ?? ""}|${p.image?.url ?? ""}|` +
      `${p.categories.map((c) => c.id).join(",")}|${p.parish ?? ""}|${p.parishes?.join(",") ?? ""}|` +
      `${p.contributor ?? ""}|${p.address ?? ""}|${p.city ?? ""}|${p.zipcode ?? ""}|${p.price ?? ""}`
    );
  });
  lines.sort();
  for (const line of lines) h.update(`${line}\n`);
  return h.digest("hex").slice(0, 16);
}

/**
 * Fingerprint je Datenstand nur einmal rechnen: Der Cache hält dasselbe Objekt
 * bis zum nächsten Refresh, und seit dem ETag braucht ihn jede Feed-Anfrage.
 */
const fingerprints = new WeakMap<EventFeatureCollection, string>();
function fingerprintOf(fc: EventFeatureCollection): string {
  let fp = fingerprints.get(fc);
  if (!fp) {
    fp = fingerprint(fc);
    fingerprints.set(fc, fp);
  }
  return fp;
}

app.get("/version.json", (c) =>
  feedResponse(c, (fc) => ({ version: fingerprintOf(fc), count: fc.features.length }))
);

app.get("/categories.json", (c) => feedResponse(c, (fc) => extractCategories(fc)));

/**
 * Zuordnungsdateien für Universal Links (iOS) und App Links (Android).
 *
 * Geteilt wird `api.moin-kark.de/event/<id>` (wegen der Link-Vorschau) — damit
 * eine installierte App diesen Link abfängt statt ihn an den Browser zu geben,
 * müssen die Dateien auf DIESER Domain liegen, nicht nur auf der Karte. Der
 * vHost reicht alles an die API durch, deshalb liefert sie sie selbst aus.
 *
 * `apple-app-site-association` braucht `application/json` und darf keine
 * Endung tragen; eine Weiterleitung würde Apple ebenfalls ablehnen.
 */
const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: ["J459G9CJT5.de.godsapp.kkdithkarte"],
        components: [{ "/": "/event/*", comment: "Geteilte Termin-Links oeffnen die App." }],
      },
    ],
  },
};

/**
 * Der Fingerprint ist der Play-App-Signaturschlüssel. Google signiert im Store
 * neu, der lokale Upload-Schlüssel gilt dort nicht — steht der falsche Wert
 * hier, öffnet Android den Link im Browser statt in der App (iOS ist davon
 * nicht betroffen). Quelle: Play Console → Setup → App-Signatur.
 */
const ANDROID_CERT_SHA256 =
  process.env.ANDROID_CERT_SHA256 ??
  "18:D5:77:27:01:51:EC:2D:51:23:9F:48:EE:56:77:21:53:30:F1:24:6B:87:2E:33:3C:C5:24:D8:1E:D4:97:BC";

app.get("/.well-known/apple-app-site-association", (c) => {
  c.header("Content-Type", "application/json");
  return c.body(JSON.stringify(APPLE_APP_SITE_ASSOCIATION));
});

app.get("/.well-known/assetlinks.json", (c) =>
  c.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "de.godsapp.moinkark",
        sha256_cert_fingerprints: [ANDROID_CERT_SHA256],
      },
    },
  ])
);

/** Datum und Uhrzeit eines Termins, deutsch, in Berliner Zeit. */
function previewTime(startUtc: string, allDay?: boolean): string {
  const d = new Date(startUtc);
  const datum = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    timeZone: "Europe/Berlin",
  }).format(d);
  if (allDay) return `${datum} · ganztägig`;
  const zeit = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(d);
  return `${datum}, ${zeit} Uhr`;
}

/**
 * Link-Vorschau für geteilte Termine. Die Web-Karte ist eine Single-Page-App;
 * Crawler sehen dort nur ein leeres Grundgerüst, ein geteilter Link erschien
 * deshalb ohne Bild und Text. Diese Seite liefert die Metadaten und leitet
 * Menschen sofort auf die Karte weiter.
 */
app.get("/event/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.notFound();

  let fc: EventFeatureCollection;
  try {
    fc = await getCollection();
  } catch (e: any) {
    console.error(`[${c.req.path}]`, e?.message ?? e);
    return c.json({ error: FEED_UNAVAILABLE }, 500);
  }

  const f = fc.features.find((x) => x.properties.id === id);
  // Abgesagt, vorbei oder nie dagewesen — alles dasselbe aus Sicht des Links.
  if (!f) return c.notFound();

  const p = f.properties;
  const place = [p.locationName, p.parish].filter(Boolean).join(", ");
  return c.html(
    eventPreviewPage({
      id: p.id,
      title: p.title,
      time: previewTime(p.startUtc, p.allDay),
      place,
      imageUrl: p.image?.url,
    })
  );
});

// --- Admin: Orts-Korrekturen pflegen (Token in ADMIN_TOKEN, sonst deaktiviert) ---

/** Konstantzeit-Vergleich über SHA-256 (verhindert Timing- und Längen-Leaks). */
function tokenOk(header: string | undefined): boolean {
  if (!ADMIN_TOKEN || !header?.startsWith("Bearer ")) return false;
  const given = createHash("sha256").update(header.slice(7).trim()).digest();
  const want = createHash("sha256").update(ADMIN_TOKEN).digest();
  return timingSafeEqual(given, want);
}

/**
 * Fehlversuche je Adresse: ab AUTH_FAIL_LIMIT innerhalb des Fensters 429 —
 * auch für das richtige Token, bis das Fenster abläuft. Ohne das ließe sich
 * ein Token unbegrenzt schnell durchprobieren.
 *
 * Die Adresse kommt aus X-Real-IP (setzt Apache aus REMOTE_ADDR, überschreibt
 * damit, was der Client schickt), sonst aus dem ersten X-Forwarded-For-Eintrag.
 * Ohne beides (lokal, Tests) landen alle in einem Topf — dort gibt es nur einen.
 */
const AUTH_FAIL_LIMIT = 10;
const AUTH_FAIL_WINDOW_MS = 60_000;
const authFailures = new Map<string, { count: number; until: number }>();

function clientAddress(c: Context): string {
  return (
    c.req.header("x-real-ip")?.trim() ||
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

function authBlocked(address: string): boolean {
  const entry = authFailures.get(address);
  if (!entry) return false;
  if (entry.until <= Date.now()) {
    authFailures.delete(address);
    return false;
  }
  return entry.count >= AUTH_FAIL_LIMIT;
}

function noteAuthFailure(address: string): void {
  const now = Date.now();
  const entry = authFailures.get(address);
  if (!entry || entry.until <= now) {
    authFailures.set(address, { count: 1, until: now + AUTH_FAIL_WINDOW_MS });
  } else {
    entry.count++;
  }
  // Abgelaufene Einträge nur bei Bedarf ausmisten — hält die Map klein, ohne Timer.
  if (authFailures.size > 1000)
    for (const [k, e] of authFailures) if (e.until <= now) authFailures.delete(k);
}

app.get("/admin", (c) => c.html(adminPage()));

app.use("/admin/api/*", async (c, next) => {
  if (!ADMIN_TOKEN)
    return c.json({ error: "Admin deaktiviert (ADMIN_TOKEN nicht gesetzt oder zu kurz)." }, 503);
  const address = clientAddress(c);
  if (authBlocked(address))
    return c.json({ error: "Zu viele Fehlversuche — bitte eine Minute warten." }, 429);
  if (!tokenOk(c.req.header("Authorization"))) {
    noteAuthFailure(address);
    return c.json({ error: "unauthorized" }, 401);
  }
  authFailures.delete(address);
  await next();
});

app.get("/admin/api/locations", (c) => {
  // Aktuelle Feed-Kategorien als Klick-Vorschläge fürs Ausschließen. Bereits
  // ausgeschlossene tauchen im Feed nicht mehr auf — die Overrides-Liste selbst
  // bleibt aber sichtbar, darüber lässt sich ein Ausschluss wieder aufheben.
  const latest = cache.peekLatest();
  return c.json({
    static: {
      locations: LOCATION_COORD_FIXES,
      // force = Präfix steht in TITLE_OVERRIDES (überstimmt ChurchDesk-Koordinate).
      titles: TITLE_COORD_FIXES.map((t) => ({
        ...t,
        force: TITLE_OVERRIDES.includes(t.prefix),
      })),
      excludedCategories: [...EXCLUDED_CATEGORIES],
    },
    overrides: getOverrides(),
    feedCategories: latest ? extractCategories(latest.value).map((cat) => cat.title) : [],
    // Konnte die Overrides-Datei beim Start nicht gelesen werden, ist Speichern
    // gesperrt (sonst überschriebe der leere Stand die Korrekturen auf Platte).
    // Die Oberfläche muss das vor dem ersten Klick zeigen, nicht erst danach.
    loadError: overridesLoadError(),
  });
});

/**
 * Alle Events des aktuellen Feeds, gruppiert nach Gemeinde — Grundlage für die
 * Highlight-Pflege im Admin. Pro Event steht dabei, ob das Highlight aus dem
 * ChurchDesk-Tag („KAT: Highlight") kommt oder hier im Admin gesetzt wurde.
 * `unknown` sind Admin-Highlights, deren Event gerade nicht im Feed liegt
 * (vorbei, außerhalb des Zeitfensters oder Org ausgefallen) — die UI trägt sie
 * beim Speichern weiter, statt sie still zu verlieren.
 */
app.get("/admin/api/highlights", (c) => {
  const latest = cache.peekLatest();
  const overrides = getOverrides();
  interface HighlightEntry {
    id: number;
    title: string;
    startUtc: string;
    tag: boolean;
    admin: boolean;
  }
  const groups = new Map<string, { name: string; events: HighlightEntry[] }>();
  const seen = new Set<number>();
  for (const f of latest?.value.features ?? []) {
    const p = f.properties;
    seen.add(p.id);
    const name = p.parish ?? p.orgName;
    const g = groups.get(name) ?? { name, events: [] };
    g.events.push({
      id: p.id,
      title: p.title,
      startUtc: p.startUtc,
      tag: hasHighlightTag(p.summary, p.descriptionHtml),
      admin: overrides.highlights.includes(p.id),
    });
    groups.set(name, g);
  }
  for (const g of groups.values())
    g.events.sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)));
  return c.json({
    groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "de")),
    unknown: overrides.highlights.filter((id) => !seen.has(id)),
  });
});

app.put("/admin/api/locations", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Ungültiges JSON." }, 400);
  }
  try {
    const saved = setOverrides(raw);
    // Korrekturen sollen sofort sichtbar werden, nicht erst beim nächsten TTL-Tick.
    // `afterChange`: einen ggf. laufenden Refresh abwarten, der die neuen
    // Overrides noch nicht kennt — sonst bliebe die Korrektur eine TTL lang aus.
    void warmCache(true);
    return c.json({ ok: true, overrides: saved });
  } catch (e: any) {
    // Drei Fälle, die Oberfläche und Logs auseinanderhalten müssen:
    // 400 — Eingabefehler des Admins, mit Grund (der Text ist für ihn gemacht).
    // 409 — gesperrt, weil die Datei beim Start unlesbar war: Zustand des Servers.
    // 500 — Schreibfehler (Volume-Rechte, Platte voll): Details nur ins Log,
    //       die Meldung nennt sonst Dateipfade.
    if (e instanceof InvalidOverridesError) return c.json({ error: e.message }, 400);
    if (overridesLoadError() !== null) return c.json({ error: String(e?.message ?? e) }, 409);
    console.error("[/admin/api/locations] Speichern fehlgeschlagen:", e?.message ?? e);
    return c.json({ error: "Korrekturen konnten nicht gespeichert werden." }, 500);
  }
});

/**
 * Hält den Standard-Zeitraum von selbst warm.
 *
 * Ohne das erneuert sich der Cache nur, wenn jemand die API aufruft — der erste
 * Aufruf nach einer Ruhephase wartet dann auf 14 ChurchDesk-Calls. Mit dem Timer
 * ist immer ein frischer Stand da: Die App bekommt sofort Antwort, und ihre
 * Änderungs-Abfrage (/version.json) sieht redaktionelle Korrekturen von selbst,
 * ohne dass ein Nutzer den Refresh auslösen muss.
 */
function warmCache(afterChange = false): Promise<void> {
  const { from, to, key } = currentWindow();
  const load = () => buildFeatureCollection(from, to);
  const p = afterChange ? cache.refreshAfterChange(key, load) : cache.refresh(key, load);
  return p
    .then((fc) => {
      console.log(`[moinkark-api] Cache erneuert: ${fc.features.length} Events`);
    })
    .catch((e) => console.error("[moinkark-api] Cache-Refresh fehlgeschlagen:", e?.message ?? e));
}

export { app };

/**
 * Nur starten, wenn dieses Modul als Programm läuft — nicht beim Import.
 * Tests sprechen `app` direkt über `app.request()` an; ohne die Prüfung würde
 * jeder Testlauf einen echten Server samt ChurchDesk-Refresh hochziehen.
 */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain)
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[moinkark-api] hört auf http://0.0.0.0:${info.port}`);
    console.log(`[moinkark-api] CORS erlaubt: ${ALLOWED_ORIGINS.join(", ")}`);
    if (!ADMIN_TOKEN)
      console.warn("[moinkark-api] ADMIN_TOKEN nicht gesetzt — /admin ist deaktiviert.");
    // Sofort einmal laden, danach im TTL-Takt.
    void warmCache();
    const timer = setInterval(() => void warmCache(), TTL_MS);
    // Node soll wegen des Timers nicht am Beenden gehindert werden.
    timer.unref?.();
    console.log(`[moinkark-api] Auto-Refresh alle ${Math.round(TTL_MS / 60000)} min`);
  });

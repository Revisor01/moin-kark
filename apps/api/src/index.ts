// Moin Kark API: liest 14 ChurchDesk-Orgs serverseitig und liefert ein GeoJSON.

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

// Beim Import laden, sonst bleibt Speichern ohne laufenden Server gesperrt.
loadOverrides();

/** Zahl aus der Umgebung mit Standard, weil NaN den Refresh im Millisekundentakt feuern ließe. */
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

/** Mindestlänge des Admin-Tokens; kürzer bleibt /admin aus. */
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

/** Festes Zeitfenster, weil jeder Parameter einen eigenen Cache-Eintrag samt Fetch-Kaskade erzeugte. */
function currentWindow(): { from: Date; to: Date; key: string } {
  const from = new Date();
  // Über den Berliner Kalendertag, sonst ergäbe die Zeitumstellung 59 oder 61 Tage.
  const [y, m, d] = fmtDate(from).split("-").map(Number);
  const to = new Date(Date.UTC(y, m - 1, d + DEFAULT_DAYS, 12));
  // Berliner Tag, mit UTC zeigte der Key nach Mitternacht noch auf den Vortag.
  const key = `${fmtDate(from)}_${fmtDate(to)}`;
  return { from, to, key };
}

function getCollection(): Promise<EventFeatureCollection> {
  const { from, to, key } = currentWindow();
  return cache.get(key, () => buildFeatureCollection(from, to));
}

const app = new Hono();

// Vor den Routen, damit gzip deren Antworten sieht.
app.use("*", compress());

app.use(
  "*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
  })
);

// Daran prüft der Deploy, ob wirklich das neue Image antwortet.
app.get("/", (c) =>
  c.json({ service: "moinkark-api", status: "ok", revision: process.env.GIT_SHA?.trim() || "unknown" })
);

/** Betriebszustand ok, degraded, stale oder starting aus dem jüngsten Stand, ohne selbst zu laden. */
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

  // Orte ohne Koordinate, die auf dem Gemeinde-Pin landen.
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

/** Rahmen der Feed-Routen mit ETag und 304; Fehler nach außen nur als fester Text. */
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

/** Schwacher ETag, weil Compress ihn sonst herabstuft und 200 und 304 verschiedene trügen. */
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

/** Kurzkennung des Datenstands, damit die App nur bei Änderung den vollen Feed lädt. */
function fingerprint(fc: EventFeatureCollection): string {
  const h = createHash("sha1");
  // Alle sichtbaren Felder, sortiert, damit eine andere Reihenfolge keinen neuen Hash ergibt.
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

/** Fingerprint je Datenstand nur einmal rechnen. */
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

// --- QR-Weiche: ein Link fuers Plakat, zwei Stores ---

const STORE_IOS = "https://apps.apple.com/de/app/id6781438884";
const STORE_ANDROID = "https://play.google.com/store/apps/details?id=de.godsapp.moinkark";
const STARTSEITE = "https://moin-kark.de/";

/** Wählt den Store; erst Android prüfen, weil dessen UA auch „AppleWebKit“ trägt. */
export function storeFuerGeraet(userAgent: string | undefined): string {
  const ua = (userAgent ?? "").toLowerCase();
  if (ua.includes("android")) return STORE_ANDROID;
  if (/(iphone|ipad|ipod)/.test(ua)) return STORE_IOS;
  return STARTSEITE;
}

/** Ort und Gemeinde ohne Dopplung. */
function ortsangabe(locationName?: string, parish?: string): string {
  if (!locationName) return parish ?? "";
  if (!parish) return locationName;
  if (locationName.toLowerCase().includes(parish.toLowerCase())) return locationName;
  return `${locationName}, ${parish}`;
}

/** Ziel des QR-Codes; 302, damit sich die Zuordnung später ändern lässt. */
app.get("/app", (c) => c.redirect(storeFuerGeraet(c.req.header("User-Agent")), 302));

/** Universal Links und App Links; sie müssen auf der API-Domain liegen, weil geteilte Links dorthin zeigen. */
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

/** Android-Fingerprints: Play-App-Signatur und Upload-Schlüssel; ANDROID_CERT_SHA256 überschreibt. */
const ANDROID_CERT_FINGERPRINTS = (
  process.env.ANDROID_CERT_SHA256 ??
  "0D:5A:FF:7D:B9:86:BD:14:F5:0E:A7:D9:0D:EB:05:28:A9:B0:52:63:A9:D0:0B:0D:0E:BC:A3:10:C2:E2:6C:32," +
    "18:D5:77:27:01:51:EC:2D:51:23:9F:48:EE:56:77:21:53:30:F1:24:6B:87:2E:33:3C:C5:24:D8:1E:D4:97:BC"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
        sha256_cert_fingerprints: ANDROID_CERT_FINGERPRINTS,
      },
    },
  ])
);

/** Hebt ChurchDesk-Bilder auf 1200 px, sonst zeigen Messenger keine große Vorschau. */
function vorschauBild(url?: string): string | undefined {
  if (!url) return undefined;
  if (!url.includes("edge.churchdesk.com")) return url;
  return url.replace(/\/span\d+_16-9\//, "/span12_16-9/");
}

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

/** Link-Vorschau für geteilte Termine, weil Crawler in der SPA nichts sehen. */
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
  const place = ortsangabe(p.locationName, p.parish);
  return c.html(
    eventPreviewPage({
      id: p.id,
      title: p.title,
      time: previewTime(p.startUtc, p.allDay),
      place,
      imageUrl: vorschauBild(p.image?.url),
      startIso: p.startUtc,
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

/** Fehlversuche je Adresse; ab AUTH_FAIL_LIMIT 429, auch für das richtige Token. */
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
  // Feed-Kategorien als Vorschläge; Ausschlüsse bleiben in der Liste zum Aufheben.
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
    // Gesperrtes Speichern vor dem ersten Klick anzeigen.
    loadError: overridesLoadError(),
  });
});

/** Events je Gemeinde für die Highlight-Pflege; `unknown` trägt die UI weiter, statt sie zu verlieren. */
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
    // `afterChange`, damit kein laufender Refresh ohne die neuen Overrides gewinnt.
    void warmCache(true);
    return c.json({ ok: true, overrides: saved });
  } catch (e: any) {
    // 400 Eingabefehler mit Grund, 409 beim Start gesperrt, 500 Schreibfehler nur ins Log.
    if (e instanceof InvalidOverridesError) return c.json({ error: e.message }, 400);
    if (overridesLoadError() !== null) return c.json({ error: String(e?.message ?? e) }, 409);
    console.error("[/admin/api/locations] Speichern fehlgeschlagen:", e?.message ?? e);
    return c.json({ error: "Korrekturen konnten nicht gespeichert werden." }, 500);
  }
});

/** Hält den Standard-Zeitraum warm, damit niemand auf 14 ChurchDesk-Calls wartet. */
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

/** Nur als Programm starten, damit Tests keinen echten Server hochziehen. */
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

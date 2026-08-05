// Moin Kark API — Read-Only Aggregator für die Kirchenkreis-Dithmarschen-Eventkarte.
// Hält die 14 ChurchDesk-Read-Tokens server-seitig, liefert ein dedupliziertes GeoJSON.

import { createHash, timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  LOCATION_COORD_FIXES,
  TITLE_COORD_FIXES,
  type EventFeatureCollection,
} from "@moinkark/shared";
import { buildFeatureCollection, extractCategories } from "./aggregate.js";
import { SwrCache } from "./cache.js";
import { getOverrides, loadOverrides, setOverrides } from "./locations.js";
import { adminPage, statusPage, type FallbackGroup, type StatusData } from "./pages.js";

const PORT = Number(process.env.PORT ?? 8787);
const TTL_MS = Number(process.env.CACHE_TTL_MS ?? 20 * 60 * 1000); // 20 min
const DEFAULT_DAYS = Number(process.env.DEFAULT_WINDOW_DAYS ?? 60);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim() || undefined;

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
  const to = new Date(from.getTime() + DEFAULT_DAYS * 86400_000);
  const key = `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
  return { from, to, key };
}

function getCollection(): Promise<EventFeatureCollection> {
  const { from, to, key } = currentWindow();
  return cache.get(key, () => buildFeatureCollection(from, to));
}

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]),
  })
);

app.get("/", (c) => c.json({ service: "moinkark-api", status: "ok" }));

/**
 * Betriebszustand aus dem jüngsten Datenstand — ohne selbst einen Fetch
 * auszulösen (der Auto-Refresh hält den Cache warm):
 * - ok:       Daten da, alle Orgs haben geantwortet.
 * - degraded: Daten da, aber mind. eine Org fiel beim letzten Refresh aus
 *             (z. B. abgelaufener Einzeltoken — deren Events fehlen still!).
 * - stale:    letzter erfolgreicher Refresh liegt > 3×TTL zurück (Refresh hängt/scheitert).
 * - starting: noch gar kein Datenstand (Kaltstart).
 */
function statusData(): StatusData {
  const latest = cache.peekLatest();
  const meta = latest?.value.meta;
  if (!latest || !meta) return { status: "starting", fallback: [] };
  const ageSeconds = (Date.now() - latest.updatedAt) / 1000;
  const status: StatusData["status"] =
    ageSeconds > (3 * TTL_MS) / 1000 ? "stale" : meta.orgsFailed > 0 ? "degraded" : "ok";

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
      generatedAt: d.generatedAt,
      cacheAgeSeconds: d.ageSeconds == null ? undefined : Math.round(d.ageSeconds),
    },
    http
  );
});

app.get("/status.json", (c) => c.json(statusData()));
app.get("/status", (c) => c.html(statusPage(statusData())));

app.get("/events.geojson", async (c) => {
  try {
    return c.json(await getCollection());
  } catch (e: any) {
    console.error("[/events.geojson]", e?.message ?? e);
    return c.json({ error: e?.message ?? "internal error" }, 500);
  }
});

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
  // Nur die Felder, deren Änderung die App sehen muss — Reihenfolge stabil halten.
  for (const f of fc.features) {
    const p = f.properties;
    h.update(
      `${p.id}|${p.startUtc}|${p.endUtc ?? ""}|${p.title}|${p.highlight ? 1 : 0}|` +
        `${f.geometry.coordinates.join(",")}|${p.locationName ?? ""}\n`
    );
  }
  return h.digest("hex").slice(0, 16);
}

app.get("/version.json", async (c) => {
  try {
    const fc = await getCollection();
    return c.json({ version: fingerprint(fc), count: fc.features.length });
  } catch (e: any) {
    console.error("[/version.json]", e?.message ?? e);
    return c.json({ error: e?.message ?? "internal error" }, 500);
  }
});

app.get("/categories.json", async (c) => {
  try {
    return c.json(extractCategories(await getCollection()));
  } catch (e: any) {
    console.error("[/categories.json]", e?.message ?? e);
    return c.json({ error: e?.message ?? "internal error" }, 500);
  }
});

// --- Admin: Orts-Korrekturen pflegen (Token in ADMIN_TOKEN, sonst deaktiviert) ---

/** Konstantzeit-Vergleich über SHA-256 (verhindert Timing- und Längen-Leaks). */
function tokenOk(header: string | undefined): boolean {
  if (!ADMIN_TOKEN || !header?.startsWith("Bearer ")) return false;
  const given = createHash("sha256").update(header.slice(7).trim()).digest();
  const want = createHash("sha256").update(ADMIN_TOKEN).digest();
  return timingSafeEqual(given, want);
}

app.get("/admin", (c) => c.html(adminPage()));

app.use("/admin/api/*", async (c, next) => {
  if (!ADMIN_TOKEN) return c.json({ error: "Admin deaktiviert (ADMIN_TOKEN nicht gesetzt)." }, 503);
  if (!tokenOk(c.req.header("Authorization"))) return c.json({ error: "unauthorized" }, 401);
  await next();
});

app.get("/admin/api/locations", (c) =>
  c.json({
    static: { locations: LOCATION_COORD_FIXES, titles: TITLE_COORD_FIXES },
    overrides: getOverrides(),
  })
);

app.put("/admin/api/locations", async (c) => {
  try {
    const saved = setOverrides(await c.req.json());
    // Korrekturen sollen sofort sichtbar werden, nicht erst beim nächsten TTL-Tick.
    warmCache();
    return c.json({ ok: true, overrides: saved });
  } catch (e: any) {
    return c.json({ error: e?.message ?? "invalid payload" }, 400);
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
function warmCache(): void {
  const { from, to, key } = currentWindow();
  void cache
    .refresh(key, () => buildFeatureCollection(from, to))
    .then((fc) => console.log(`[moinkark-api] Cache erneuert: ${fc.features.length} Events`))
    .catch((e) => console.error("[moinkark-api] Cache-Refresh fehlgeschlagen:", e?.message ?? e));
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[moinkark-api] hört auf http://0.0.0.0:${info.port}`);
  console.log(`[moinkark-api] CORS erlaubt: ${ALLOWED_ORIGINS.join(", ")}`);
  if (!ADMIN_TOKEN) console.warn("[moinkark-api] ADMIN_TOKEN nicht gesetzt — /admin ist deaktiviert.");
  loadOverrides();
  // Sofort einmal laden, danach im TTL-Takt.
  warmCache();
  const timer = setInterval(warmCache, TTL_MS);
  // Node soll wegen des Timers nicht am Beenden gehindert werden.
  timer.unref?.();
  console.log(`[moinkark-api] Auto-Refresh alle ${Math.round(TTL_MS / 60000)} min`);
});

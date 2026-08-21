// Moin Kark API — Read-Only Aggregator für die Kirchenkreis-Dithmarschen-Eventkarte.
// Hält die 14 ChurchDesk-Read-Tokens server-seitig, liefert ein dedupliziertes GeoJSON.

import { createHash, timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
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
import { getOverrides, loadOverrides, setOverrides } from "./locations.js";
import { adminPage, statusPage, type FallbackGroup, type StatusData } from "./pages.js";

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
      `${p.id}|${p.startUtc}|${p.endUtc ?? ""}|${p.title}|${p.highlight ? 1 : 0}|` +
      `${f.geometry.coordinates.join(",")}|${p.locationName ?? ""}|` +
      `${p.summary ?? ""}|${p.descriptionHtml ?? ""}|${p.image?.url ?? ""}|` +
      `${p.categories.map((c) => c.id).join(",")}|${p.parish ?? ""}|${p.address ?? ""}|${p.price ?? ""}`
    );
  });
  lines.sort();
  for (const line of lines) h.update(`${line}\n`);
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
  try {
    const saved = setOverrides(await c.req.json());
    // Korrekturen sollen sofort sichtbar werden, nicht erst beim nächsten TTL-Tick.
    // `afterChange`: einen ggf. laufenden Refresh abwarten, der die neuen
    // Overrides noch nicht kennt — sonst bliebe die Korrektur eine TTL lang aus.
    void warmCache(true);
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

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[moinkark-api] hört auf http://0.0.0.0:${info.port}`);
  console.log(`[moinkark-api] CORS erlaubt: ${ALLOWED_ORIGINS.join(", ")}`);
  if (!ADMIN_TOKEN) console.warn("[moinkark-api] ADMIN_TOKEN nicht gesetzt — /admin ist deaktiviert.");
  loadOverrides();
  // Sofort einmal laden, danach im TTL-Takt.
  void warmCache();
  const timer = setInterval(() => void warmCache(), TTL_MS);
  // Node soll wegen des Timers nicht am Beenden gehindert werden.
  timer.unref?.();
  console.log(`[moinkark-api] Auto-Refresh alle ${Math.round(TTL_MS / 60000)} min`);
});

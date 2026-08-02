// Moin Kark API — Read-Only Aggregator für die Kirchenkreis-Dithmarschen-Eventkarte.
// Hält die 14 ChurchDesk-Read-Tokens server-seitig, liefert ein dedupliziertes GeoJSON.

import { createHash } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { EventFeatureCollection } from "@moinkark/shared";
import { buildFeatureCollection, extractCategories } from "./aggregate.js";
import { SwrCache } from "./cache.js";

const PORT = Number(process.env.PORT ?? 8787);
const TTL_MS = Number(process.env.CACHE_TTL_MS ?? 20 * 60 * 1000); // 20 min
const DEFAULT_DAYS = Number(process.env.DEFAULT_WINDOW_DAYS ?? 60);
const MAX_DAYS = Number(process.env.MAX_WINDOW_DAYS ?? 90);

// CORS-Allowlist: kommagetrennt in ALLOWED_ORIGINS, sonst Dev-Defaults.
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ??
  "http://localhost:8081,http://localhost:19006,http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const cache = new SwrCache<EventFeatureCollection>({ ttlMs: TTL_MS });

function parseWindow(fromRaw?: string, toRaw?: string): { from: Date; to: Date; key: string } {
  const now = new Date();
  const from = fromRaw ? new Date(fromRaw) : now;
  let to = toRaw ? new Date(toRaw) : new Date(now.getTime() + DEFAULT_DAYS * 86400_000);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new Error("Ungültiges Datum (erwartet ISO oder YYYY-MM-DD).");
  }
  // Fenster serverseitig deckeln (Token-Schutz).
  const maxTo = new Date(from.getTime() + MAX_DAYS * 86400_000);
  if (to > maxTo) to = maxTo;

  // Cache-Key auf Tagesgranularität (verhindert Key-Explosion durch ms-Unterschiede).
  const key = `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
  return { from, to, key };
}

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]),
  })
);

app.get("/", (c) => c.json({ service: "moinkark-api", status: "ok" }));
app.get("/healthz", (c) => c.json({ status: "ok" }));

app.get("/events.geojson", async (c) => {
  try {
    const { from, to, key } = parseWindow(c.req.query("from"), c.req.query("to"));
    const fc = await cache.get(key, () => buildFeatureCollection(from, to));
    return c.json(fc);
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
    const { from, to, key } = parseWindow(c.req.query("from"), c.req.query("to"));
    const fc = await cache.get(key, () => buildFeatureCollection(from, to));
    return c.json({ version: fingerprint(fc), count: fc.features.length });
  } catch (e: any) {
    console.error("[/version.json]", e?.message ?? e);
    return c.json({ error: e?.message ?? "internal error" }, 500);
  }
});

app.get("/categories.json", async (c) => {
  try {
    const { from, to, key } = parseWindow(c.req.query("from"), c.req.query("to"));
    const fc = await cache.get(key, () => buildFeatureCollection(from, to));
    return c.json(extractCategories(fc));
  } catch (e: any) {
    console.error("[/categories.json]", e?.message ?? e);
    return c.json({ error: e?.message ?? "internal error" }, 500);
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
  const { from, to, key } = parseWindow();
  void cache
    .refresh(key, () => buildFeatureCollection(from, to))
    .then((fc) => console.log(`[moinkark-api] Cache erneuert: ${fc.features.length} Events`))
    .catch((e) => console.error("[moinkark-api] Cache-Refresh fehlgeschlagen:", e?.message ?? e));
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[moinkark-api] hört auf http://0.0.0.0:${info.port}`);
  console.log(`[moinkark-api] CORS erlaubt: ${ALLOWED_ORIGINS.join(", ")}`);
  // Sofort einmal laden, danach im TTL-Takt.
  warmCache();
  const timer = setInterval(warmCache, TTL_MS);
  // Node soll wegen des Timers nicht am Beenden gehindert werden.
  timer.unref?.();
  console.log(`[moinkark-api] Auto-Refresh alle ${Math.round(TTL_MS / 60000)} min`);
});

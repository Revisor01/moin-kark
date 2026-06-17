// Read-Only Aggregator für die Kirchenkreis-Dithmarschen-Eventkarte.
// Hält die 14 ChurchDesk-Read-Tokens server-seitig, liefert ein dedupliziertes GeoJSON.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { EventFeatureCollection } from "@kkd/shared";
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

app.get("/", (c) => c.json({ service: "kkdith-proxy", status: "ok" }));
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

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[kkdith-proxy] hört auf http://0.0.0.0:${info.port}`);
  console.log(`[kkdith-proxy] CORS erlaubt: ${ALLOWED_ORIGINS.join(", ")}`);
});

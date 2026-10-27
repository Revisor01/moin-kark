// ChurchDesk-REST-Client, nur lesend.

import { berlinDayKey } from "@moinkark/shared";
import type { OrgConfig } from "./orgs.js";

const BASE = "https://api2.churchdesk.com/api/v3.0.0";
const PAGE_SIZE = 100;
// Sonst gilt der undici-Default von etwa 5 Minuten.
const CHUNK_TIMEOUT_MS = 15_000;

/** Rohes ChurchDesk-Event (nur die Felder, die wir nutzen). */
export interface CdEvent {
  id: number;
  title: string;
  description?: string;
  summary?: string;
  startDate: string;
  endDate: string;
  allDay?: boolean;
  showEndtime?: boolean;
  location?: string;
  locationName?: string;
  locationObj?: {
    latitude?: number;
    longitude?: number;
    address?: string;
    city?: string;
    zipcode?: string;
    country?: string;
    name?: string;
  } | null;
  contributor?: string;
  price?: string;
  categories?: { id: number; title: string; color: number }[];
  parishes?: { id: number; title: string }[];
  image?: { [key: string]: unknown; title?: string; copyright?: string } | null;
}

/** Berliner Kalendertag als YYYY-MM-DD; nicht toISOString(), das wäre nachts noch der Vortag. */
export function fmtDate(d: Date): string {
  return berlinDayKey(d);
}

/** Holt einen Zeit-Chunk (höchstens PAGE_SIZE öffentliche Events). */
async function fetchChunk(
  org: OrgConfig,
  from: Date,
  to: Date,
  signal?: AbortSignal
): Promise<CdEvent[]> {
  const url = new URL(`${BASE}/events`);
  url.searchParams.set("partnerToken", org.token);
  url.searchParams.set("organizationId", String(org.id));
  url.searchParams.set("startDate", fmtDate(from));
  url.searchParams.set("endDate", fmtDate(to));
  url.searchParams.set("itemsNumber", String(PAGE_SIZE));

  const res = await fetch(url, {
    // Das Chunk-Timeout gilt immer, ein übergebenes Signal kommt dazu.
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(CHUNK_TIMEOUT_MS)])
      : AbortSignal.timeout(CHUNK_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ChurchDesk ${org.id} HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data)
    ? (data as CdEvent[])
    : ((data as { items?: CdEvent[] }).items ?? []);
}

const DAY = 86400_000;

/** Alle öffentlichen Events einer Org; paginiert über die Zeit, weil `pageNumber` nicht funktioniert. */
export async function fetchOrgEvents(
  org: OrgConfig,
  from: Date,
  to: Date,
  signal?: AbortSignal
): Promise<CdEvent[]> {
  const byId = new Map<number, CdEvent>();

  // Rekursiv: Fenster holen; wenn voll (==100), in zwei Hälften teilen.
  async function collect(a: Date, b: Date, depth: number): Promise<void> {
    const items = await fetchChunk(org, a, b, signal);
    for (const e of items) byId.set(e.id, e);
    // Volles Fenster teilen, bis höchstens 2 Tage oder zu tiefe Rekursion.
    const spanDays = (b.getTime() - a.getTime()) / DAY;
    if (items.length >= PAGE_SIZE) {
      if (spanDays > 2 && depth < 8) {
        const mid = new Date(a.getTime() + (b.getTime() - a.getTime()) / 2);
        await collect(a, mid, depth + 1);
        // Überlappend ab `mid`, falls ChurchDesk `endDate` exklusiv auslegt.
        await collect(mid, b, depth + 1);
      } else {
        // Nicht still verschlucken, sonst fällt die Lücke nie auf.
        console.warn(
          `[churchdesk] Org ${org.id}: ${fmtDate(a)}–${fmtDate(b)} am ${PAGE_SIZE}er-Limit, ` +
            `nicht weiter teilbar (${spanDays.toFixed(1)} Tage, Tiefe ${depth}) — möglicherweise unvollständig.`
        );
      }
    }
  }

  await collect(from, to, 0);
  return [...byId.values()];
}

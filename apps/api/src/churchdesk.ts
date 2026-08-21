// Dünner ChurchDesk-REST-Client (NUR Lesen). Pagination über itemsNumber=100.
// Referenz: kk-termine/web/churchdesk_api.py (Auth-/Pagination-Verhalten).

import type { OrgConfig } from "./orgs.js";

const BASE = "https://api2.churchdesk.com/api/v3.0.0";
const PAGE_SIZE = 100;
// Ohne eigenes Timeout hängt ein Request am undici-Default (~5 min) — ein einziges
// hängendes ChurchDesk blockiert dann jeden Cold-Start und Refresh-Durchlauf.
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

const BERLIN = "Europe/Berlin";

/**
 * Kalendertag in Europe/Berlin als YYYY-MM-DD.
 *
 * Bewusst NICHT toISOString(): das liefert immer UTC. Zwischen Mitternacht und
 * 01:00 (Winter) bzw. 02:00 (Sommer) Berliner Zeit ist das UTC-Datum noch der
 * Vortag — das Fenster hätte nachts beim Vortag begonnen und bereits gelaufene
 * Events eingeschlossen. Das TZ=Europe/Berlin des Containers ändert daran nichts.
 */
export function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: BERLIN }).format(d); // sv-SE ⇒ YYYY-MM-DD
}

/**
 * Holt einen einzelnen Zeit-Chunk (max. PAGE_SIZE Events).
 * Die public partnerToken-API liefert ausschließlich öffentliche Events.
 */
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
    // Das Chunk-Timeout gilt IMMER. Ein übergebenes Signal kommt zusätzlich dazu —
    // sonst entfiele mit einem externen Signal still die 15-s-Grenze.
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

/**
 * Holt alle öffentlichen Events einer Org im Zeitfenster.
 *
 * ChurchDesks `pageNumber` funktioniert NICHT (liefert immer dieselbe erste Seite),
 * daher paginieren wir über die ZEIT: Wir holen in Chunks und halbieren ein Fenster,
 * sobald es ans 100er-Limit stößt — so gehen keine Events verloren.
 */
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
    // Wenn das Fenster „voll" war, könnten Events fehlen → aufteilen.
    // Stoppe bei sehr kleinen Fenstern (≤2 Tage) oder zu tiefer Rekursion.
    const spanDays = (b.getTime() - a.getTime()) / DAY;
    if (items.length >= PAGE_SIZE) {
      if (spanDays > 2 && depth < 8) {
        const mid = new Date(a.getTime() + (b.getTime() - a.getTime()) / 2);
        await collect(a, mid, depth + 1);
        // Überlappend ab `mid` (nicht mid+1 Tag): Sollte ChurchDesk `endDate`
        // exklusiv auslegen, gingen die Events des Mid-Tages sonst verloren.
        // Doppelte fängt `byId` ohnehin ab.
        await collect(mid, b, depth + 1);
      } else {
        // Fenster voll, aber nicht weiter teilbar → hier können Events fehlen.
        // Nicht still verschlucken, sonst fällt eine Lücke nie auf.
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

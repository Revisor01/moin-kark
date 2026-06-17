// Dünner ChurchDesk-REST-Client (NUR Lesen). Pagination über itemsNumber=100.
// Referenz: kk-termine/web/churchdesk_api.py (Auth-/Pagination-Verhalten).

import type { OrgConfig } from "./orgs.js";

const BASE = "https://api2.churchdesk.com/api/v3.0.0";
const PAGE_SIZE = 100;

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

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Holt alle öffentlichen Events einer Org im Zeitfenster, mit Pagination.
 * Die public partnerToken-API liefert ausschließlich öffentliche Events.
 */
export async function fetchOrgEvents(
  org: OrgConfig,
  from: Date,
  to: Date,
  signal?: AbortSignal
): Promise<CdEvent[]> {
  const all: CdEvent[] = [];
  let page = 0;
  // Defensiver Seiten-Deckel (max 10 Seiten = 1000 Events / Org / Fenster).
  for (; page < 10; page++) {
    const url = new URL(`${BASE}/events`);
    url.searchParams.set("partnerToken", org.token);
    url.searchParams.set("organizationId", String(org.id));
    url.searchParams.set("startDate", fmtDate(from));
    url.searchParams.set("endDate", fmtDate(to));
    url.searchParams.set("itemsNumber", String(PAGE_SIZE));
    if (page > 0) url.searchParams.set("pageNumber", String(page + 1));

    const res = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`ChurchDesk ${org.id} HTTP ${res.status}`);
    }
    const data = (await res.json()) as unknown;
    const items: CdEvent[] = Array.isArray(data)
      ? (data as CdEvent[])
      : ((data as { items?: CdEvent[] }).items ?? []);

    all.push(...items);
    if (items.length < PAGE_SIZE) break; // letzte Seite
  }
  return all;
}

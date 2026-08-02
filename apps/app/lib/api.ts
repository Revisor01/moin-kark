import type { EventFeatureCollection } from "@moinkark/shared";

// Proxy-URL: in Prod die Subdomain, in Dev lokal überschreibbar via EXPO_PUBLIC_API_URL.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "https://api.moin-kark.de";

export async function fetchEvents(): Promise<EventFeatureCollection> {
  const res = await fetch(`${API_BASE}/events.geojson`);
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
  return (await res.json()) as EventFeatureCollection;
}

/**
 * Kurz-Kennung des Server-Datenbestands (wenige Bytes statt ~700 KB).
 * Ändert sie sich, hat die Redaktion etwas geändert → GeoJSON neu laden.
 */
export async function fetchVersion(): Promise<string> {
  const res = await fetch(`${API_BASE}/version.json`);
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
  const j = (await res.json()) as { version: string };
  return j.version;
}

export interface CategoryInfo {
  title: string;
  color: number;
  count: number;
}

export async function fetchCategories(): Promise<CategoryInfo[]> {
  const res = await fetch(`${API_BASE}/categories.json`);
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
  return (await res.json()) as CategoryInfo[];
}

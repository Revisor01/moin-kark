import type { EventFeatureCollection } from "@kkd/shared";

// Proxy-URL: in Prod die Subdomain, in Dev lokal überschreibbar via EXPO_PUBLIC_API_URL.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "https://kkkarte.godsapp.de";

export async function fetchEvents(): Promise<EventFeatureCollection> {
  const res = await fetch(`${API_BASE}/events.geojson`);
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
  return (await res.json()) as EventFeatureCollection;
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

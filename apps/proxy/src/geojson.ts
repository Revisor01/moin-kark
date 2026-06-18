// Wandelt ein rohes ChurchDesk-Event in ein GeoJSON-Feature um.
// Übernimmt alle relevanten Felder voll aus der API.

import {
  fallbackCoords,
  orgName,
  resolveKirchspiel,
  type EventFeature,
  type EventImage,
} from "@kkd/shared";
import type { CdEvent } from "./churchdesk.js";

/**
 * Erkennt das redaktionelle „KAT: …, Highlight, …"-Tag in Summary/Beschreibung.
 * Gemeinden markieren so einzelne Events zur besonderen Hervorhebung (z.B. Wesselburen).
 * Robust gegen HTML (<p>KAT: Blog</p>) und Komma-Listen (KAT: Highlight, Blog, …).
 */
function hasHighlightTag(summary?: string, description?: string): boolean {
  const text = `${summary ?? ""}\n${description ?? ""}`
    .replace(/<[^>]+>/g, "\n") // HTML-Tags zu Zeilenumbrüchen
    .replace(/&nbsp;/g, " ");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*KAT\s*:\s*(.+)$/i);
    if (!m) continue;
    const tags = m[1].split(",").map((t) => t.trim().toLowerCase());
    if (tags.includes("highlight")) return true;
  }
  return false;
}

/** Wählt die beste Bild-URL aus dem ChurchDesk-image-Objekt. */
function pickImage(img: CdEvent["image"]): EventImage | undefined {
  if (!img) return undefined;
  // Bevorzugte Größen-Keys (16:9 zuerst), sonst irgendeine http-URL nehmen.
  const preferredKeys = ["span4_16-9", "span3_16-9", "span2_16-9", "span4", "span3"];
  let url: string | undefined;
  for (const k of preferredKeys) {
    const v = img[k];
    if (typeof v === "string" && v.startsWith("http")) {
      url = v;
      break;
    }
  }
  if (!url) {
    for (const v of Object.values(img)) {
      if (typeof v === "string" && v.startsWith("http")) {
        url = v;
        break;
      }
    }
  }
  if (!url) return undefined;
  return {
    url,
    title: typeof img.title === "string" ? img.title : undefined,
    copyright: typeof img.copyright === "string" ? img.copyright : undefined,
  };
}

export function toFeature(event: CdEvent, orgId: number): EventFeature {
  const parish = event.parishes?.[0]?.title;
  const lo = event.locationObj;
  // 0/0 ist der „Nullpunkt" (Golf von Guinea) — ChurchDesk liefert das bei nicht
  // geokodierten Orten. Als „keine echten Koordinaten" behandeln → Fallback nutzen.
  const hasCoords =
    !!lo &&
    typeof lo.latitude === "number" &&
    typeof lo.longitude === "number" &&
    !(lo.latitude === 0 && lo.longitude === 0);

  const coords = hasCoords
    ? { lat: lo!.latitude as number, lng: lo!.longitude as number }
    : fallbackCoords(parish, orgId);

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [coords.lng, coords.lat], // GeoJSON: [lng, lat]
    },
    properties: {
      id: event.id,
      title: event.title,
      startUtc: event.startDate,
      endUtc: event.endDate,
      allDay: !!event.allDay,
      showEndtime: event.showEndtime !== false,
      summary: event.summary || undefined,
      descriptionHtml: event.description || undefined,
      image: pickImage(event.image),
      categories: (event.categories ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        color: c.color,
      })),
      contributor: event.contributor || undefined,
      parish,
      kirchspiel: resolveKirchspiel(parish, orgId),
      orgId,
      orgName: orgName(orgId),
      locationName: event.locationName || event.location || lo?.name || undefined,
      address: lo?.address || undefined,
      city: lo?.city || undefined,
      zipcode: lo?.zipcode || undefined,
      price: event.price || undefined,
      coordSource: hasCoords ? "event" : "fallback",
      highlight: hasHighlightTag(event.summary, event.description) || undefined,
    },
  };
}

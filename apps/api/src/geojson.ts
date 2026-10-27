// Wandelt ein ChurchDesk-Event in ein GeoJSON-Feature.

import {
  coordFixFor,
  coordFixForTitle,
  coordOverrideForTitle,
  fallbackCoords,
  kanonischeKategorie,
  orgName,
  resolveKirchspiel,
  type EventFeature,
  type EventImage,
} from "@moinkark/shared";
import type { CdEvent } from "./churchdesk.js";
import { dynamicCoordFixFor, dynamicTitleFixFor, isDynamicHighlight } from "./locations.js";

/** Erkennt das redaktionelle „KAT: …, Highlight, …“-Tag, auch in HTML und Komma-Listen. */
export function hasHighlightTag(summary?: string, description?: string): boolean {
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

/** ChurchDesk-Zeit in fester UTC-Schreibweise, weil die Apps gemerkte Zeiten per String vergleichen. */
function utcIso(raw: string): string {
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : raw;
}

export function toFeature(event: CdEvent, orgId: number): EventFeature {
  // Kirchspielweite Termine gehören mehreren Gemeinden, die App braucht alle.
  const allParishes = (event.parishes ?? [])
    .map((p) => p.title)
    .filter((t): t is string => !!t);
  const parish = allParishes[0];
  const lo = event.locationObj;
  // 0/0 liefert ChurchDesk für nicht geokodierte Orte.
  const hasCoords =
    !!lo &&
    typeof lo.latitude === "number" &&
    typeof lo.longitude === "number" &&
    !(lo.latitude === 0 && lo.longitude === 0);

  const locationName = event.locationName || event.location || lo?.name || undefined;

  // Korrekturen haben Vorrang, sonst liegen Kirche und Pastorat unter einer Adresse aufeinander.
  const fix = dynamicCoordFixFor(locationName) ?? coordFixFor(locationName);

  // Ein /admin-Eintrag ist maßgeblich, die Code-Tabelle gilt nur ohne ihn.
  const dynTitle = dynamicTitleFixFor(event.title);

  // Ohne Ort über den Titel zuordnen, sonst liegen ganze Serien auf einer Nadel.
  const titleFix =
    !locationName && !hasCoords ? dynTitle?.coords ?? coordFixForTitle(event.title) : undefined;

  // Nur mit Häkchen überstimmt ein Eintrag ChurchDesk, sonst ließe es sich im Admin nie abwählen.
  const titleOverride = dynTitle
    ? dynTitle.force
      ? dynTitle.coords
      : undefined
    : coordOverrideForTitle(event.title);

  const coords =
    titleOverride ??
    fix ??
    titleFix ??
    (hasCoords
      ? { lat: lo!.latitude as number, lng: lo!.longitude as number }
      : fallbackCoords(parish, orgId));

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [coords.lng, coords.lat], // GeoJSON: [lng, lat]
    },
    properties: {
      id: event.id,
      title: event.title,
      startUtc: utcIso(event.startDate),
      endUtc: utcIso(event.endDate),
      allDay: !!event.allDay,
      showEndtime: event.showEndtime !== false,
      summary: event.summary || undefined,
      descriptionHtml: event.description || undefined,
      image: pickImage(event.image),
      // Kanonischer Name, weil die App Filter-Chip und Kategorie per String vergleicht.
      categories: (event.categories ?? []).map((c) => ({
        id: c.id,
        title: kanonischeKategorie(c.title),
        color: c.color,
      })),
      contributor: event.contributor || undefined,
      parish,
      parishes: allParishes.length > 1 ? allParishes : undefined,
      kirchspiel: resolveKirchspiel(parish, orgId),
      orgId,
      orgName: orgName(orgId),
      locationName,
      address: lo?.address || undefined,
      city: lo?.city || undefined,
      zipcode: lo?.zipcode || undefined,
      price: event.price || undefined,
      coordSource: fix || titleFix || titleOverride ? "fix" : hasCoords ? "event" : "fallback",
      highlight:
        hasHighlightTag(event.summary, event.description) ||
        isDynamicHighlight(event.id) ||
        undefined,
    },
  };
}

// Reine Entscheidung für die Android-Zurücktaste: Welche Ebene schließt sich?
// Die drei Sheets sind normale Views im einzigen Router-Screen — ohne diese
// Logik ging „Zurück“ an den Root-Stack und schickte die App in den Hintergrund.

export interface OpenLayers {
  eventOpen: boolean;
  filtersOpen: boolean;
  profileOpen: boolean;
}

export type BackTarget = "event" | "filters" | "profile";

/**
 * Oberste offene Ebene, von innen nach außen: erst die Terminansicht, dann
 * der Filter, dann das Profil. `null` = nichts offen → Zurück darf ans System.
 */
export function resolveBackPress(layers: OpenLayers): BackTarget | null {
  if (layers.eventOpen) return "event";
  if (layers.filtersOpen) return "filters";
  if (layers.profileOpen) return "profile";
  return null;
}

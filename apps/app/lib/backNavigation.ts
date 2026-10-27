// Android-Zurücktaste: welche Ebene schließt sich, sonst ginge die App in den Hintergrund.

export interface OpenLayers {
  eventOpen: boolean;
  filtersOpen: boolean;
  profileOpen: boolean;
}

export type BackTarget = "event" | "filters" | "profile";

/** Oberste offene Ebene (Termin, Filter, Profil), `null` wenn nichts offen ist. */
export function resolveBackPress(layers: OpenLayers): BackTarget | null {
  if (layers.eventOpen) return "event";
  if (layers.filtersOpen) return "filters";
  if (layers.profileOpen) return "profile";
  return null;
}

// Plattform-neutraler Typ-Vertrag. Metro/Webpack wählen automatisch
// EventMap.web.tsx (react-maplibre) bzw. EventMap.native.tsx (maplibre-react-native).
import type { EventFeature } from "@kkd/shared";
import type { Bounds, LatLng } from "../lib/filters";

export interface EventMapProps {
  features: EventFeature[];
  selectedId?: number | null;
  onSelect: (id: number | null) => void;
  /** Eigener Standort — zeigt „Du bist hier"-Marker. */
  userLocation?: LatLng | null;
  /** Wird beim Verschieben/Zoomen mit den sichtbaren Bounds aufgerufen. */
  onBoundsChange?: (bounds: Bounds) => void;
  /** Zähler: bei Erhöhung fliegt die Karte zum userLocation (für „Zu mir"-Button/Chip). */
  flyToUserToken?: number;
  /** Wenn ein Sheet/Modal offen ist: Karten-Controls (Attribution) ausblenden. */
  dimmed?: boolean;
  /** Button „Zu meinem Standort" — wenn gesetzt, wird er angezeigt. */
  onJumpToLocation?: () => void;
}

// Fallback-Export (Bundler überschreibt per Plattform-Suffix).
export { default } from "./EventMap.web";

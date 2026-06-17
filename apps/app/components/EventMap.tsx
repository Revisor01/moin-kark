// Plattform-neutraler Typ-Vertrag. Metro/Webpack wählen automatisch
// EventMap.web.tsx (react-maplibre) bzw. EventMap.native.tsx (maplibre-react-native).
import type { EventFeature } from "@kkd/shared";

export interface EventMapProps {
  features: EventFeature[];
  selectedId?: number | null;
  onSelect: (id: number | null) => void;
}

// Fallback-Export (Bundler überschreibt per Plattform-Suffix).
export { default } from "./EventMap.web";

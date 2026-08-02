// Native Karte (iOS/Android) mit MapLibre RN v11. Gleicher Style, Fog of War,
// Outline, Cluster + Pins, Standort-Marker, Bounds-Callback, Fly-to wie im Web.
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  type CameraRef,
  type GeoJSONSourceRef,
} from "@maplibre/maplibre-react-native";
import type { EventFeatureCollection } from "@moinkark/shared";
import { MAP_STYLE, SOURCE_ID, sourceConfig } from "../lib/mapStyle";
import { DITHMARSCHEN, colors } from "../lib/theme";
import { DITHMARSCHEN_MASK, DITHMARSCHEN_OUTLINE } from "../lib/dithmarschen-boundary";
import type { EventMapProps } from "./EventMap";

/**
 * Wählt aus den angetippten Pins den zeitlich nächsten Termin.
 *
 * Nötig, weil an einem Ort viele Events auf EXAKT derselben Koordinate liegen
 * (St. Bartholomäus Wesselburen: 13 Termine). MapLibre meldet dann entweder nur
 * den obersten Pin oder mehrere in beliebiger Reihenfolge — in beiden Fällen ist
 * `features[0]` Zufall. Darum: alle Events an dieser Koordinate aus den Daten
 * heraussuchen und den nehmen, der als nächstes stattfindet.
 */
function nearestEventId(hits: any[], features: EventMapProps["features"]): number {
  const ids = new Set(hits.map((h) => Number(h?.properties?.id)).filter(Number.isFinite));
  const first = hits[0];
  const [hlng, hlat] = first?.geometry?.coordinates ?? [];

  // Alle Events auf derselben Koordinate einsammeln (nicht nur die gemeldeten).
  const sameSpot = features.filter((f) => {
    const [lng, lat] = f.geometry.coordinates;
    return lng === hlng && lat === hlat;
  });

  const candidates = sameSpot.length > 0 ? sameSpot : features.filter((f) => ids.has(f.properties.id));
  if (candidates.length === 0) return Number(first?.properties?.id);

  // Frühester Start gewinnt. Vergangene sind hier bereits ausgefiltert
  // (applyFilters/isPast laufen vor der Übergabe an die Karte).
  let best = candidates[0];
  for (const f of candidates) {
    if (new Date(f.properties.startUtc) < new Date(best.properties.startUtc)) best = f;
  }
  return best.properties.id;
}

export default function EventMap({
  features,
  onSelect,
  userLocation,
  onBoundsChange,
  flyToUserToken,
  flyToOverviewToken,
}: EventMapProps) {
  const cameraRef = useRef<CameraRef>(null);
  const sourceRef = useRef<GeoJSONSourceRef>(null);

  const data: EventFeatureCollection = { type: "FeatureCollection", features };

  // Standort in einer Ref mitführen: der Fly-to-Effect darf NUR am Token hängen.
  // Vorher stand userLocation in den Dependencies — und weil useLocation per
  // watchPositionAsync alle 25 m eine neue Position liefert, ist die Karte beim
  // freien Navigieren immer wieder auf den eigenen Punkt zurückgesprungen.
  const locationRef = useRef(userLocation);
  locationRef.current = userLocation;

  useEffect(() => {
    const loc = locationRef.current;
    if (!flyToUserToken || !loc) return;
    // Das Listen-Sheet verdeckt den unteren Kartenteil → Position NICHT in die Mitte der
    // Gesamtkarte, sondern in die Mitte des SICHTBAREN oberen Bereichs setzen. Dazu das
    // Kartenzentrum nach Süden verschieben (Position erscheint dadurch weiter oben).
    // Offset ≈ Bruchteil der sichtbaren lat-Spanne bei Zoom 11.5. 0.055 war zu groß
    // (Position landete oberhalb des Sichtfelds) → auf ~0.03 reduziert.
    const LAT_OFFSET = 0.03;
    cameraRef.current?.flyTo({
      center: [loc.lng, loc.lat - LAT_OFFSET],
      zoom: 11.5,
      duration: 700,
    });
  }, [flyToUserToken]);

  // Fallback: auf die Dithmarschen-Übersicht fliegen (ferner Standort → nicht ins Leere fliegen).
  useEffect(() => {
    if (!flyToOverviewToken) return;
    cameraRef.current?.flyTo({
      center: DITHMARSCHEN.center,
      zoom: DITHMARSCHEN.zoom,
      duration: 700,
    });
  }, [flyToOverviewToken]);

  const onSourcePress = async (e: any) => {
    // MapLibre RN v11: Features liegen unter e.nativeEvent.features
    const hits: any[] = e?.nativeEvent?.features ?? e?.features ?? [];
    const feat = hits[0];
    if (!feat) return;
    if (feat.properties?.point_count) {
      // Cluster → exakt so weit reinzoomen, dass er sich in die nächste Ebene
      // aufteilt (Sub-Cluster oder Einzel-Spots). Tippt man dann auf einen der
      // kleineren, splittet er weiter — bis zum einzelnen Event.
      const coords = feat.geometry?.coordinates;
      const clusterId = feat.properties?.cluster_id;
      if (!coords) return;
      let zoom = 13;
      try {
        if (clusterId != null && sourceRef.current) {
          const exp = await sourceRef.current.getClusterExpansionZoom(Number(clusterId));
          // Etwas über den Split-Zoom hinaus, damit die Aufteilung sicher sichtbar wird.
          if (Number.isFinite(exp)) zoom = exp + 0.5;
        }
      } catch {
        // Fallback bleibt zoom = 13.
      }
      cameraRef.current?.flyTo({ center: coords, zoom, duration: 450 });
      return;
    }
    // Mehrere Events am GLEICHEN Ort (Kirche mit Gottesdienst, Orgelkonzert, …)
    // liegen als deckungsgleiche Pins übereinander. features[0] ist dabei
    // willkürlich — beim Tippen kam so das Orgelkonzert nächste Woche statt des
    // Gottesdienstes in einer Stunde. Darum den zeitlich NÄCHSTEN Termin wählen.
    onSelect(nearestEventId(hits, features));
  };

  const onRegionDidChange = (e: any) => {
    if (!onBoundsChange) return;
    // MapLibre RN v11.3: ViewStateChangeEvent mit bounds = [west, south, east, north].
    // Je nach RN-Bridge liegt es unter nativeEvent oder direkt am Event → beide prüfen.
    const b = e?.nativeEvent?.bounds ?? e?.bounds;
    if (b && b.length === 4) {
      const [west, south, east, north] = b;
      onBoundsChange({ west, south, east, north });
    }
  };

  const userPointFC: EventFeatureCollection | any = userLocation
    ? {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [userLocation.lng, userLocation.lat] },
          },
        ],
      }
    : null;

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={MAP_STYLE as any}
        logo={false}
        compass={false}
        attribution={false}
        onRegionDidChange={onRegionDidChange}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: DITHMARSCHEN.center,
            zoom: DITHMARSCHEN.zoom,
          }}
          maxBounds={[
            DITHMARSCHEN.bounds[0][0],
            DITHMARSCHEN.bounds[0][1],
            DITHMARSCHEN.bounds[1][0],
            DITHMARSCHEN.bounds[1][1],
          ]}
        />

        {/* Fog of War + Umriss */}
        <GeoJSONSource id="dith-mask" data={DITHMARSCHEN_MASK}>
          <Layer
            id="dith-mask-fill"
            type="fill"
            style={{ fillColor: "#0A1F1F", fillOpacity: 0.55 }}
          />
        </GeoJSONSource>
        <GeoJSONSource id="dith-outline" data={DITHMARSCHEN_OUTLINE}>
          <Layer
            id="dith-outline-line"
            type="line"
            style={{ lineColor: colors.primary, lineWidth: 3, lineOpacity: 0.9 }}
          />
        </GeoJSONSource>

        {/* Events */}
        <GeoJSONSource
          ref={sourceRef}
          id={SOURCE_ID}
          data={data as any}
          cluster
          clusterMaxZoom={sourceConfig.clusterMaxZoom}
          clusterRadius={sourceConfig.clusterRadius}
          onPress={onSourcePress}
        >
          <Layer
            id="clusters"
            type="circle"
            filter={["has", "point_count"]}
            style={{
              circleColor: colors.primary,
              circleOpacity: 0.94,
              circleRadius: ["step", ["get", "point_count"], 16, 5, 20, 15, 26, 40, 34],
              circleStrokeWidth: 3,
              circleStrokeColor: "#FFFFFF",
            }}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={["has", "point_count"]}
            style={{
              textField: ["get", "point_count_abbreviated"],
              textSize: 13,
              textColor: "#FFFFFF",
              textFont: ["Noto Sans Bold"],
            }}
          />
          <Layer
            id="unclustered-point"
            type="circle"
            filter={["!", ["has", "point_count"]]}
            style={{
              circleColor: colors.accent,
              circleRadius: 8,
              circleStrokeWidth: 2.5,
              circleStrokeColor: "#FFFFFF",
            }}
          />
        </GeoJSONSource>

        {/* Standort-Marker */}
        {userPointFC ? (
          <GeoJSONSource id="user-loc" data={userPointFC}>
            <Layer
              id="user-loc-halo"
              type="circle"
              style={{ circleColor: "#2563EB", circleOpacity: 0.2, circleRadius: 16 }}
            />
            <Layer
              id="user-loc-dot"
              type="circle"
              style={{
                circleColor: "#2563EB",
                circleRadius: 7,
                circleStrokeWidth: 3,
                circleStrokeColor: "#FFFFFF",
              }}
            />
          </GeoJSONSource>
        ) : null}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});

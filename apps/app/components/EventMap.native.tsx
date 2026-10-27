// Native Karte mit MapLibre RN v11, gleicher Style und Ablauf wie im Web.
import { useEffect, useMemo, useRef } from "react";
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
import {
  DITHMARSCHEN,
  MAP_STYLE,
  SOURCE_ID,
  clusterCountLayer,
  clusterLayer,
  fogPaint,
  outlinePaint,
  pointLayer,
  sourceConfig,
  toNativeStyle,
  userMarker,
} from "../lib/mapStyle";
import { DITHMARSCHEN_MASK, DITHMARSCHEN_OUTLINE } from "../lib/dithmarschen-boundary";
import { pickNearestAtSpot } from "../lib/nearestEvent";
import type { EventMapProps } from "./EventMap";

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

  // Memoisiert, sonst setzte MapLibre die Source bei jedem Render neu.
  const data: EventFeatureCollection = useMemo(
    () => ({ type: "FeatureCollection", features }),
    [features]
  );

  // Ref, damit der Fly-to nur am Token hängt und nicht alle 25 m zurückspringt.
  const locationRef = useRef(userLocation);
  locationRef.current = userLocation;

  useEffect(() => {
    const loc = locationRef.current;
    if (!flyToUserToken || !loc) return;
    // Zentrum nach Süden versetzt (etwa 0.03), weil das Sheet den unteren Teil verdeckt.
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

  // Zeitfenster nach einem Pin-Tap, falls eine Plattform ihn ohne `features` weiterreicht.
  const lastPinPressRef = useRef(0);

  const onSourcePress = async (e: any) => {
    lastPinPressRef.current = Date.now();
    // MapLibre RN v11: Features liegen unter e.nativeEvent.features
    const hits: any[] = e?.nativeEvent?.features ?? e?.features ?? [];
    const feat = hits[0];
    if (!feat) return;
    if (feat.properties?.point_count) {
      // Genau so weit zoomen, dass der Cluster zerfällt.
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
    // Deckungsgleiche Pins: den zeitlich nächsten Termin nehmen (lib/nearestEvent.ts).
    const id = pickNearestAtSpot(
      features,
      feat.geometry?.coordinates,
      hits.map((h) => Number(h?.properties?.id))
    );
    if (id != null) onSelect(id);
  };

  /** Tap daneben hebt die Auswahl auf; Pin-Taps kommen mit `features` und zählen nicht. */
  const onMapPress = (e: any) => {
    const hits: any[] = e?.nativeEvent?.features ?? e?.features ?? [];
    if (hits.length > 0) return;
    if (Date.now() - lastPinPressRef.current < 300) return;
    onSelect(null);
  };

  const onRegionDidChange = (e: any) => {
    if (!onBoundsChange) return;
    // bounds liegt je nach Bridge unter nativeEvent oder am Event.
    const b = e?.nativeEvent?.bounds ?? e?.bounds;
    if (b && b.length === 4) {
      const [west, south, east, north] = b;
      onBoundsChange({ west, south, east, north });
    }
  };

  // Nur bei neuer Koordinate ein neues Objekt, sonst setzt MapLibre die Source dauernd neu.
  const userLat = userLocation?.lat;
  const userLng = userLocation?.lng;
  const userPointFC: EventFeatureCollection | any = useMemo(
    () =>
      userLat !== undefined && userLng !== undefined
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: [userLng, userLat] },
              },
            ],
          }
        : null,
    [userLat, userLng]
  );

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={MAP_STYLE as any}
        logo={false}
        compass={false}
        attribution={false}
        onPress={onMapPress}
        onRegionDidChange={onRegionDidChange}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: DITHMARSCHEN.center,
            zoom: DITHMARSCHEN.zoom,
          }}
          maxBounds={DITHMARSCHEN.bounds}
        />

        {/* Fog of War + Umriss */}
        <GeoJSONSource id="dith-mask" data={DITHMARSCHEN_MASK}>
          <Layer
            id="dith-mask-fill"
            type="fill"
            style={toNativeStyle(fogPaint)}
          />
        </GeoJSONSource>
        <GeoJSONSource id="dith-outline" data={DITHMARSCHEN_OUTLINE}>
          <Layer
            id="dith-outline-line"
            type="line"
            style={toNativeStyle(outlinePaint)}
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
          {/* Dieselben Layer wie im Web (lib/mapStyle.ts), nur in die native
              camelCase-Schreibweise übersetzt — nichts hier doppelt pflegen. */}
          <Layer
            id={clusterLayer.id}
            type="circle"
            filter={clusterLayer.filter}
            style={toNativeStyle(clusterLayer.paint)}
          />
          <Layer
            id={clusterCountLayer.id}
            type="symbol"
            filter={clusterCountLayer.filter}
            style={toNativeStyle(clusterCountLayer.layout, clusterCountLayer.paint)}
          />
          <Layer
            id={pointLayer.id}
            type="circle"
            filter={pointLayer.filter}
            // Pin-Radius nativ fest 8 (Web: 6→9 nach Zoom) — bewusst beibehalten.
            style={{ ...toNativeStyle(pointLayer.paint), circleRadius: 8 }}
          />
        </GeoJSONSource>

        {/* Standort-Marker */}
        {userPointFC ? (
          <GeoJSONSource id="user-loc" data={userPointFC}>
            <Layer
              id="user-loc-halo"
              type="circle"
              style={{ circleColor: userMarker.color, circleOpacity: userMarker.haloOpacity, circleRadius: 16 }}
            />
            <Layer
              id="user-loc-dot"
              type="circle"
              style={{
                circleColor: userMarker.color,
                circleRadius: 7,
                circleStrokeWidth: userMarker.ringWidth,
                circleStrokeColor: userMarker.ring,
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

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
} from "@maplibre/maplibre-react-native";
import type { EventFeatureCollection } from "@kkd/shared";
import { MAP_STYLE, SOURCE_ID, sourceConfig } from "../lib/mapStyle";
import { DITHMARSCHEN, colors } from "../lib/theme";
import { DITHMARSCHEN_MASK, DITHMARSCHEN_OUTLINE } from "../lib/dithmarschen-boundary";
import type { EventMapProps } from "./EventMap";

export default function EventMap({
  features,
  onSelect,
  userLocation,
  onBoundsChange,
  flyToUserToken,
}: EventMapProps) {
  const cameraRef = useRef<CameraRef>(null);

  const data: EventFeatureCollection = { type: "FeatureCollection", features };

  useEffect(() => {
    if (!flyToUserToken || !userLocation) return;
    cameraRef.current?.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 11.5,
      duration: 700,
    });
  }, [flyToUserToken, userLocation]);

  const onSourcePress = (e: any) => {
    const feat = e?.features?.[0];
    if (!feat) return;
    if (feat.properties?.point_count) {
      const coords = feat.geometry?.coordinates;
      if (coords) {
        cameraRef.current?.flyTo({
          center: coords,
          zoom: 12.5,
          duration: 450,
        });
      }
      return;
    }
    onSelect(Number(feat.properties?.id));
  };

  const onRegionDidChange = (e: any) => {
    if (!onBoundsChange) return;
    const b = e?.nativeEvent?.bounds; // [west, south, east, north]
    if (!b) return;
    const [west, south, east, north] = b;
    onBoundsChange({ west, south, east, north });
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
        onPress={() => onSelect(null)}
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

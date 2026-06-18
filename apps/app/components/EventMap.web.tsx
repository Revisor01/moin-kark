import { useCallback, useEffect, useMemo, useRef } from "react";
import Map, {
  Layer,
  Marker,
  Source,
  type MapRef,
  type MapLayerMouseEvent,
} from "@vis.gl/react-maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { EventFeatureCollection } from "@kkd/shared";
import {
  CLUSTER_LAYER,
  POINT_LAYER,
  MAP_STYLE,
  SOURCE_ID,
  clusterCountLayer,
  clusterLayer,
  pointLayer,
  sourceConfig,
} from "../lib/mapStyle";
import { DITHMARSCHEN, colors } from "../lib/theme";
import { DITHMARSCHEN_MASK, DITHMARSCHEN_OUTLINE } from "../lib/dithmarschen-boundary";
import type { EventMapProps } from "./EventMap";

export default function EventMap({
  features,
  onSelect,
  userLocation,
  onBoundsChange,
  flyToUserToken,
  dimmed,
  onJumpToLocation,
}: EventMapProps) {
  const mapRef = useRef<MapRef>(null);

  const data: EventFeatureCollection = useMemo(
    () => ({ type: "FeatureCollection", features }),
    [features]
  );

  const emitBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map || !onBoundsChange) return;
    const b = map.getBounds();
    onBoundsChange({
      west: b.getWest(),
      south: b.getSouth(),
      east: b.getEast(),
      north: b.getNorth(),
    });
  }, [onBoundsChange]);

  // Auf „Zu mir"-Token reagieren.
  useEffect(() => {
    if (!flyToUserToken || !userLocation) return;
    mapRef.current?.easeTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 11.5,
      duration: 700,
    });
  }, [flyToUserToken, userLocation]);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;
      const feats = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER, POINT_LAYER],
      });
      const f = feats[0];
      if (!f) {
        onSelect(null);
        return;
      }
      if (f.properties?.point_count) {
        const src: any = map.getSource(SOURCE_ID);
        const clusterId = f.properties.cluster_id;
        src?.getClusterExpansionZoom(clusterId).then((zoom: number) => {
          map.easeTo({
            center: (f.geometry as any).coordinates,
            zoom: zoom + 0.2,
            duration: 500,
          });
        });
        return;
      }
      onSelect(Number(f.properties?.id));
    },
    [onSelect]
  );

  return (
    <Map
      ref={mapRef}
      initialViewState={{
        longitude: DITHMARSCHEN.center[0],
        latitude: DITHMARSCHEN.center[1],
        zoom: DITHMARSCHEN.zoom,
      }}
      maxBounds={DITHMARSCHEN.bounds}
      mapStyle={MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
      interactiveLayerIds={[CLUSTER_LAYER, POINT_LAYER]}
      onClick={onClick}
      onLoad={emitBounds}
      onMoveEnd={emitBounds}
      attributionControl={false}
      cursor="auto"
    >
      {/* Fog of War: alles außerhalb Dithmarschens abdunkeln */}
      <Source id="dith-mask" type="geojson" data={DITHMARSCHEN_MASK}>
        <Layer
          id="dith-mask-fill"
          type="fill"
          paint={{ "fill-color": "#0A1F1F", "fill-opacity": 0.55 }}
        />
      </Source>
      {/* Starker Umriss des Kirchenkreises */}
      <Source id="dith-outline" type="geojson" data={DITHMARSCHEN_OUTLINE}>
        <Layer
          id="dith-outline-line"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round" }}
          paint={{ "line-color": colors.primary, "line-width": 3, "line-opacity": 0.9 }}
        />
      </Source>


      <Source id={SOURCE_ID} {...sourceConfig} data={data as any}>
        <Layer {...(clusterLayer as any)} />
        <Layer {...(clusterCountLayer as any)} />
        <Layer {...(pointLayer as any)} />
      </Source>

      {userLocation ? (
        <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              background: "#2563EB",
              border: "3px solid #FFFFFF",
              boxShadow: "0 0 0 6px rgba(37,99,235,0.20)",
            }}
            aria-label="Du bist hier"
          />
        </Marker>
      ) : null}

      {/* „Zu meinem Standort"-Button */}
      {onJumpToLocation && !dimmed ? (
        <button
          onClick={onJumpToLocation}
          title="Zu meinem Standort"
          aria-label="Zu meinem Standort"
          style={{
            position: "absolute",
            right: 12,
            bottom: 28,
            width: 44,
            height: 44,
            borderRadius: 22,
            background: "#FFFFFF",
            border: "1px solid #E6DCCB",
            boxShadow: "0 2px 8px rgba(28,43,43,0.18)",
            cursor: "pointer",
            fontSize: 20,
            lineHeight: "44px",
            padding: 0,
          }}
        >
          ◎
        </button>
      ) : null}
    </Map>
  );
}

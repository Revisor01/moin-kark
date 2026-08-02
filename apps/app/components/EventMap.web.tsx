import { useCallback, useEffect, useMemo, useRef } from "react";
import Map, {
  Layer,
  Marker,
  Source,
  type MapRef,
  type MapLayerMouseEvent,
} from "@vis.gl/react-maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { EventFeatureCollection } from "@moinkark/shared";
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
  flyToOverviewToken,
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

  // Standort in einer Ref mitführen — der Effect darf NUR am Token hängen, sonst
  // zieht jede neue Position (Live-Tracking) die Karte zurück auf den eigenen Punkt.
  const locationRef = useRef(userLocation);
  locationRef.current = userLocation;

  // Auf „Zu mir"-Token reagieren.
  useEffect(() => {
    const loc = locationRef.current;
    if (!flyToUserToken || !loc) return;
    mapRef.current?.easeTo({
      center: [loc.lng, loc.lat],
      zoom: 11.5,
      duration: 700,
    });
  }, [flyToUserToken]);

  // Fallback: auf die Dithmarschen-Übersicht (ferner Standort → nicht ins Leere).
  useEffect(() => {
    if (!flyToOverviewToken) return;
    mapRef.current?.easeTo({
      center: [DITHMARSCHEN.center[0], DITHMARSCHEN.center[1]],
      zoom: DITHMARSCHEN.zoom,
      duration: 700,
    });
  }, [flyToOverviewToken]);

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
      // Mehrere Events am gleichen Ort liegen deckungsgleich übereinander —
      // feats[0] wäre Zufall. Den zeitlich nächsten Termin wählen (s. native).
      const [hlng, hlat] = (f.geometry as any).coordinates ?? [];
      const sameSpot = features.filter((x) => {
        const [lng, lat] = x.geometry.coordinates;
        return lng === hlng && lat === hlat;
      });
      if (sameSpot.length === 0) {
        onSelect(Number(f.properties?.id));
        return;
      }
      let best = sameSpot[0];
      for (const x of sameSpot) {
        if (new Date(x.properties.startUtc) < new Date(best.properties.startUtc)) best = x;
      }
      onSelect(best.properties.id);
    },
    [onSelect, features]
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
    </Map>
  );
}

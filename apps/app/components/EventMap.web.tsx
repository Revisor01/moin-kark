import { useCallback, useEffect, useMemo, useRef } from "react";
import Map, {
  Layer,
  Marker,
  Source,
  type MapRef,
  type MapLayerMouseEvent,
} from "@vis.gl/react-maplibre";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { EventFeatureCollection } from "@moinkark/shared";
import {
  CLUSTER_LAYER,
  DITHMARSCHEN,
  POINT_LAYER,
  MAP_STYLE,
  SOURCE_ID,
  clusterCountLayer,
  clusterLayer,
  fogPaint,
  outlinePaint,
  pointLayer,
  sourceConfig,
  userMarker,
} from "../lib/mapStyle";
import { radius, withAlpha } from "../lib/theme";
import { DITHMARSCHEN_MASK, DITHMARSCHEN_OUTLINE } from "../lib/dithmarschen-boundary";
import { pickNearestAtSpot } from "../lib/nearestEvent";
import type { EventMapProps } from "./EventMap";

// MapLibre ab 6.0 bestimmt die URL seines Web-Workers aus `import.meta.url`.
// Metro löst das zu einem Pfad auf, unter dem die Datei im Export nicht liegt —
// der Worker startet dann nie, und ohne ihn dekodiert MapLibre keine
// Vektorkacheln: Die Karte bliebe leer, ohne eine Fehlermeldung zu erzeugen.
// `npm run sync:map-worker` legt die Datei nach public/, von wo sie unter der
// Host-Wurzel ausgeliefert wird.
setWorkerUrl("/maplibre-gl-worker.mjs");

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
      // feats[0] wäre Zufall. Den zeitlich nächsten Termin wählen (Logik in
      // lib/nearestEvent.ts, geteilt mit der nativen Karte).
      const id = pickNearestAtSpot(
        features,
        (f.geometry as any).coordinates,
        feats.map((x: typeof f) => Number(x.properties?.id))
      );
      if (id != null) onSelect(id);
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
          paint={fogPaint}
        />
      </Source>
      {/* Starker Umriss des Kirchenkreises */}
      <Source id="dith-outline" type="geojson" data={DITHMARSCHEN_OUTLINE}>
        <Layer
          id="dith-outline-line"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round" }}
          paint={outlinePaint}
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
              borderRadius: radius.pill,
              background: userMarker.color,
              border: `${userMarker.ringWidth}px solid ${userMarker.ring}`,
              boxShadow: `0 0 0 6px ${withAlpha(userMarker.color, userMarker.haloOpacity)}`,
            }}
            aria-label="Du bist hier"
          />
        </Marker>
      ) : null}
    </Map>
  );
}

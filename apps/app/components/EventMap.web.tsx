import { useCallback, useMemo, useRef } from "react";
import Map, {
  Layer,
  Source,
  type MapRef,
  type MapLayerMouseEvent,
} from "@vis.gl/react-maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { EventFeature, EventFeatureCollection } from "@kkd/shared";
import {
  CLUSTER_LAYER,
  POINT_LAYER,
  OPENFREEMAP_STYLE,
  SOURCE_ID,
  clusterCountLayer,
  clusterLayer,
  pointLayer,
  sourceConfig,
} from "../lib/mapStyle";
import { DITHMARSCHEN } from "../lib/theme";
import type { EventMapProps } from "./EventMap";

export default function EventMap({ features, onSelect }: EventMapProps) {
  const mapRef = useRef<MapRef>(null);

  const data: EventFeatureCollection = useMemo(
    () => ({ type: "FeatureCollection", features }),
    [features]
  );

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
      // Cluster → reinzoomen.
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
      mapStyle={OPENFREEMAP_STYLE}
      style={{ width: "100%", height: "100%" }}
      interactiveLayerIds={[CLUSTER_LAYER, POINT_LAYER]}
      onClick={onClick}
      cursor="auto"
    >
      <Source id={SOURCE_ID} {...sourceConfig} data={data as any}>
        <Layer {...(clusterLayer as any)} />
        <Layer {...(clusterCountLayer as any)} />
        <Layer {...(pointLayer as any)} />
      </Source>
    </Map>
  );
}

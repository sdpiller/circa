"use client";
/** The plain MapLibre globe. Nothing is drawn on it and it does not react to clicks yet. */
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import styles from "./globe.module.css";

export function GlobeMap({ styleUrl }: { styleUrl: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    (async () => {
      const maplibregl = await import("maplibre-gl"); // browser only: MapLibre needs window and WebGL
      if (cancelled || !container.current) return;
      // MapLibre looks for its worker beside its own module, which the bundle moves. Point it at the file.
      maplibregl.setWorkerUrl(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      map = new maplibregl.Map({
        container: container.current,
        style: styleUrl,
        center: [20, 30],
        zoom: 1.6,
        attributionControl: { compact: true },
      });
      map.on("style.load", () => map!.setProjection({ type: "globe" }));
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [styleUrl]);

  return <div ref={container} className={styles.map} aria-label="Globe of historical events. Arrow keys pan, plus and minus zoom." />;
}

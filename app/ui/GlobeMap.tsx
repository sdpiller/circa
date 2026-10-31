"use client";
/** The MapLibre globe, recoloured cream. Nothing is drawn on it and it does not react to clicks yet. */
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { apparentZoom, FADE_MS, LABEL_GROUPS, labelGroupOn } from "../../lib/labels.ts";
import styles from "./globe.module.css";

/** Map paint values, matching the palette in globals.css and spec 3.2. */
const LAND = "#f8f4ea";
const WATER = "#e3ded2";
const LINE = "#cfc8ba";
const ROAD = "#e6e0d3";
const INK = "#241f1a";
const MUTED = "#7f786e";

const COUNTRY_LABELS = ["label_country_1", "label_country_2", "label_country_3"];

export function GlobeMap({ styleUrl }: { styleUrl: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];
    (async () => {
      const maplibregl = await import("maplibre-gl"); // browser only: MapLibre needs window and WebGL
      if (cancelled || !container.current) return;
      // MapLibre looks for its worker beside its own module, which the bundle moves. Point it at the file.
      maplibregl.setWorkerUrl(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      const m = new maplibregl.Map({
        container: container.current,
        style: styleUrl,
        center: [24, 24],
        zoom: 1.75, // the whole globe
        attributionControl: { compact: true },
      });
      map = m;
      const el = container.current;
      const fade = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : FADE_MS;
      const on = LABEL_GROUPS.map(() => false);

      const layersOf = (ids: string[]) => ids.filter((id) => m.getLayer(id));

      const syncLabels = () => {
        const z = apparentZoom(m.getZoom(), m.getCenter().lat);
        LABEL_GROUPS.forEach((g, i) => {
          const want = labelGroupOn(on[i], z, g.at);
          if (want === on[i]) return;
          on[i] = want;
          const ids = layersOf(g.layers);
          clearTimeout(timers[i]);
          if (want) {
            for (const id of ids) {
              m.setLayoutProperty(id, "visibility", "visible");
              m.setPaintProperty(id, "text-opacity", 1);
            }
          } else {
            for (const id of ids) m.setPaintProperty(id, "text-opacity", 0);
            // Hidden labels stop taking part in collision once the fade is done.
            timers[i] = setTimeout(() => {
              for (const id of ids) m.setLayoutProperty(id, "visibility", "none");
            }, fade);
          }
        });
      };

      m.on("style.load", () => {
        m.setProjection({ type: "globe" });
        // Each call is guarded: a custom BASEMAP_STYLE_URL may lack a layer or property, and must not throw.
        const paint = (id: string, prop: string, value: unknown) => {
          if (m.getLayer(id)) m.setPaintProperty(id, prop as never, value as never);
        };
        for (const l of m.getStyle().layers) {
          if (l.type === "line" && "source" in l && l.source === "openmaptiles") paint(l.id, "line-color", ROAD);
          if (l.type === "fill" && l.id !== "water") paint(l.id, "fill-color", LAND);
          if (l.type === "symbol") {
            paint(l.id, "text-color", MUTED);
            paint(l.id, "text-halo-color", LAND);
            paint(l.id, "text-halo-width", 1.2);
          }
        }
        paint("background", "background-color", LAND);
        paint("water", "fill-color", WATER);
        for (const id of ["boundary_2", "boundary_3", "boundary_disputed"]) paint(id, "line-color", LINE);
        for (const id of COUNTRY_LABELS) paint(id, "text-color", INK);

        // Start with every name group off. The style's own minzoom is removed: apparent zoom decides instead.
        LABEL_GROUPS.forEach((g, i) => {
          on[i] = false;
          for (const id of layersOf(g.layers)) {
            m.setLayerZoomRange(id, 0, 24);
            m.setPaintProperty(id, "text-opacity-transition", { duration: fade, delay: 0 });
            m.setPaintProperty(id, "text-opacity", 0);
            m.setLayoutProperty(id, "visibility", "none");
          }
        });
        syncLabels();
        el.classList.add(styles.ready);
      });
      m.on("move", syncLabels);
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      map?.remove();
    };
  }, [styleUrl]);

  return <div ref={container} className={styles.map} aria-label="Globe of history. Arrow keys pan, plus and minus zoom." />;
}

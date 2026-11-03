"use client";
/**
 * The globe as a live preview: the planet, turning from one featured place to the next, where that
 * story's outline fades in and out. Nothing to click. Under reduced motion it holds still on the first place.
 * The outlines come from GET /api/outline at fixed points and years, so after the first visitor the CDN answers.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { outlineUrl } from "../../lib/box.ts";
import type { HoverOutline } from "../../lib/db/area.ts";
import { ACCENT, LAND, paintCream } from "./cream.ts";
import { easeOut, still } from "./motion.ts";
import styles from "./globe.module.css";

export type PreviewPlace = { lon: number; lat: number; from: number; to: number };

const TURN_MS = 3200;
const SHOW_MS = 2600;
const FADE_MS = 600;
/** The globe's diameter as a share of the frame's shorter side: a little more than all of it, so places read larger and only the poles are cut. */
const FILL = 1.15;

const EMPTY = { type: "FeatureCollection" as const, features: [] };

/** The zoom at which the globe's diameter is FILL of the frame's shorter side, centred at `lat` (lib/camera.ts has the radius relation). */
function wholeGlobeZoom(m: MapLibreMap, lat: number): number {
  const box = m.getContainer();
  const side = Math.max(Math.min(box.clientWidth, box.clientHeight), 1);
  return Math.log2((FILL * side * Math.PI * Math.cos((lat * Math.PI) / 180)) / 512);
}

function showOutline(m: MapLibreMap, shown: boolean) {
  m.setPaintProperty("pv-fill", "fill-opacity", shown ? 0.12 : 0);
  m.setPaintProperty("pv-case", "line-opacity", shown ? 0.9 : 0);
  m.setPaintProperty("pv-line", "line-opacity", shown ? 1 : 0);
}

export function GlobePreview({ styleUrl, places }: { styleUrl: string; places: PreviewPlace[] }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outlines = new Map<number, Promise<HoverOutline | null>>();
    const outlineOf = (i: number) => {
      let o = outlines.get(i);
      if (!o) {
        o = fetch(outlineUrl(places[i]))
          .then((r) => (r.ok ? r.json() : { outline: null }))
          .then((b: { outline: HoverOutline | null }) => b.outline)
          .catch(() => null);
        outlines.set(i, o);
      }
      return o;
    };
    const later = (ms: number, f: () => void) => {
      timer = setTimeout(() => {
        if (!cancelled) f();
      }, ms);
    };

    (async () => {
      const maplibregl = await import("maplibre-gl"); // browser only: MapLibre needs window and WebGL
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      const el = container.current;
      const first = places[0];
      const m = new maplibregl.Map({
        container: el,
        style: styleUrl,
        center: [first.lon, first.lat],
        zoom: 1,
        interactive: false,
        attributionControl: { compact: false }, // always open: nothing here can be clicked to open it
      });
      map = m;
      const calm = still();

      // Turn to place i, show its outline, fade it, go on. A hidden tab waits instead of turning.
      const visit = async (i: number) => {
        if (document.hidden) return later(SHOW_MS, () => visit(i));
        const p = places[i];
        m.easeTo({ center: [p.lon, p.lat], zoom: wholeGlobeZoom(m, p.lat), duration: calm ? 0 : TURN_MS, easing: easeOut });
        const turned = new Promise<void>((resolve) => later(calm ? 0 : TURN_MS, resolve));
        const [outline] = await Promise.all([outlineOf(i), turned]);
        void outlineOf((i + 1) % places.length); // ask for the next one while this one shows
        if (cancelled) return;
        if (outline) {
          m.getSource<GeoJSONSource>("pv-fill")?.setData(outline.fill);
          m.getSource<GeoJSONSource>("pv-lines")?.setData(outline.lines);
          showOutline(m, true);
        }
        if (calm) return;
        later(SHOW_MS, () => {
          showOutline(m, false);
          later(FADE_MS, () => void visit((i + 1) % places.length));
        });
      };

      m.on("style.load", () => {
        m.setProjection({ type: "globe" });
        paintCream(m);
        for (const l of m.getStyle().layers) if (l.type === "symbol") m.setLayoutProperty(l.id, "visibility", "none");
        const fade = { duration: calm ? 0 : FADE_MS, delay: 0 };
        const round = { "line-join": "round", "line-cap": "round" } as const;
        m.addSource("pv-fill", { type: "geojson", data: EMPTY });
        m.addSource("pv-lines", { type: "geojson", data: EMPTY });
        m.addLayer({ id: "pv-fill", type: "fill", source: "pv-fill", paint: { "fill-color": ACCENT, "fill-opacity": 0, "fill-opacity-transition": fade, "fill-antialias": false } });
        m.addLayer({ id: "pv-case", type: "line", source: "pv-lines", layout: round, paint: { "line-color": LAND, "line-width": 3.5, "line-opacity": 0, "line-opacity-transition": fade } });
        m.addLayer({ id: "pv-line", type: "line", source: "pv-lines", layout: round, paint: { "line-color": ACCENT, "line-width": 1.6, "line-opacity": 0, "line-opacity-transition": fade } });
        m.jumpTo({ zoom: wholeGlobeZoom(m, first.lat) });
        el.classList.add(styles.ready);
        void visit(0);
      });
      m.on("resize", () => m.setZoom(wholeGlobeZoom(m, m.getCenter().lat)));
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      map?.remove();
    };
  }, [styleUrl, places]);

  return <div ref={container} className={styles.preview} role="img" aria-label="A globe turning from one featured place to the next" />;
}

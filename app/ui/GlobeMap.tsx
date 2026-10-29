"use client";
/**
 * The MapLibre globe and its dots. Refetches /api/events when the camera stops moving or the
 * year range changes, debounced, and aborts a stale request so an old answer never overwrites a new one.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef } from "react";
import type { CircleLayerSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { EventsResult } from "../../lib/db/events.ts";
import { DOT_GROUPS, toFeatureCollection, type DotProperties, type GroupKey } from "../../lib/dots.ts";
import type { YearRange } from "../../lib/time/index.ts";
import styles from "./globe.module.css";

/** Only results are reported, so the legend keeps the last counts while the next request is in flight. */
export type MapStatus = { state: "loading" } | { state: "error" } | { state: "ready"; counts: Record<GroupKey, number> };

const FETCH_DEBOUNCE_MS = 200;
/** Below this zoom the globe fills the view; matches the API's globe band, so ask for the whole world. */
const WHOLE_WORLD_BELOW_ZOOM = 3;

/** MapLibre's expression type, which the package does not export by name. */
type Expr = Extract<NonNullable<CircleLayerSpecification["paint"]>["circle-opacity"], unknown[]>;

// Built from the legend's list, so TypeScript cannot see it as a fixed-length expression tuple.
const groupColor = ["match", ["get", "group"], ...DOT_GROUPS.flatMap((g) => [g.key, g.color]), "#ffffff"] as unknown as Expr;
const isContext: Expr = ["==", ["get", "group"], "context"];

// Filled dots for exact locations, hollow rings in the same colour for inherited ones.
// Context dots are a little smaller and drawn beneath events (sortKey).
const DOT_LAYER: CircleLayerSpecification = {
  id: "dots",
  type: "circle",
  source: "dots",
  layout: { "circle-sort-key": ["get", "sortKey"] },
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["case", isContext, 3, 4], 8, ["case", isContext, 4.5, 6.5]],
    "circle-color": groupColor,
    "circle-opacity": ["case", ["get", "approx"], 0, 0.95],
    "circle-stroke-color": ["case", ["get", "approx"], groupColor, "#0c0c0c"],
    "circle-stroke-width": ["case", ["get", "approx"], 1.5, 1],
  },
};

function viewport(map: MapLibreMap) {
  const zoom = Math.min(map.getZoom(), 24);
  if (zoom < WHOLE_WORLD_BELOW_ZOOM) return { west: -180, south: -90, east: 180, north: 90, zoom };
  const b = map.getBounds();
  const lat = (v: number) => Math.min(90, Math.max(-90, v));
  return { west: b.getWest(), south: lat(b.getSouth()), east: b.getEast(), north: lat(b.getNorth()), zoom };
}

/** Built from DOM nodes, never innerHTML: labels come from Wikidata. */
function tooltip(p: DotProperties): HTMLElement {
  const el = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = p.label;
  const meta = document.createElement("div");
  meta.textContent = [p.years, p.what, p.approx ? "approximate location" : null].filter(Boolean).join(" · ");
  el.append(title, meta);
  return el;
}

export function GlobeMap({ styleUrl, range, onStatus }: { styleUrl: string; range: YearRange; onStatus: (s: MapStatus) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const rangeRef = useRef(range);
  const onStatusRef = useRef(onStatus);
  const abortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const v = viewport(map);
    const params = new URLSearchParams({
      west: v.west.toFixed(4),
      south: v.south.toFixed(4),
      east: v.east.toFixed(4),
      north: v.north.toFixed(4),
      from: String(rangeRef.current.from),
      to: String(rangeRef.current.to),
      zoom: v.zoom.toFixed(2),
    }).toString();
    // MapLibre fires extra moveend events (after the projection switch, at the end of zoom animations).
    if (params === lastQueryRef.current) return;
    lastQueryRef.current = params;
    try {
      const res = await fetch(`/api/events?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as EventsResult;
      const fc = toFeatureCollection(data.events);
      (map.getSource("dots") as GeoJSONSource | undefined)?.setData(fc);
      const counts = Object.fromEntries(DOT_GROUPS.map((g) => [g.key, 0])) as Record<GroupKey, number>;
      for (const f of fc.features) counts[f.properties.group]++;
      onStatusRef.current({ state: "ready", counts });
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // a newer request has taken over
      lastQueryRef.current = ""; // let the same view retry
      onStatusRef.current({ state: "error" });
    }
  }, []);

  const schedule = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(load, FETCH_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    rangeRef.current = range;
    schedule();
  }, [range, schedule]);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    (async () => {
      const maplibregl = await import("maplibre-gl"); // browser only: MapLibre needs window and WebGL
      if (cancelled || !container.current) return;
      // MapLibre looks for its worker beside its own module, which the bundle moves. Point it at the file.
      maplibregl.setWorkerUrl(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      map = new maplibregl.Map({ container: container.current, style: styleUrl, center: [20, 30], zoom: 1.6, attributionControl: { compact: true } });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: styles.tooltip });

      map.on("style.load", () => {
        map!.setProjection({ type: "globe" });
        map!.addSource("dots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map!.addLayer(DOT_LAYER);
        readyRef.current = true;
        schedule();
      });
      map.on("moveend", schedule);
      map.on("mousemove", "dots", (e) => {
        const f = e.features?.[0];
        if (!f || f.geometry.type !== "Point") return;
        map!.getCanvas().style.cursor = "pointer";
        popup.setLngLat(f.geometry.coordinates as [number, number]).setDOMContent(tooltip(f.properties as DotProperties)).addTo(map!);
      });
      map.on("mouseleave", "dots", () => {
        map!.getCanvas().style.cursor = "";
        popup.remove();
      });
    })();
    return () => {
      cancelled = true;
      readyRef.current = false;
      clearTimeout(timerRef.current);
      abortRef.current?.abort();
      map?.remove();
      mapRef.current = null;
      lastQueryRef.current = ""; // a new map starts empty, so it must fetch even an identical view
    };
  }, [styleUrl, schedule]);

  return <div ref={container} className={styles.map} aria-label="Globe of historical events. Arrow keys pan, plus and minus zoom." />;
}

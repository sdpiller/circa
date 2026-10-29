"use client";
/**
 * The MapLibre globe, its H3 grid, and its optional dots. Refetches /api/cells (and /api/events when
 * dots are on) when the camera stops moving or the year range changes, debounced, and aborts a stale
 * request so an old answer never overwrites a new one. Below GRID_MIN_ZOOM the globe is plain.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef } from "react";
import { latLngToCell } from "h3-js";
import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  GeoJSONSource,
  LineLayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import { GRID_MIN_ZOOM, cellPolygon, resolutionForZoom } from "../../lib/cells.ts";
import type { CellsResult } from "../../lib/db/cells.ts";
import type { EventsResult } from "../../lib/db/events.ts";
import { DOT_GROUPS, toFeatureCollection, type DotProperties, type GroupKey } from "../../lib/dots.ts";
import type { YearRange } from "../../lib/time/index.ts";
import styles from "./globe.module.css";

/** Only results are reported, so the legend keeps the last counts while the next request is in flight. */
export type MapStatus =
  | { state: "loading"; zoomedOut: boolean }
  | { state: "error"; zoomedOut: boolean }
  | { state: "ready"; zoomedOut: boolean; counts: Record<GroupKey, number>; cells: number };

/** What a click selected: a grid cell (optionally focused on one item in it), or ground with nothing documented. */
export type Selection = { kind: "cell"; cell: string; focus?: string } | { kind: "empty"; lngLat: [number, number] };

const FETCH_DEBOUNCE_MS = 200;
/** Below this zoom the globe fills the view; matches the API's globe band, so ask for the whole world. */
const WHOLE_WORLD_BELOW_ZOOM = 3;
const GRID_COLOR = "#e6e6e6";

type Fc = { type: "FeatureCollection"; features: object[] };
const EMPTY: Fc = { type: "FeatureCollection", features: [] };

function cellFeature(cell: string, properties: object) {
  return { type: "Feature", properties, geometry: { type: "Polygon", coordinates: [cellPolygon(cell)] } };
}

/** MapLibre's expression type, which the package does not export by name. */
type Expr = Extract<NonNullable<CircleLayerSpecification["paint"]>["circle-opacity"], unknown[]>;

// Built from the legend's list, so TypeScript cannot see it as a fixed-length expression tuple.
const groupColor = ["match", ["get", "group"], ...DOT_GROUPS.flatMap((g) => [g.key, g.color]), "#ffffff"] as unknown as Expr;
const isContext: Expr = ["==", ["get", "group"], "context"];

// Fill opacity tops out at 0.06: the dataviz validator needs all four dot colours at 3:1 against the
// composited fill over both basemap backgrounds (decisions.md entry 29). Both grid layers fade in
// between zoom 3 and 3.5.
const GRID_FILL_LAYER: FillLayerSpecification = {
  id: "grid-fill",
  type: "fill",
  source: "grid",
  paint: {
    "fill-color": GRID_COLOR,
    "fill-opacity": [
      "interpolate", ["linear"], ["zoom"],
      GRID_MIN_ZOOM, 0,
      GRID_MIN_ZOOM + 0.5, ["interpolate", ["linear"], ["get", "events"], 0, 0.02, 1, 0.03, 10, 0.045, 50, 0.06],
    ],
  },
};
const GRID_LINE_LAYER: LineLayerSpecification = {
  id: "grid-line",
  type: "line",
  source: "grid",
  paint: {
    "line-color": GRID_COLOR,
    "line-opacity": ["interpolate", ["linear"], ["zoom"], GRID_MIN_ZOOM, 0, GRID_MIN_ZOOM + 0.5, 0.25],
    "line-width": 0.75,
  },
};
const SELECTED_LAYER: LineLayerSpecification = {
  id: "selected",
  type: "line",
  source: "selected",
  paint: { "line-color": "#ffffff", "line-width": 2 },
};

// Filled dots for exact locations, hollow rings in the same colour for inherited ones.
// Context dots are a little smaller and drawn beneath events (sortKey).
const DOT_LAYER: CircleLayerSpecification = {
  id: "dots",
  type: "circle",
  source: "dots",
  minzoom: GRID_MIN_ZOOM,
  layout: { visibility: "none", "circle-sort-key": ["get", "sortKey"] },
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

const zeroCounts = () => Object.fromEntries(DOT_GROUPS.map((g) => [g.key, 0])) as Record<GroupKey, number>;

export function GlobeMap({
  styleUrl,
  range,
  showDots,
  selectedCell,
  onSelect,
  onStatus,
}: {
  styleUrl: string;
  range: YearRange;
  showDots: boolean;
  selectedCell: string | null;
  onSelect: (s: Selection) => void;
  onStatus: (s: MapStatus) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const rangeRef = useRef(range);
  const showDotsRef = useRef(showDots);
  const selectedRef = useRef(selectedCell);
  const onSelectRef = useRef(onSelect);
  const onStatusRef = useRef(onStatus);
  // One controller and one last-query per endpoint, so a slow dots answer never cancels the grid.
  const cellsAbortRef = useRef<AbortController | null>(null);
  const dotsAbortRef = useRef<AbortController | null>(null);
  const lastCellsQueryRef = useRef("");
  const lastDotsQueryRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // What the legend shows: the latest answer from each endpoint.
  const resultRef = useRef({ cells: 0, counts: zeroCounts() });

  const report = useCallback((zoomedOut: boolean) => {
    onStatusRef.current({ state: "ready", zoomedOut, counts: resultRef.current.counts, cells: resultRef.current.cells });
  }, []);

  const load = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const v = viewport(map);
    const source = (id: string) => map.getSource(id) as GeoJSONSource | undefined;

    if (v.zoom < GRID_MIN_ZOOM) {
      cellsAbortRef.current?.abort();
      dotsAbortRef.current?.abort();
      lastCellsQueryRef.current = "";
      lastDotsQueryRef.current = "";
      source("grid")?.setData(EMPTY as never);
      source("dots")?.setData(EMPTY as never);
      resultRef.current = { cells: 0, counts: zeroCounts() };
      report(true);
      return;
    }

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
    if (params !== lastCellsQueryRef.current) {
      lastCellsQueryRef.current = params;
      cellsAbortRef.current?.abort();
      const controller = new AbortController();
      cellsAbortRef.current = controller;
      try {
        const res = await fetch(`/api/cells?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CellsResult;
        source("grid")?.setData({
          type: "FeatureCollection",
          features: data.cells.map((c) => cellFeature(c.cell, { cell: c.cell, items: c.items, events: c.events })),
        } as never);
        resultRef.current = { ...resultRef.current, cells: data.cells.length };
        report(false);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          lastCellsQueryRef.current = ""; // let the same view retry
          onStatusRef.current({ state: "error", zoomedOut: false });
        }
      }
    }

    if (!showDotsRef.current) {
      lastDotsQueryRef.current = ""; // when dots come on, the same view must fetch
      return;
    }
    if (params !== lastDotsQueryRef.current) {
      lastDotsQueryRef.current = params;
      dotsAbortRef.current?.abort();
      const controller = new AbortController();
      dotsAbortRef.current = controller;
      try {
        const res = await fetch(`/api/events?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as EventsResult;
        const fc = toFeatureCollection(data.events);
        source("dots")?.setData(fc);
        const counts = zeroCounts();
        for (const f of fc.features) counts[f.properties.group]++;
        resultRef.current = { ...resultRef.current, counts };
        report(false);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          lastDotsQueryRef.current = "";
          onStatusRef.current({ state: "error", zoomedOut: false });
        }
      }
    }
  }, [report]);

  const schedule = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(load, FETCH_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => {
    onStatusRef.current = onStatus;
    onSelectRef.current = onSelect;
  }, [onStatus, onSelect]);

  useEffect(() => {
    rangeRef.current = range;
    schedule();
  }, [range, schedule]);

  useEffect(() => {
    showDotsRef.current = showDots;
    const map = mapRef.current;
    if (map && readyRef.current) {
      map.setLayoutProperty("dots", "visibility", showDots ? "visible" : "none");
      schedule();
    }
  }, [showDots, schedule]);

  useEffect(() => {
    selectedRef.current = selectedCell;
    const map = mapRef.current;
    if (map && readyRef.current) {
      (map.getSource("selected") as GeoJSONSource | undefined)?.setData(selectedGeoJson(selectedCell) as never);
    }
  }, [selectedCell]);

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
        map!.addSource("grid", { type: "geojson", data: EMPTY as never });
        map!.addSource("selected", { type: "geojson", data: selectedGeoJson(selectedRef.current) as never });
        map!.addSource("dots", { type: "geojson", data: EMPTY as never });
        map!.addLayer(GRID_FILL_LAYER);
        map!.addLayer(GRID_LINE_LAYER);
        map!.addLayer(SELECTED_LAYER);
        map!.addLayer({ ...DOT_LAYER, layout: { ...DOT_LAYER.layout, visibility: showDotsRef.current ? "visible" : "none" } });
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
      // A dot (Task 7 adds stacks to this slot) wins over a grid cell; empty ground is only clickable on the grid.
      map.on("click", (e) => {
        const m = map!;
        const zoom = m.getZoom();
        const res = resolutionForZoom(zoom);
        if (res === null) return;
        if (showDotsRef.current) {
          const dot = m.queryRenderedFeatures(e.point, { layers: ["dots"] })[0];
          if (dot && dot.geometry.type === "Point") {
            const [lon, lat] = dot.geometry.coordinates as [number, number];
            const p = dot.properties as DotProperties;
            onSelectRef.current({ kind: "cell", cell: latLngToCell(lat, lon, res), focus: p.qid });
            return;
          }
        }
        const cell = m.queryRenderedFeatures(e.point, { layers: ["grid-fill"] })[0]?.properties?.cell;
        if (typeof cell === "string") {
          onSelectRef.current({ kind: "cell", cell });
          return;
        }
        onSelectRef.current({ kind: "empty", lngLat: [e.lngLat.lng, e.lngLat.lat] });
      });
    })();
    return () => {
      cancelled = true;
      readyRef.current = false;
      clearTimeout(timerRef.current);
      cellsAbortRef.current?.abort();
      dotsAbortRef.current?.abort();
      map?.remove();
      mapRef.current = null;
      lastCellsQueryRef.current = ""; // a new map starts empty, so it must fetch even an identical view
      lastDotsQueryRef.current = "";
    };
  }, [styleUrl, schedule]);

  return <div ref={container} className={styles.map} aria-label="Globe of historical events. Arrow keys pan, plus and minus zoom." />;
}

function selectedGeoJson(cell: string | null): Fc {
  return cell ? { type: "FeatureCollection", features: [cellFeature(cell, {})] } : EMPTY;
}

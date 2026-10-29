"use client";
/**
 * The MapLibre globe, its H3 grid, and its optional dots (overlapping dots merge into stacks, which
 * open a web of their members on hover). Refetches /api/cells (and /api/events when dots are on)
 * when the camera stops moving or the year range changes, debounced, and aborts a stale request so
 * an old answer never overwrites a new one. Below GRID_MIN_ZOOM the globe is plain.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { latLngToCell } from "h3-js";
import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  GeoJSONSource,
  LineLayerSpecification,
  Map as MapLibreMap,
  SymbolLayerSpecification,
} from "maplibre-gl";
import { panToClear } from "../../lib/box.ts";
import { GRID_MIN_ZOOM, cellPolygon, groundSelection, resolutionForZoom, type Res } from "../../lib/cells.ts";
import type { CellsResult } from "../../lib/db/cells.ts";
import type { EventsResult } from "../../lib/db/events.ts";
import { DOT_GROUPS, dotMeta, toFeatureCollection, type DotProperties, type GroupKey } from "../../lib/dots.ts";
import type { YearRange } from "../../lib/time/index.ts";
import { pickLegs, stackCell } from "../../lib/web.ts";
import { DotWeb, WEB_HOLD_RADIUS_PX } from "./DotWeb.tsx";
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
/** MapLibre's default maximum, set explicitly because stacks must stay merged all the way to it. */
const MAP_MAX_ZOOM = 22;
/** Dots closer than this many pixels merge into a stack: about one dot diameter (13 px at zoom 8). */
const STACK_RADIUS_PX = 12;
/** How long the pointer must rest on a stack before its web opens. */
const WEB_HOVER_INTENT_MS = 120;

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
const isStack: Expr = ["has", "point_count"]; // a cluster feature, not a single dot

// Fill shading by events in the cell. With dots hidden the fill can be strong. With dots shown it tops
// out at 0.06: the dataviz validator needs all four dot colours at 3:1 against the composited fill over
// both basemap backgrounds (decisions.md entry 29). Both grid layers fade in between zoom 3 and 3.5.
const FILL_STOPS = {
  plain: [0, 0.03, 1, 0.07, 10, 0.13, 50, 0.2],
  underDots: [0, 0.02, 1, 0.03, 10, 0.045, 50, 0.06],
};
function gridFillOpacity(dotsShown: boolean) {
  return [
    "interpolate", ["linear"], ["zoom"],
    GRID_MIN_ZOOM, 0,
    GRID_MIN_ZOOM + 0.5, ["interpolate", ["linear"], ["get", "events"], ...(dotsShown ? FILL_STOPS.underDots : FILL_STOPS.plain)],
  ] as unknown as Expr;
}
const GRID_FILL_LAYER: FillLayerSpecification = {
  id: "grid-fill",
  type: "fill",
  source: "grid",
  paint: { "fill-color": GRID_COLOR, "fill-opacity": gridFillOpacity(false) },
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
  filter: ["!", isStack] as never,
  layout: { visibility: "none", "circle-sort-key": ["get", "sortKey"] },
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["case", isContext, 3, 4], 8, ["case", isContext, 4.5, 6.5]],
    "circle-color": groupColor,
    "circle-opacity": ["case", ["get", "approx"], 0, 0.95],
    "circle-stroke-color": ["case", ["get", "approx"], groupColor, "#0c0c0c"],
    "circle-stroke-width": ["case", ["get", "approx"], 1.5, 1],
  },
};

// A stack is a near-white disc (the UI's primary text colour), a little larger than a dot, with its
// member count in dark text. Near-white is no group's colour, so it never claims a mixed stack is one
// kind. dataviz validator: contrast 15:1 on both basemaps, Delta E 24 or more from every dot colour
// under normal vision and simulated colour blindness.
const STACK_LAYER: CircleLayerSpecification = {
  id: "stacks",
  type: "circle",
  source: "dots",
  minzoom: GRID_MIN_ZOOM,
  filter: isStack as never,
  layout: { visibility: "none" },
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["step", ["get", "point_count"], 6, 100, 7.5], 8, ["step", ["get", "point_count"], 9, 100, 11]],
    "circle-color": "#f0efec",
    "circle-opacity": 0.95,
    "circle-stroke-color": "#0c0c0c",
    "circle-stroke-width": 1,
  },
};
const STACK_COUNT_LAYER: SymbolLayerSpecification = {
  id: "stack-count",
  type: "symbol",
  source: "dots",
  minzoom: GRID_MIN_ZOOM,
  filter: isStack as never,
  layout: {
    visibility: "none",
    "text-field": ["get", "point_count_abbreviated"],
    "text-font": ["Noto Sans Bold"],
    "text-size": ["interpolate", ["linear"], ["zoom"], 1, 8, 8, 10],
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: { "text-color": "#0c0c0c" },
};
const DOT_LAYER_IDS = ["dots", "stacks", "stack-count"] as const;

/** An open web: the stack it belongs to, where it is, its cell, and which members got legs. */
type Web = {
  clusterId: number;
  center: { x: number; y: number };
  cell: string; // the cell holding most members (stackCell), for the centre and "+N more"
  legs: DotProperties[];
  more: number;
  coords: Record<string, [number, number]>; // leg qid to [lon, lat], for the leg's own cell
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
  meta.textContent = dotMeta(p);
  el.append(title, meta);
  return el;
}

/** A stack's members with their own exact coordinates. Rejects if the cluster is gone (new data or zoom). */
async function stackMembers(map: MapLibreMap, clusterId: number) {
  const source = map.getSource("dots") as GeoJSONSource | undefined;
  if (!source) return [];
  const leaves = await source.getClusterLeaves(clusterId, Infinity, 0);
  return leaves.flatMap((f) => {
    if (f.geometry.type !== "Point") return [];
    const p = f.properties as DotProperties;
    return [{ p, lon: p.lon, lat: p.lat, sitelinks: p.sitelinks }];
  });
}

/** How far left of the area box a selected cell's right edge must sit. */
const SELECTED_CLEARANCE_PX = 24;

const zeroCounts = () => Object.fromEntries(DOT_GROUPS.map((g) => [g.key, 0])) as Record<GroupKey, number>;

export function GlobeMap({
  styleUrl,
  range,
  showDots,
  selectedCell,
  onSelect,
  onStatus,
  occluderLeft,
}: {
  styleUrl: string;
  range: YearRange;
  showDots: boolean;
  selectedCell: string | null;
  onSelect: (s: Selection) => void;
  onStatus: (s: MapStatus) => void;
  /** Viewport x where a panel over the map's right side begins (the area box), or null when none is open. */
  occluderLeft?: () => number | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const rangeRef = useRef(range);
  const showDotsRef = useRef(showDots);
  const selectedRef = useRef(selectedCell);
  const onSelectRef = useRef(onSelect);
  const onStatusRef = useRef(onStatus);
  const occluderLeftRef = useRef(occluderLeft);
  // One controller and one last-query per endpoint, so a slow dots answer never cancels the grid.
  const cellsAbortRef = useRef<AbortController | null>(null);
  const dotsAbortRef = useRef<AbortController | null>(null);
  const lastCellsQueryRef = useRef("");
  const lastDotsQueryRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Whether the grid on screen answers for the current view and range: not while a load is waiting
  // on the debounce or in flight, nor after one failed. Only then is empty ground "nothing documented".
  const loadScheduledRef = useRef(false);
  const cellsStateRef = useRef<"pending" | "ok" | "error">("pending");
  // What the legend shows: the latest answer from each endpoint.
  const resultRef = useRef({ cells: 0, counts: zeroCounts() });
  const dotsReadyRef = useRef(false); // true once the events answer for the current view and toggle is in
  // The hovered stack's web. The ref mirrors the state for handlers registered once.
  const [web, setWeb] = useState<Web | null>(null);
  const webRef = useRef<Web | null>(null);
  // Stack members load asynchronously; a newer hover or a close aborts the old request.
  const webAbortRef = useRef<{ controller: AbortController; clusterId: number } | null>(null);
  // A click on a stack with no web open also loads its members, to find its cell.
  const stackClickAbortRef = useRef<AbortController | null>(null);

  const closeWeb = useCallback(() => {
    webAbortRef.current?.controller.abort();
    webAbortRef.current = null;
    if (webRef.current === null) return;
    webRef.current = null;
    setWeb(null);
  }, []);

  const openWeb = useCallback(async (map: MapLibreMap, clusterId: number, lngLat: [number, number]) => {
    if (webRef.current?.clusterId === clusterId || webAbortRef.current?.clusterId === clusterId) return;
    webAbortRef.current?.controller.abort();
    const controller = new AbortController();
    webAbortRef.current = { controller, clusterId };
    try {
      // Hover intent: a pointer crossing a stack on its way somewhere else does not open a web.
      await new Promise((resolve) => setTimeout(resolve, WEB_HOVER_INTENT_MS));
      if (controller.signal.aborted) return;
      const members = await stackMembers(map, clusterId);
      // Every camera "move" aborts a pending web, but one can start mid-move (scroll-zoom easing,
      // inertia): never pin a web to a position the map is still leaving.
      const res = resolutionForZoom(map.getZoom());
      if (controller.signal.aborted || map.isMoving() || res === null || members.length === 0) return;
      const coords: Web["coords"] = {};
      for (const m of members) coords[m.p.qid] = [m.lon, m.lat];
      const { legs, more } = pickLegs(members.map((m) => m.p));
      const { x, y } = map.project(lngLat);
      webRef.current = { clusterId, center: { x, y }, cell: stackCell(members, res), legs, more, coords };
      setWeb(webRef.current);
    } catch {
      // The cluster vanished (new data or zoom) before its members arrived: leave the web closed.
    } finally {
      if (webAbortRef.current?.controller === controller) webAbortRef.current = null;
    }
  }, []);

  /** A pointer inside the open web's hold circle belongs to the web, not to dots or stacks beneath it. */
  const insideWeb = useCallback((point: { x: number; y: number }) => {
    const w = webRef.current;
    return w !== null && Math.hypot(point.x - w.center.x, point.y - w.center.y) <= WEB_HOLD_RADIUS_PX;
  }, []);

  const selectCell = useCallback(
    (cell: string, focus?: string) => {
      closeWeb();
      onSelectRef.current(focus ? { kind: "cell", cell, focus } : { kind: "cell", cell });
    },
    [closeWeb],
  );

  /** A leg: the cell around the item's own position at the current zoom's resolution, item in focus. */
  const selectLeg = useCallback(
    (at: [number, number] | undefined, qid: string) => {
      const map = mapRef.current;
      const res = map ? resolutionForZoom(map.getZoom()) : null;
      if (at && res !== null) selectCell(latLngToCell(at[1], at[0], res), qid);
    },
    [selectCell],
  );

  /** A stack clicked with no web open: load its members to find its cell, as the web would have. */
  const selectStack = useCallback(
    async (map: MapLibreMap, clusterId: number, centroid: [number, number], res: Res) => {
      stackClickAbortRef.current?.abort();
      const controller = new AbortController();
      stackClickAbortRef.current = controller;
      const fallback = () => latLngToCell(centroid[1], centroid[0], res);
      let cell: string;
      try {
        const members = await stackMembers(map, clusterId);
        if (controller.signal.aborted) return;
        cell = members.length > 0 ? stackCell(members, res) : fallback();
      } catch {
        if (controller.signal.aborted) return;
        cell = fallback(); // the cluster is gone (new data): its position is the best left
      }
      selectCell(cell);
    },
    [selectCell],
  );

  const report = useCallback((zoomedOut: boolean) => {
    // With dots on, say "loading" until their answer arrives, so stale or zero counts never read as "nothing here".
    if (!zoomedOut && showDotsRef.current && !dotsReadyRef.current) {
      onStatusRef.current({ state: "loading", zoomedOut });
      return;
    }
    onStatusRef.current({ state: "ready", zoomedOut, counts: resultRef.current.counts, cells: resultRef.current.cells });
  }, []);

  // A fetch is current until its controller is aborted: a newer fetch to the same endpoint, a zoom-out
  // below the grid, dots toggled off, or unmount all abort it, so a superseded answer is never applied.
  const loadCells = useCallback(
    async (map: MapLibreMap, params: string) => {
      lastCellsQueryRef.current = params;
      cellsStateRef.current = "pending";
      cellsAbortRef.current?.abort();
      const controller = new AbortController();
      cellsAbortRef.current = controller;
      try {
        const res = await fetch(`/api/cells?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CellsResult;
        if (controller.signal.aborted) return;
        (map.getSource("grid") as GeoJSONSource | undefined)?.setData({
          type: "FeatureCollection",
          features: data.cells.map((c) => cellFeature(c.cell, { cell: c.cell, items: c.items, events: c.events })),
        } as never);
        cellsStateRef.current = "ok";
        resultRef.current = { ...resultRef.current, cells: data.cells.length };
        report(false);
      } catch (err) {
        if ((err as Error).name === "AbortError" || controller.signal.aborted) return;
        lastCellsQueryRef.current = ""; // let the same view retry
        cellsStateRef.current = "error";
        onStatusRef.current({ state: "error", zoomedOut: false });
      }
    },
    [report],
  );

  const loadDots = useCallback(
    async (map: MapLibreMap, params: string) => {
      lastDotsQueryRef.current = params;
      dotsReadyRef.current = false;
      dotsAbortRef.current?.abort();
      const controller = new AbortController();
      dotsAbortRef.current = controller;
      try {
        const res = await fetch(`/api/events?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as EventsResult;
        if (controller.signal.aborted) return;
        const fc = toFeatureCollection(data.events);
        closeWeb(); // new data makes new clusters, so an open web would describe a stack that is gone
        (map.getSource("dots") as GeoJSONSource | undefined)?.setData(fc);
        const counts = zeroCounts();
        for (const f of fc.features) counts[f.properties.group]++;
        resultRef.current = { ...resultRef.current, counts };
        dotsReadyRef.current = true;
        report(false);
      } catch (err) {
        if ((err as Error).name === "AbortError" || controller.signal.aborted) return;
        lastDotsQueryRef.current = "";
        onStatusRef.current({ state: "error", zoomedOut: false });
      }
    },
    [report, closeWeb],
  );

  const load = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    loadScheduledRef.current = false;
    const v = viewport(map);
    const source = (id: string) => map.getSource(id) as GeoJSONSource | undefined;

    if (v.zoom < GRID_MIN_ZOOM) {
      cellsAbortRef.current?.abort();
      dotsAbortRef.current?.abort();
      lastCellsQueryRef.current = "";
      lastDotsQueryRef.current = "";
      dotsReadyRef.current = false;
      cellsStateRef.current = "pending"; // the emptied grid answers for no view at or above the grid zoom
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

    // MapLibre fires extra moveend events (after the projection switch, at the end of zoom animations),
    // so a query identical to the last one is skipped.
    const jobs: Promise<void>[] = [];
    if (params !== lastCellsQueryRef.current) jobs.push(loadCells(map, params));
    if (showDotsRef.current && params !== lastDotsQueryRef.current) jobs.push(loadDots(map, params));
    if (jobs.length > 0) report(false); // shows "loading" if dots are now pending
    await Promise.all(jobs);
  }, [report, loadCells, loadDots]);

  const schedule = useCallback(() => {
    clearTimeout(timerRef.current);
    loadScheduledRef.current = true;
    timerRef.current = setTimeout(load, FETCH_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => {
    onStatusRef.current = onStatus;
    onSelectRef.current = onSelect;
    occluderLeftRef.current = occluderLeft;
  }, [onStatus, onSelect, occluderLeft]);

  useEffect(() => {
    rangeRef.current = range;
    schedule();
  }, [range, schedule]);

  useEffect(() => {
    showDotsRef.current = showDots;
    const map = mapRef.current;
    if (map && readyRef.current) {
      for (const id of DOT_LAYER_IDS) map.setLayoutProperty(id, "visibility", showDots ? "visible" : "none");
      map.setPaintProperty("grid-fill", "fill-opacity", gridFillOpacity(showDots));
      if (!showDots) {
        closeWeb();
        // Drop the old dots now, so they never flash on the next toggle-on.
        dotsAbortRef.current?.abort();
        lastDotsQueryRef.current = "";
        dotsReadyRef.current = false;
        resultRef.current = { ...resultRef.current, counts: zeroCounts() };
        (map.getSource("dots") as GeoJSONSource | undefined)?.setData(EMPTY as never);
      }
      report(map.getZoom() < GRID_MIN_ZOOM); // "loading" right away when dots come on, not after the debounce
      schedule();
    }
  }, [showDots, schedule, report, closeWeb]);

  useEffect(() => {
    if (!web) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWeb();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [web, closeWeb]);

  useEffect(() => {
    selectedRef.current = selectedCell;
    const map = mapRef.current;
    if (map && readyRef.current) {
      (map.getSource("selected") as GeoJSONSource | undefined)?.setData(selectedGeoJson(selectedCell) as never);
      // A newly selected cell under the box: pan left just enough that the whole cell (its easternmost
      // corner on screen) clears the box. The centre alone would leave half the outline hidden.
      // The box is already in the DOM here (same commit), so it is measured, not assumed.
      const left = selectedCell ? occluderLeftRef.current?.() : null;
      if (selectedCell && left != null && container.current) {
        const x = Math.max(...cellPolygon(selectedCell).map((c) => map.project(c).x));
        const dx = panToClear(x, left - container.current.getBoundingClientRect().left, SELECTED_CLEARANCE_PX);
        if (dx > 0) {
          const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          map.panBy([dx, 0], { duration: still ? 0 : 300 });
        }
      }
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
      map = new maplibregl.Map({
        container: container.current,
        style: styleUrl,
        center: [20, 30],
        zoom: 1.6,
        maxZoom: MAP_MAX_ZOOM,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: styles.tooltip });

      map.on("style.load", () => {
        map!.setProjection({ type: "globe" });
        map!.addSource("grid", { type: "geojson", data: EMPTY as never });
        map!.addSource("selected", { type: "geojson", data: selectedGeoJson(selectedRef.current) as never });
        // Clustered so overlapping dots become one stack. Clusters are computed per integer zoom up to
        // clusterMaxZoom, so it sits at the map's maximum: points at identical coordinates (every birth
        // in one city) never split into dots drawn on top of each other. MapLibre warns unless the
        // source's maxzoom is above clusterMaxZoom, hence one more.
        map!.addSource("dots", {
          type: "geojson",
          data: EMPTY as never,
          cluster: true,
          clusterRadius: STACK_RADIUS_PX,
          clusterMaxZoom: MAP_MAX_ZOOM,
          maxzoom: MAP_MAX_ZOOM + 1,
        });
        map!.addLayer({ ...GRID_FILL_LAYER, paint: { ...GRID_FILL_LAYER.paint, "fill-opacity": gridFillOpacity(showDotsRef.current) } });
        map!.addLayer(GRID_LINE_LAYER);
        map!.addLayer(SELECTED_LAYER);
        const visibility = showDotsRef.current ? "visible" : "none";
        map!.addLayer({ ...DOT_LAYER, layout: { ...DOT_LAYER.layout, visibility } });
        map!.addLayer({ ...STACK_LAYER, layout: { ...STACK_LAYER.layout, visibility } });
        map!.addLayer({ ...STACK_COUNT_LAYER, layout: { ...STACK_COUNT_LAYER.layout, visibility } });
        readyRef.current = true;
        schedule();
      });
      map.on("moveend", schedule);
      map.on("move", closeWeb); // every frame, so no web is left behind or opened by a moving camera
      map.on("mousemove", "dots", (e) => {
        const f = e.features?.[0];
        if (!f || f.geometry.type !== "Point") return;
        if (insideWeb(e.point)) {
          // A dot dimmed beneath the web's lines is not reachable until the web closes.
          map!.getCanvas().style.cursor = "";
          popup.remove();
          return;
        }
        map!.getCanvas().style.cursor = "pointer";
        popup.setLngLat(f.geometry.coordinates as [number, number]).setDOMContent(tooltip(f.properties as DotProperties)).addTo(map!);
      });
      map.on("mouseleave", "dots", () => {
        map!.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("mousemove", "stacks", (e) => {
        const f = e.features?.[0];
        if (!f || f.geometry.type !== "Point") return;
        map!.getCanvas().style.cursor = "pointer";
        const clusterId = f.properties?.cluster_id;
        // A neighbouring stack under the open web's lines must not steal it on the way to a leg.
        if (typeof clusterId !== "number" || (webRef.current?.clusterId !== clusterId && insideWeb(e.point))) return;
        void openWeb(map!, clusterId, f.geometry.coordinates as [number, number]);
      });
      map.on("mouseleave", "stacks", () => {
        map!.getCanvas().style.cursor = "";
        // Cancel a web still waiting on hover intent or its members; an open web stays open.
        webAbortRef.current?.controller.abort();
        webAbortRef.current = null;
      });
      // A dot, then a stack, wins over a grid cell; empty ground is only clickable on the grid.
      // Empty ground reads "nothing documented" only against a current grid (groundSelection).
      map.on("click", (e) => {
        const m = map!;
        const zoom = m.getZoom();
        const res = resolutionForZoom(zoom);
        if (res === null) return;
        // Inside an open web only its centre is clickable (legs are buttons above the map); a click
        // anywhere else in its dimmed circle just closes it.
        if (insideWeb(e.point)) {
          const own = m.queryRenderedFeatures(e.point, { layers: ["stacks"] })[0];
          const w = webRef.current;
          if (w && own?.properties?.cluster_id === w.clusterId) selectCell(w.cell);
          else closeWeb();
          return;
        }
        if (showDotsRef.current) {
          // Topmost first: stacks draw above dots. A dot focuses its item; a stack selects the cell
          // holding most of its members, with no item in focus.
          const hit = m.queryRenderedFeatures(e.point, { layers: ["stacks", "dots"] })[0];
          if (hit && hit.geometry.type === "Point") {
            if (hit.layer.id === "stacks") {
              void selectStack(m, hit.properties?.cluster_id as number, hit.geometry.coordinates as [number, number], res);
            } else {
              // The dot's own exact position, not its rendered (tile-rounded) geometry.
              const p = hit.properties as DotProperties;
              onSelectRef.current({ kind: "cell", cell: latLngToCell(p.lat, p.lon, res), focus: p.qid });
            }
            return;
          }
        }
        const cell = m.queryRenderedFeatures(e.point, { layers: ["grid-fill"] })[0]?.properties?.cell;
        const gridCurrent = !loadScheduledRef.current && cellsStateRef.current === "ok";
        onSelectRef.current(groundSelection(typeof cell === "string" ? cell : undefined, gridCurrent, e.lngLat.lng, e.lngLat.lat, res));
      });
    })();
    return () => {
      cancelled = true;
      readyRef.current = false;
      clearTimeout(timerRef.current);
      cellsAbortRef.current?.abort();
      dotsAbortRef.current?.abort();
      stackClickAbortRef.current?.abort();
      closeWeb();
      map?.remove();
      mapRef.current = null;
      lastCellsQueryRef.current = ""; // a new map starts empty, so it must fetch even an identical view
      lastDotsQueryRef.current = "";
      dotsReadyRef.current = false;
      loadScheduledRef.current = false;
      cellsStateRef.current = "pending";
    };
  }, [styleUrl, schedule, closeWeb, openWeb, insideWeb, selectCell, selectStack]);

  return (
    <>
      <div ref={container} className={styles.map} aria-label="Globe of historical events. Arrow keys pan, plus and minus zoom." />
      {web && (
        <DotWeb
          key={web.clusterId}
          center={web.center}
          legs={web.legs}
          more={web.more}
          onPick={(qid) => selectLeg(web.coords[qid], qid)}
          onMore={() => selectCell(web.cell)}
          onLeave={closeWeb}
        />
      )}
    </>
  );
}

function selectedGeoJson(cell: string | null): Fc {
  return cell ? { type: "FeatureCollection", features: [cellFeature(cell, {})] } : EMPTY;
}

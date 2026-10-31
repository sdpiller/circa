"use client";
/**
 * The MapLibre globe, recoloured cream. Nothing is drawn on it until a click: then the camera makes room for
 * the panel, flies to the answer's bounds, and the outline fades in once it has arrived.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapLibreEvent } from "maplibre-gl";
import type { Position } from "../../lib/geo/geometry.ts";
import { apparentZoom, FADE_MS, LABEL_GROUPS, labelGroupOn } from "../../lib/labels.ts";
import type { MapOutline } from "../../lib/selection.ts";
import styles from "./globe.module.css";

/** Map paint values, matching the palette in globals.css and spec 3.2. */
const LAND = "#f8f4ea";
const WATER = "#e3ded2";
const LINE = "#cfc8ba";
const ROAD = "#e6e0d3";
const INK = "#241f1a";
const MUTED = "#7f786e";
const ACCENT = "#5140a4";

const COUNTRY_LABELS = ["label_country_1", "label_country_2", "label_country_3"];

/** Motion and framing, spec 3.4. The panel's CSS slide uses the same time and about the same curve. */
const SLIDE_MS = 460;
const FLY_MS = 1500;
const OUTLINE_FADE_MS = 500;
const RANGE_H = 184;
const MIN_FLY_ZOOM = 1.9;
const MAX_FLY_ZOOM = 6.2;
const OFF_GLOBE_PX = 4;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** The same value as --panel-width in globe.module.css. */
const panelWidth = () => Math.min(420, window.innerWidth * 0.36);

const EMPTY = { type: "FeatureCollection" as const, features: [] };

function setOutlineOpacity(m: MapLibreMap, shown: boolean) {
  m.setPaintProperty("sel-fill", "fill-opacity", shown ? 0.1 : 0);
  m.setPaintProperty("sel-case", "line-opacity", shown ? 0.9 : 0);
  m.setPaintProperty("sel-line", "line-opacity", shown ? 1 : 0);
}

function drawOutline(m: MapLibreMap, o: MapOutline) {
  m.getSource<GeoJSONSource>("sel-fill")?.setData(o.fill);
  m.getSource<GeoJSONSource>("sel-lines")?.setData(o.lines);
  setOutlineOpacity(m, true);
}

/** `flight` comes back on this flight's own moveend, even an interrupted one. Padding, not offset: it stays on the camera. */
function flyToOutline(m: MapLibreMap, o: MapOutline, flight: number) {
  const [west, south, east, north] = o.bounds;
  const right = panelWidth();
  const fit = m.cameraForBounds([[west, south], [east, north]], { padding: { top: 45, left: 60, right: right + 60, bottom: RANGE_H + 45 } });
  const zoom = Math.max(MIN_FLY_ZOOM, Math.min(MAX_FLY_ZOOM, fit?.zoom ?? MIN_FLY_ZOOM));
  m.flyTo(
    {
      center: [(west + east) / 2, (south + north) / 2],
      zoom,
      padding: { top: 0, left: 0, right, bottom: RANGE_H },
      duration: still() ? 0 : FLY_MS,
      curve: 1.35,
      essential: true,
    },
    { flight },
  );
}

export function GlobeMap({
  styleUrl,
  outline,
  panelOpen,
  onClick,
}: {
  styleUrl: string;
  outline: MapOutline | null;
  panelOpen: boolean;
  onClick: (point: Position) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<MapLibreMap | null>(null); // the map, once the style and our layers exist
  const drawnKey = useRef<string | null>(null);
  const flights = useRef(0);
  // An outline waiting for its flight's moveend. A newer selection replaces or clears it, which cancels the wait.
  const waiting = useRef<{ flight: number; outline: MapOutline } | null>(null);
  const padded = useRef(false);

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

        // The outline, on top of everything. The fill and the lines are separate because the lines leave out the
        // edges at 180 degrees. No antialiasing on the fill: it would draw those edges as a faint seam.
        const reveal = { duration: still() ? 0 : OUTLINE_FADE_MS, delay: 0 };
        const round = { "line-join": "round", "line-cap": "round" } as const;
        m.addSource("sel-fill", { type: "geojson", data: EMPTY });
        m.addSource("sel-lines", { type: "geojson", data: EMPTY });
        m.addLayer({ id: "sel-fill", type: "fill", source: "sel-fill", paint: { "fill-color": ACCENT, "fill-opacity": 0, "fill-opacity-transition": reveal, "fill-antialias": false } });
        m.addLayer({ id: "sel-case", type: "line", source: "sel-lines", layout: round, paint: { "line-color": LAND, "line-width": 6.5, "line-opacity": 0, "line-opacity-transition": reveal } });
        m.addLayer({ id: "sel-line", type: "line", source: "sel-lines", layout: round, paint: { "line-color": ACCENT, "line-width": 3, "line-opacity": 0, "line-opacity-transition": reveal } });

        el.classList.add(styles.ready);
        setReady(m);
      });
      m.on("move", syncLabels);
      m.on("moveend", (e: MapLibreEvent & { flight?: number }) => {
        if (e.flight === undefined || waiting.current?.flight !== e.flight) return;
        drawOutline(m, waiting.current.outline);
        waiting.current = null;
      });
      m.on("click", (e) => {
        // Off the globe, MapLibre answers with the nearest point on the horizon. That is not a click on it.
        if (e.point.dist(m.project(e.lngLat)) > OFF_GLOBE_PX) return;
        const { lng, lat } = e.lngLat.wrap(); // the API rejects a longitude outside -180 to 180
        onClick([lng, lat]);
      });
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      setReady(null);
      map?.remove();
    };
  }, [styleUrl, onClick]);

  // Before the padding effect: a close must cancel the wait before its ease ends the flight.
  useEffect(() => {
    if (!ready) return;
    const key = outline?.key ?? null;
    if (drawnKey.current === key) return;
    drawnKey.current = key;
    if (!outline) {
      waiting.current = null;
      setOutlineOpacity(ready, false);
    } else if (outline.fly) {
      setOutlineOpacity(ready, false);
      waiting.current = { flight: ++flights.current, outline };
      flyToOutline(ready, outline, flights.current);
    } else if (waiting.current) {
      waiting.current.outline = outline; // a range answer during the flight: draw the newest on arrival
    } else {
      drawOutline(ready, outline);
    }
  }, [ready, outline]);

  useEffect(() => {
    if (!ready || padded.current === panelOpen) return;
    padded.current = panelOpen;
    ready.easeTo({
      padding: panelOpen ? { right: panelWidth() } : { top: 0, right: 0, bottom: 0, left: 0 },
      duration: still() ? 0 : SLIDE_MS,
      easing: easeOut,
    });
  }, [ready, panelOpen]);

  return <div ref={container} className={styles.map} aria-label="Globe of history. Arrow keys pan, plus and minus zoom." />;
}

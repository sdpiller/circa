"use client";
/**
 * The MapLibre globe, recoloured cream. Nothing is drawn on it until a click: then the camera makes room for
 * the panel, flies to the answer's bounds, and the outline fades in once it has arrived.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapLibreEvent, MapMouseEvent } from "maplibre-gl";
import { frameOutline } from "../../lib/camera.ts";
import type { Position } from "../../lib/geo/geometry.ts";
import { apparentZoom, FADE_MS, LABEL_GROUPS, labelGroupOn } from "../../lib/labels.ts";
import { outlineUrl } from "../../lib/box.ts";
import type { HoverOutline } from "../../lib/db/area.ts";
import { HoverCache } from "../../lib/hover.ts";
import { insetsFor } from "../../lib/layout.ts";
import type { MapOutline } from "../../lib/selection.ts";
import type { YearRange } from "../../lib/time/index.ts";
import { ACCENT, LAND, paintCream } from "./cream.ts";
import { easeOut, still } from "./motion.ts";
import styles from "./globe.module.css";

/** Motion and framing, spec 3.4. The panel's CSS slide uses the same time and about the same curve. */
const SLIDE_MS = 460;
const FLY_MS = 1500;
const OUTLINE_FADE_MS = 500;
const OFF_GLOBE_PX = 4;
/** At most one hover request in this time, which bounds a sweep over water or along a coast, where no answer is reused. */
const ASK_GAP_MS = 40;
const HOVER_FADE_MS = 150;

const EMPTY = { type: "FeatureCollection" as const, features: [] };

type Pixel = MapMouseEvent["point"];

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

/** The preview under the mouse, and the pointer that says a click here selects something. Off, MapLibre's grab cursor is back. */
function drawHover(m: MapLibreMap, h: HoverOutline | null) {
  if (h) {
    m.getSource<GeoJSONSource>("hover-fill")?.setData(h.fill);
    m.getSource<GeoJSONSource>("hover-lines")?.setData(h.lines);
  }
  m.setPaintProperty("hover-fill", "fill-opacity", h ? 0.05 : 0);
  m.setPaintProperty("hover-line", "line-opacity", h ? 0.7 : 0);
  m.getCanvas().style.cursor = h ? "pointer" : "";
}

/** `flight` comes back on this flight's own moveend, even an interrupted one. Padding, not offset: it stays on the camera. */
function flyToOutline(m: MapLibreMap, o: MapOutline, flight: number, narrow: boolean) {
  const box = m.getContainer();
  const insets = insetsFor(narrow, box.clientWidth, box.clientHeight);
  m.flyTo(
    {
      ...frameOutline(o.bounds, { width: box.clientWidth, height: box.clientHeight, insets }),
      padding: { ...insets, left: 0 },
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
  range,
  panelOpen,
  narrow,
  onClick,
}: {
  styleUrl: string;
  outline: MapOutline | null;
  /** The years the hover preview asks about. */
  range: YearRange;
  panelOpen: boolean;
  /** The phone layout: the panel is a sheet along the bottom, not a column on the right. */
  narrow: boolean;
  onClick: (point: Position) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<MapLibreMap | null>(null); // the map, once the style and our layers exist
  const [failed, setFailed] = useState(false); // the style never loaded, so there is no globe to wait for
  const drawnKey = useRef<string | null>(null);
  const flights = useRef(0);
  // An outline waiting for its flight's moveend. A newer selection replaces or clears it, which cancels the wait.
  const waiting = useRef<{ flight: number; outline: MapOutline } | null>(null);
  const padded = useRef(false);
  const rangeNow = useRef(range);
  const hoverAgain = useRef(() => {}); // asks the preview again for wherever the mouse is
  const narrowNow = useRef(narrow);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let gap: ReturnType<typeof setTimeout> | undefined;
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
        // North stays up: frameOutline assumes it, and spec 3.1 lists no rotate control.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      m.keyboard.disableRotation();
      m.touchZoomRotate.disableRotation();
      map = m;
      const el = container.current;
      const fade = still() ? 0 : FADE_MS;
      let layered = false; // our sources and layers exist
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

      // Only a failure before the style has loaded leaves the page without a globe. A later tile error is MapLibre's to retry.
      let styled = false;
      m.on("error", () => {
        if (!styled && !cancelled) setFailed(true);
      });

      m.on("style.load", () => {
        styled = true;
        m.setProjection({ type: "globe" });
        paintCream(m);

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
        // The hover preview goes first, so over the selected region the selection's own line covers it.
        const quick = { duration: still() ? 0 : HOVER_FADE_MS, delay: 0 };
        m.addSource("hover-fill", { type: "geojson", data: EMPTY });
        m.addSource("hover-lines", { type: "geojson", data: EMPTY });
        m.addLayer({ id: "hover-fill", type: "fill", source: "hover-fill", paint: { "fill-color": ACCENT, "fill-opacity": 0, "fill-opacity-transition": quick, "fill-antialias": false } });
        m.addLayer({ id: "hover-line", type: "line", source: "hover-lines", layout: round, paint: { "line-color": ACCENT, "line-width": 1.5, "line-opacity": 0, "line-opacity-transition": quick } });
        m.addSource("sel-fill", { type: "geojson", data: EMPTY });
        m.addSource("sel-lines", { type: "geojson", data: EMPTY });
        m.addLayer({ id: "sel-fill", type: "fill", source: "sel-fill", paint: { "fill-color": ACCENT, "fill-opacity": 0, "fill-opacity-transition": reveal, "fill-antialias": false } });
        m.addLayer({ id: "sel-case", type: "line", source: "sel-lines", layout: round, paint: { "line-color": LAND, "line-width": 6.5, "line-opacity": 0, "line-opacity-transition": reveal } });
        m.addLayer({ id: "sel-line", type: "line", source: "sel-lines", layout: round, paint: { "line-color": ACCENT, "line-width": 3, "line-opacity": 0, "line-opacity-transition": reveal } });

        layered = true;
        el.classList.add(styles.ready);
        setReady(m);
      });
      m.on("move", syncLabels);
      // Off the globe, MapLibre answers with the nearest point on the horizon. That is not a point on it.
      const onGlobe = (px: Pixel): Position | null => {
        const at = m.unproject(px);
        if (px.dist(m.project(at)) > OFF_GLOBE_PX) return null;
        const { lng, lat } = at.wrap(); // the API rejects a longitude outside -180 to 180
        return [lng, lat];
      };
      m.on("click", (e) => {
        const p = onGlobe(e.point);
        if (p) onClick(p);
      });

      // The hover preview (decisions.md entry 33). An answer holds for its whole province, so the cache answers
      // most moves at once. A miss asks the server, one request at a time, and the newest mouse position wins.
      const cache = new HoverCache();
      let mouse: Pixel | null = null; // where the mouse is over the map
      let shown: HoverOutline | null = null;
      let asking = false;
      let lastAsk = 0;
      const show = (h: HoverOutline | null) => {
        if (h === shown) return;
        shown = h;
        drawHover(m, h);
      };
      const update = () => {
        clearTimeout(gap);
        if (cancelled || !layered || !mouse || m.isMoving()) return; // a drag, a zoom or a flight: no preview until it ends
        const p = onGlobe(mouse);
        if (!p) return show(null);
        const hit = cache.find(rangeNow.current, p);
        if (hit) return show(hit);
        if (asking) return; // the answer in flight calls update again, for wherever the mouse is then
        const wait = lastAsk + ASK_GAP_MS - performance.now();
        if (wait > 0) gap = setTimeout(update, wait);
        else void ask(p, mouse);
      };
      // Until the answer comes the last preview stays up, so crossing a border does not blink.
      const ask = async (p: Position, at: Pixel) => {
        asking = true;
        lastAsk = performance.now();
        const asked = rangeNow.current;
        let answer: HoverOutline | null | undefined; // undefined: the request failed
        try {
          const res = await fetch(outlineUrl({ lon: p[0], lat: p[1], from: asked.from, to: asked.to }));
          if (res.ok) answer = ((await res.json()) as { outline: HoverOutline | null }).outline;
        } catch {
          // the network failed: nothing changes until the mouse moves
        }
        asking = false;
        if (cancelled) return;
        const current = asked.from === rangeNow.current.from && asked.to === rangeNow.current.to;
        if (answer && current) cache.add(asked, answer);
        if (!mouse || m.isMoving()) return; // the mouse left, or the camera moved: those already cleared the preview
        // The newest answer is drawn even if the mouse has moved on since: one request behind beats nothing until it stops.
        if (current && answer !== undefined) show(answer);
        if (mouse !== at || !current) update();
      };
      hoverAgain.current = update;
      m.on("mousemove", (e) => {
        mouse = e.point;
        update();
      });
      m.on("mouseout", () => {
        mouse = null;
        clearTimeout(gap);
        show(null);
      });
      m.on("movestart", () => show(null));
      m.on("moveend", (e: MapLibreEvent & { flight?: number }) => {
        update(); // the globe turned under a still mouse: preview what is under it now
        if (e.flight === undefined || waiting.current?.flight !== e.flight) return;
        drawOutline(m, waiting.current.outline);
        waiting.current = null;
      });
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      clearTimeout(gap);
      hoverAgain.current = () => {};
      setReady(null);
      setFailed(false);
      map?.remove();
    };
  }, [styleUrl, onClick]);

  useEffect(() => {
    narrowNow.current = narrow;
  }, [narrow]);

  useEffect(() => {
    rangeNow.current = range;
    hoverAgain.current();
  }, [range]);

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
      flyToOutline(ready, outline, flights.current, narrowNow.current);
    } else if (waiting.current) {
      waiting.current.outline = outline; // a range answer during the flight: draw the newest on arrival
    } else {
      drawOutline(ready, outline);
    }
  }, [ready, outline]);

  useEffect(() => {
    if (!ready || padded.current === panelOpen) return;
    padded.current = panelOpen;
    // Wide: room on the right only, as before phones were laid out. Narrow: the masthead and the half sheet.
    const box = ready.getContainer();
    const insets = insetsFor(narrowNow.current, box.clientWidth, box.clientHeight);
    ready.easeTo({
      padding: !panelOpen ? { top: 0, right: 0, bottom: 0, left: 0 } : narrowNow.current ? { top: insets.top, bottom: insets.bottom } : { right: insets.right },
      duration: still() ? 0 : SLIDE_MS,
      easing: easeOut,
    });
  }, [ready, panelOpen]);

  return (
    <>
      <div ref={container} className={styles.map} aria-label="Globe of history. Arrow keys pan, plus and minus zoom." />
      {failed && (
        <p className={styles.mapError} role="status">
          The map could not load.
        </p>
      )}
    </>
  );
}

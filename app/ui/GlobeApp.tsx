"use client";
import { useCallback, useEffect, useReducer } from "react";
import type { AreaAnswer } from "../../lib/db/area.ts";
import type { Position } from "../../lib/geo/geometry.ts";
import { areaReducer, initialArea, outlineOf, requestUrl } from "../../lib/selection.ts";
import type { YearRange } from "../../lib/time/index.ts";
import { AreaPanel } from "./AreaPanel.tsx";
import { GlobeMap } from "./GlobeMap.tsx";
import { RangeControl } from "./RangeControl.tsx";
import styles from "./globe.module.css";

// Dragging the range slider changes the range on every step: wait for a pause before asking.
const FETCH_DEBOUNCE_MS = 120;

export function GlobeApp({ styleUrl }: { styleUrl: string }) {
  const [area, dispatch] = useReducer(areaReducer, initialArea);
  const url = requestUrl(area);
  const answeredUrl = area.answer?.url;
  const panelOpen = area.point !== null;

  useEffect(() => {
    if (!url || url === answeredUrl) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let body: AreaAnswer | null = null;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) body = (await res.json()) as AreaAnswer;
      } catch {
        // aborted, or the network failed: handled below
      }
      if (!controller.signal.aborted) dispatch({ type: "answered", url, body });
    }, FETCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, answeredUrl]);

  const onClick = useCallback((point: Position) => dispatch({ type: "click", point }), []);
  const onRange = useCallback((range: YearRange) => dispatch({ type: "drag", range }), []);

  return (
    <main className={`${styles.app} ${panelOpen ? styles.appPanelOpen : ""}`}>
      <GlobeMap styleUrl={styleUrl} outline={outlineOf(area)} panelOpen={panelOpen} onClick={onClick} />

      <h1 className={styles.wordmark}>Chronoglobe</h1>

      <section className={styles.rangePanel} aria-label="Year range">
        <RangeControl range={area.range} onChange={onRange} />
        <p className={styles.caption}>Documented history is not the same as history: coverage is uneven worldwide.</p>
      </section>

      <details className={styles.sources}>
        <summary>Sources</summary>
        <ul>
          <li>
            Historical outlines: <a href="https://github.com/Seshat-Global-History-Databank/cliopatria">Cliopatria</a> (
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>), shapes processed; and{" "}
            <a href="https://github.com/aourednik/historical-basemaps">historical-basemaps</a> (GPL-3.0).
          </li>
          <li>
            Modern boundaries: <a href="https://www.naturalearthdata.com">Natural Earth</a> (public domain).
          </li>
          <li>
            Events: <a href="https://www.wikidata.org">Wikidata</a> (CC0). Text and pictures: <a href="https://en.wikipedia.org">Wikipedia</a> (CC BY-SA 4.0).
          </li>
          <li>
            Basemap: <a href="https://openfreemap.org">OpenFreeMap</a>, <a href="https://openmaptiles.org">© OpenMapTiles</a>, data{" "}
            <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> contributors.
          </li>
        </ul>
      </details>

      <AreaPanel area={area} dispatch={dispatch} />
    </main>
  );
}

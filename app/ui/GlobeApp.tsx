"use client";
import { useCallback, useEffect, useReducer, useState } from "react";
import { BASE_PATH, OUTLINES_FILE } from "../../lib/base.ts";
import type { AreaAnswer } from "../../lib/db/area.ts";
import type { Position } from "../../lib/geo/geometry.ts";
import type { PublishedStory } from "../../lib/narrative/publish.ts";
import { areaReducer, initialArea, outlineOf, requestUrl } from "../../lib/selection.ts";
import type { YearRange } from "../../lib/time/index.ts";
import { AreaPanel } from "./AreaPanel.tsx";
import { GlobeMap } from "./GlobeMap.tsx";
import { RangeControl } from "./RangeControl.tsx";
import { StoriesList } from "./StoriesList.tsx";
import styles from "./globe.module.css";
import { useNarrow } from "./useNarrow.ts";

// Dragging the range slider changes the range on every step: wait for a pause before asking.
const FETCH_DEBOUNCE_MS = 120;

const CAPTION = "Documented history is not the same as history: coverage is uneven worldwide.";

export function GlobeApp({ styleUrl }: { styleUrl: string }) {
  const [area, dispatch] = useReducer(areaReducer, initialArea);
  const [panelFocus, setPanelFocus] = useState(0); // raised to hand the panel keyboard focus
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
  const onChoose = useCallback((story: PublishedStory) => {
    dispatch({ type: "choose", point: story.point, range: { from: story.entry.from, to: story.entry.to } });
    setPanelFocus((n) => n + 1);
  }, []);

  // On a phone the panel is a bottom sheet. Expanded to full height for the point it was expanded at only, so a
  // new area, or the same one opened again, starts at half height.
  const narrow = useNarrow();
  const [fullAt, setFullAt] = useState<Position | null>(null);
  if (!panelOpen && fullAt !== null) setFullAt(null); // a story's point is the same object each time it is chosen
  const full = fullAt !== null && fullAt === area.point;
  const setFull = useCallback((f: boolean) => setFullAt(f ? area.point : null), [area.point]);
  const rangeInSheet = narrow && panelOpen;
  const range = <RangeControl range={area.range} onChange={onRange} />;

  return (
    <main className={`${styles.app} ${panelOpen ? styles.appPanelOpen : ""}`}>
      <GlobeMap styleUrl={styleUrl} outline={outlineOf(area)} range={area.range} panelOpen={panelOpen} narrow={narrow} onClick={onClick} />

      <header className={styles.masthead}>
        <h1 className={styles.wordmark}>Circa</h1>
        <StoriesList onChoose={onChoose} />
      </header>

      {!rangeInSheet && (
        <section className={styles.rangePanel} aria-label="Year range">
          {range}
          <p className={styles.caption}>{CAPTION}</p>
        </section>
      )}

      <details className={styles.sources}>
        <summary>Sources</summary>
        <ul>
          <li>
            Historical outlines: <a href="https://github.com/Seshat-Global-History-Databank/cliopatria">Cliopatria</a> (
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>), shapes processed; and{" "}
            <a href="https://github.com/aourednik/historical-basemaps">historical-basemaps</a> (GPL-3.0). The outlines as processed here:{" "}
            <a href={`${BASE_PATH}/open-data/${OUTLINES_FILE}`}>download</a> (GPL-3.0, <a href={`${BASE_PATH}/open-data/README.txt`}>about the file</a>).
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

      <AreaPanel
        area={area}
        dispatch={dispatch}
        focusRequest={panelFocus}
        sheet={narrow ? { full, setFull, range: rangeInSheet ? range : null, caption: CAPTION } : null}
      />
    </main>
  );
}

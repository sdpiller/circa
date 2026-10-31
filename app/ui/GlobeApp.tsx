"use client";
import { useState } from "react";
import { MAX_YEAR, MIN_YEAR, type YearRange } from "../../lib/time/index.ts";
import { GlobeMap } from "./GlobeMap.tsx";
import { RangeControl } from "./RangeControl.tsx";
import styles from "./globe.module.css";

export function GlobeApp({ styleUrl }: { styleUrl: string }) {
  const [range, setRange] = useState<YearRange>({ from: MIN_YEAR, to: MAX_YEAR });

  return (
    <main className={styles.app}>
      <GlobeMap styleUrl={styleUrl} />

      <h1 className={styles.wordmark}>Chronoglobe</h1>

      <section className={styles.rangePanel} aria-label="Year range">
        <RangeControl range={range} onChange={setRange} />
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
    </main>
  );
}

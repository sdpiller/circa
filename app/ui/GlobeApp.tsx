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

      <aside className={`${styles.panel} ${styles.legendPanel}`}>
        <h1 className={styles.title}>Chronoglobe</h1>
        <p className={styles.caption}>Documented history is not the same as history: coverage is uneven worldwide.</p>
      </aside>

      <section className={`${styles.panel} ${styles.rangePanel}`} aria-label="Year range">
        <RangeControl range={range} onChange={setRange} />
      </section>

      <footer className={styles.footer}>
        Event data: <a href="https://www.wikidata.org">Wikidata</a> (CC0). Basemap: <a href="https://openfreemap.org">OpenFreeMap</a>,{" "}
        <a href="https://openmaptiles.org">© OpenMapTiles</a>, data <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> contributors.
        Text and pictures: <a href="https://en.wikipedia.org">Wikipedia</a> (CC BY-SA 4.0).
      </footer>
    </main>
  );
}

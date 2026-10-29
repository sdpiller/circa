"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DOT_GROUPS } from "../../lib/dots.ts";
import { formatRange, MAX_YEAR, MIN_YEAR, type YearRange } from "../../lib/time/index.ts";
import { AreaBox } from "./AreaBox.tsx";
import { GlobeMap, type MapStatus, type Selection } from "./GlobeMap.tsx";
import { RangeControl } from "./RangeControl.tsx";
import styles from "./globe.module.css";

function Legend({ status, showDots, onShowDots }: { status: MapStatus; showDots: boolean; onShowDots: (v: boolean) => void }) {
  const counts = status.state === "ready" ? status.counts : null;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const dotsVisible = showDots && !status.zoomedOut;
  return (
    <>
      <label className={styles.toggle}>
        <input type="checkbox" checked={showDots} onChange={(e) => onShowDots(e.target.checked)} />
        Show dots
      </label>
      {dotsVisible && (
        <ul className={styles.legend}>
          {DOT_GROUPS.map((g) => (
            <li key={g.key}>
              <span className={styles.swatch} style={{ background: g.color }} />
              <span>{g.label}</span>
              <span className={styles.count}>{counts ? counts[g.key] : ""}</span>
            </li>
          ))}
          <li>
            <span className={`${styles.swatch} ${styles.hollow}`} />
            <span>Approximate location</span>
          </li>
        </ul>
      )}
      <p className={styles.status} role="status">
        {status.state === "error"
          ? "Could not load events. Is the database built?"
          : status.zoomedOut
            ? "Zoom in to explore"
            : status.state === "loading"
              ? "Loading"
              : dotsVisible
                ? total === 0
                  ? "Nothing documented in view for these years."
                  : `The ${total} most notable in view`
                : status.cells === 0
                  ? "Nothing documented in view for these years."
                  : `${status.cells} areas with documented history in view`}
      </p>
    </>
  );
}

/** A click on ground with no cell drawn: one plain line where the box would be. */
function NothingHere({ range, onClose }: { range: YearRange; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <section className={`${styles.panel} ${styles.box} ${styles.nothing}`} aria-label="Area">
      <p role="status">Nothing documented here for {formatRange(range.from, range.to)}</p>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
        ×
      </button>
    </section>
  );
}

export function GlobeApp({ styleUrl }: { styleUrl: string }) {
  const [range, setRange] = useState<YearRange>({ from: MIN_YEAR, to: MAX_YEAR });
  const [status, setStatus] = useState<MapStatus>({ state: "loading", zoomedOut: true });
  const [showDots, setShowDots] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectionRef = useRef<HTMLDivElement>(null);

  // Closing removes the focused close button: hand keyboard focus back to the map, not the page body.
  const close = useCallback(() => {
    if (selectionRef.current?.contains(document.activeElement)) {
      document.querySelector<HTMLElement>(".maplibregl-canvas")?.focus({ preventScroll: true });
    }
    setSelection(null);
  }, []);

  return (
    <main className={styles.app}>
      <GlobeMap styleUrl={styleUrl} range={range}
        showDots={showDots}
        selectedCell={selection?.kind === "cell" ? selection.cell : null}
        onSelect={setSelection}
        onStatus={setStatus}
      />

      <div ref={selectionRef} className={styles.slot}>
        {selection?.kind === "cell" && <AreaBox key={selection.cell} cell={selection.cell} focus={selection.focus} range={range} onClose={close} />}
        {selection?.kind === "empty" && <NothingHere range={range} onClose={close} />}
      </div>

      <aside className={`${styles.panel} ${styles.legendPanel}`}>
        <h1 className={styles.title}>Chronoglobe</h1>
        <Legend status={status} showDots={showDots} onShowDots={setShowDots} />
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

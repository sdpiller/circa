"use client";
/**
 * Two-handle year range on a non-linear scale (lib/time sliderToYear), plus preset chips.
 * Two native range inputs, so keyboard and screen-reader support come from the browser.
 */
import { formatRange, formatYear, MAX_YEAR, MIN_YEAR, SLIDER_STEPS, sliderToYear, yearToSlider, type YearRange } from "../../lib/time/index.ts";
import styles from "./globe.module.css";

const PRESETS: (YearRange & { label: string })[] = [
  { label: "All time", from: MIN_YEAR, to: MAX_YEAR },
  { label: "Classical Greece", from: -500, to: -300 },
  { label: "Roman Empire", from: -27, to: 476 },
  { label: "Middle Ages", from: 500, to: 1500 },
  { label: "Early modern", from: 1500, to: 1800 },
  { label: "Long 19th century", from: 1789, to: 1914 },
  { label: "20th century", from: 1901, to: 2000 },
];

const TICKS = [MIN_YEAR, -1000, 1, 1000, 1700, MAX_YEAR];

const pct = (year: number) => `${(yearToSlider(year) / SLIDER_STEPS) * 100}%`;

export function RangeControl({ range, onChange }: { range: YearRange; onChange: (r: YearRange) => void }) {
  const fromPos = yearToSlider(range.from);
  const toPos = yearToSlider(range.to);
  return (
    <div className={styles.range}>
      <div className={styles.rangeHeader}>
        <span className={styles.rangeLabel}>Years</span>
        <output className={styles.rangeValue} aria-live="polite">{formatRange(range.from, range.to)}</output>
      </div>

      <div className={styles.slider}>
        <div className={styles.track} />
        <div className={styles.trackFill} style={{ left: pct(range.from), right: `calc(100% - ${pct(range.to)})` }} />
        <input
          type="range"
          min={0}
          max={SLIDER_STEPS}
          value={fromPos}
          aria-label="Start year"
          aria-valuetext={formatYear(range.from)}
          // When both handles sit at the far right, the start handle must be on top to stay draggable.
          style={{ zIndex: fromPos > SLIDER_STEPS - 10 ? 2 : 1 }}
          onChange={(e) => onChange({ from: Math.min(sliderToYear(Number(e.target.value)), range.to), to: range.to })}
        />
        <input
          type="range"
          min={0}
          max={SLIDER_STEPS}
          value={toPos}
          aria-label="End year"
          aria-valuetext={formatYear(range.to)}
          onChange={(e) => onChange({ from: range.from, to: Math.max(sliderToYear(Number(e.target.value)), range.from) })}
        />
      </div>
      <div className={styles.ticks} aria-hidden="true">
        {TICKS.map((y) => (
          <span key={y} style={{ left: pct(y) }}>
            {y === 1 ? "1 CE" : formatYear(y).replace(" CE", "")}
          </span>
        ))}
      </div>

      <div className={styles.presets} role="group" aria-label="Preset periods">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={p.from === range.from && p.to === range.to}
            title={formatRange(p.from, p.to)}
            onClick={() => onChange({ from: p.from, to: p.to })}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

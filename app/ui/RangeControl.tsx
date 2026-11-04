"use client";
/**
 * The dates, set large, over a two-handle year range on a non-linear scale (lib/time sliderToYear). Two native
 * range inputs, so keyboard and screen-reader support come from the browser. A range that arrives from outside,
 * a story or a list entry, is counted to with both numbers and handles; a drag is shown as it happens.
 */
import { useEffect, useRef, useState } from "react";
import { TWEEN_MS, tweenRange } from "../../lib/selection.ts";
import { formatRange, formatYear, MAX_YEAR, MIN_YEAR, nudgeYear, SLIDER_STEPS, sliderToYear, yearToSlider, type YearRange } from "../../lib/time/index.ts";
import { easeOut, still } from "./motion.ts";
import styles from "./globe.module.css";

const TICKS = [MIN_YEAR, -1000, 1, 1000, 1700, MAX_YEAR];

const pct = (year: number) => `${(yearToSlider(year) / SLIDER_STEPS) * 100}%`;

export function RangeControl({ range, onChange }: { range: YearRange; onChange: (r: YearRange) => void }) {
  const [shown, setShown] = useState(range);
  const [tween, setTween] = useState({ a: range, b: range });
  // Any range this control did not ask for itself came from a story.
  if (tween.b !== range) setTween({ a: shown, b: range });

  useEffect(() => {
    const { a, b } = tween;
    if (a === b) return;
    const start = performance.now();
    const duration = still() ? 0 : TWEEN_MS;
    let frame = requestAnimationFrame(function step(now) {
      const t = duration > 0 ? Math.min(Math.max(now - start, 0) / duration, 1) : 1;
      setShown(tweenRange(a, b, easeOut(t)));
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [tween]);

  const drag = (r: YearRange) => {
    setTween({ a: r, b: r });
    setShown(r);
    onChange(r);
  };

  // The step buttons repeat while held, so they read the range through a ref that every render and step refreshes.
  const latest = useRef(range);
  useEffect(() => {
    latest.current = range;
  }, [range]);
  const step = (end: "from" | "to", dir: -1 | 1, years: number) => {
    const r = latest.current;
    const next = end === "from" ? { from: Math.min(nudgeYear(r.from, dir, years), r.to), to: r.to } : { from: r.from, to: Math.max(nudgeYear(r.to, dir, years), r.from) };
    if (next.from === r.from && next.to === r.to) return;
    latest.current = next;
    drag(next);
  };

  const fromPos = yearToSlider(shown.from);
  const toPos = yearToSlider(shown.to);
  return (
    <div className={styles.range}>
      <div className={styles.datesRow}>
        <div className={styles.steps}>
          <StepButton label="Start year earlier" sign="−" onStep={(n) => step("from", -1, n)} />
          <StepButton label="Start year later" sign="+" onStep={(n) => step("from", 1, n)} />
        </div>
        <p className={styles.dates} aria-hidden="true">
          {formatRange(shown.from, shown.to)}
        </p>
        <div className={styles.steps}>
          <StepButton label="End year earlier" sign="−" onStep={(n) => step("to", -1, n)} />
          <StepButton label="End year later" sign="+" onStep={(n) => step("to", 1, n)} />
        </div>
      </div>
      {/* The numbers above count; this holds where they end up, so a screen reader hears one value. */}
      <output className={styles.visuallyHidden} aria-live="polite">
        {formatRange(range.from, range.to)}
      </output>

      <div className={styles.slider}>
        <div className={styles.track} />
        <div className={styles.trackFill} style={{ left: pct(shown.from), right: `calc(100% - ${pct(shown.to)})` }} />
        <input
          type="range"
          min={0}
          max={SLIDER_STEPS}
          value={fromPos}
          aria-label="Start year"
          aria-valuetext={formatYear(range.from)}
          // When both handles sit at the far right, the start handle must be on top to stay draggable.
          style={{ zIndex: fromPos > SLIDER_STEPS - 10 ? 2 : 1 }}
          onChange={(e) => drag({ from: Math.min(sliderToYear(Number(e.target.value)), range.to), to: range.to })}
        />
        <input
          type="range"
          min={0}
          max={SLIDER_STEPS}
          value={toPos}
          aria-label="End year"
          aria-valuetext={formatYear(range.to)}
          onChange={(e) => drag({ from: range.from, to: Math.max(sliderToYear(Number(e.target.value)), range.from) })}
        />
      </div>
      <div className={styles.ticks} aria-hidden="true">
        {TICKS.map((y) => (
          <span key={y} style={{ left: pct(y) }}>
            {y === 1 ? "1 CE" : formatYear(y).replace(" CE", "")}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Held this long, a step button starts repeating; after REPEAT_FAST repeats it moves ten years at a time. */
const HOLD_MS = 400;
const REPEAT_MS = 80;
const REPEAT_FAST = 12;

/**
 * One year earlier or later, for a touch screen, where dragging cannot land an exact year (decisions.md entry 36).
 * A press steps at once and repeats while held. The click that follows a press is ignored, so it does not step
 * twice; a click with no press before it (detail 0: Enter or Space) steps once.
 */
function StepButton({ label, sign, onStep }: { label: string; sign: string; onStep: (years: number) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);

  const press = () => {
    stop();
    onStep(1);
    let repeats = 0;
    const again = () => {
      repeats++;
      onStep(repeats > REPEAT_FAST ? 10 : 1);
      timer.current = setTimeout(again, REPEAT_MS);
    };
    timer.current = setTimeout(again, HOLD_MS);
  };

  return (
    <button
      type="button"
      className={styles.step}
      aria-label={label}
      onPointerDown={(e) => {
        if (e.button === 0) press();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (e.detail === 0) onStep(1);
      }}
    >
      {sign}
    </button>
  );
}

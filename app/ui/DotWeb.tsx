"use client";
/**
 * The web over a hovered stack: up to 8 member legs on a ring, plus a "+N more" leg, each joined to
 * the centre by a thin line. The stack itself stays on the map underneath; this overlay never takes
 * pointer events except on its legs, so the map keeps its drag, wheel, and the centre's click.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DOT_GROUPS, dotMeta, type DotProperties, type GroupKey } from "../../lib/dots.ts";
import { webOffsets } from "../../lib/web.ts";
import styles from "./globe.module.css";

const RADIUS_PX = 60;
/** The web stays open while the pointer is within this distance of the centre, or over a leg. */
export const WEB_HOLD_RADIUS_PX = RADIUS_PX + 16;
const CLOSE_DELAY_MS = 300;
const GROW_MS = 250; // matches the animations in globe.module.css
const LINE_START_PX = 11; // just outside the stack disc
const LINE_END_PX = RADIUS_PX - 7; // just inside a leg dot

const COLOR = Object.fromEntries(DOT_GROUPS.map((g) => [g.key, g.color])) as Record<GroupKey, string>;

/** Custom properties for the CSS, which TypeScript's CSSProperties does not know. */
const vars = (v: Record<string, string>) => v as CSSProperties;

export function DotWeb({
  center,
  legs,
  more,
  onPick,
  onMore,
  onLeave,
}: {
  center: { x: number; y: number };
  legs: DotProperties[];
  more: number;
  onPick: (qid: string) => void;
  onMore: () => void;
  onLeave: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onLeaveRef = useRef(onLeave);
  const [hovered, setHovered] = useState<number | null>(null);
  // Legs ignore the pointer while they grow: a leg sweeping under a still pointer would get a
  // pointerenter and never the matching pointerleave, leaving its tooltip stuck.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    onLeaveRef.current = onLeave;
  }, [onLeave]);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setSettled(true), still ? 0 : GROW_MS);
    return () => clearTimeout(timer);
  }, []);

  // Pointer outside the hold circle and off every leg: close after a short grace period, so a pointer
  // that slips out and back does not make the web flicker.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const leave = () => {
      if (timer === undefined) timer = setTimeout(() => onLeaveRef.current(), CLOSE_DELAY_MS);
    };
    const stay = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const onMove = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const origin = root.getBoundingClientRect(); // a zero-size box at the centre
      const overLeg = e.target instanceof Node && root.contains(e.target);
      if (overLeg || Math.hypot(e.clientX - origin.left, e.clientY - origin.top) <= WEB_HOLD_RADIUS_PX) stay();
      else leave();
    };
    const page = document.documentElement;
    window.addEventListener("pointermove", onMove);
    page.addEventListener("mouseleave", leave); // the pointer left the window entirely
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      page.removeEventListener("mouseleave", leave);
    };
  }, []);

  const offsets = webOffsets(legs.length + (more > 0 ? 1 : 0), RADIUS_PX);
  const at = (i: number) => ({ "--x": `${offsets[i].x}px`, "--y": `${offsets[i].y}px` });
  const tip = hovered === null ? null : legs[hovered];

  return (
    <div ref={rootRef} className={`${styles.web} ${settled ? "" : styles.webGrowing}`} style={{ left: center.x, top: center.y }}>
      <span className={styles.webBackdrop} style={vars({ "--hold": `${WEB_HOLD_RADIUS_PX}px` })} />
      {offsets.map((o, i) => (
        <span
          key={i}
          className={styles.webLine}
          style={vars({
            "--a": `${(Math.atan2(o.y, o.x) * 180) / Math.PI}deg`,
            "--r0": `${LINE_START_PX}px`,
            "--len": `${LINE_END_PX - LINE_START_PX}px`,
          })}
        />
      ))}
      {legs.map((p, i) => (
        <button
          key={p.qid}
          type="button"
          className={styles.webLeg}
          style={vars(at(i))}
          aria-label={`${p.label}, ${dotMeta(p)}`}
          onPointerEnter={() => setHovered(i)}
          onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
          onFocus={() => setHovered(i)}
          onBlur={() => setHovered((h) => (h === i ? null : h))}
          onClick={() => onPick(p.qid)}
        >
          <span
            className={`${styles.webDot} ${p.group === "context" ? styles.webDotContext : ""} ${p.approx ? styles.webDotApprox : ""}`}
            style={vars({ "--c": COLOR[p.group] })}
          />
        </button>
      ))}
      {more > 0 && (
        <button type="button" className={`${styles.webLeg} ${styles.webMore}`} style={vars(at(legs.length))} onClick={onMore}>
          +{more} more
        </button>
      )}
      {tip && hovered !== null && (
        <div className={styles.webTip} style={vars(at(hovered))} role="tooltip">
          <strong>{tip.label}</strong>
          <div>{dotMeta(tip)}</div>
        </div>
      )}
    </div>
  );
}

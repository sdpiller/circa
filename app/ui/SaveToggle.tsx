"use client";
/**
 * Saves an item, or unsaves it. A bookmark beside an event row, or a word in a person's or place's card.
 * `at` is the area the item is listed in; without one (text fading out) the toggle does nothing.
 */
import type { AreaItem } from "../../lib/db/area.ts";
import type { Position } from "../../lib/geo/geometry.ts";
import { isSaved, type SavedList } from "../../lib/saved.ts";
import type { YearRange } from "../../lib/time/index.ts";
import styles from "./globe.module.css";
import { toggleSavedItem, useSaved } from "./useSaved.ts";

export type SaveAt = { point: Position; range: YearRange } | null;

export function SaveToggle({ item, list, at, variant }: { item: AreaItem; list: SavedList; at: SaveAt; variant: "row" | "card" }) {
  const saved = isSaved(useSaved(), item.qid);
  const onClick = () => {
    if (at) toggleSavedItem({ item, list, point: at.point, range: at.range, savedAt: Date.now() });
  };
  if (variant === "card") {
    return (
      <button type="button" className={styles.saveWord} aria-pressed={saved} onClick={onClick}>
        <Bookmark filled={saved} />
        {saved ? "Saved" : "Save"}
      </button>
    );
  }
  return (
    <button type="button" className={styles.saveMark} aria-pressed={saved} aria-label={`Save ${item.label}`} title={saved ? "Saved: click to remove" : "Save"} onClick={onClick}>
      <Bookmark filled={saved} />
    </button>
  );
}

function Bookmark({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 12 16" width="11" height="15" aria-hidden="true">
      <path d="M1.5 1.5h9v13L6 11l-4.5 3.5z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

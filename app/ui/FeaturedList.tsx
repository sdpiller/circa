"use client";
import { FEATURED } from "../../lib/stories/catalog.ts";
import type { FeaturedEntry } from "../../lib/narrative/types.ts";
import { formatRange } from "../../lib/time/index.ts";
import styles from "./globe.module.css";

/**
 * The featured stories, in the left panel. Closed by default so the panel stays short on a small
 * screen. Choosing an entry sets its range, selects its cell, and moves the camera there (GlobeApp).
 * Renders nothing until a story is published.
 */
export function FeaturedList({ onChoose }: { onChoose: (e: FeaturedEntry) => void }) {
  if (FEATURED.length === 0) return null;
  return (
    <details className={styles.featured}>
      <summary>Featured stories</summary>
      <p className={styles.featuredNote}>
        Written by Claude from the Wikipedia and Wikidata text of each area. Other areas show their lists only.
      </p>
      <ul className={styles.featuredList}>
        {FEATURED.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onChoose(e)}>
              {`${e.place}, ${formatRange(e.from, e.to)}`}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

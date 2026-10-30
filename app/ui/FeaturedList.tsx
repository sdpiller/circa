"use client";
import { useEffect, useRef } from "react";
import { FEATURED } from "../../lib/stories/catalog.ts";
import type { FeaturedEntry } from "../../lib/narrative/types.ts";
import { formatRange } from "../../lib/time/index.ts";
import styles from "./globe.module.css";

/** Tall enough that the open list leaves the rest of the left panel on screen. */
const OPEN_MIN_HEIGHT = "(min-height: 700px)";

/**
 * The featured stories, in the left panel. Starts open on a tall screen, since the list is the way
 * to a story, and closed on a short one. Set after mount so the server and client markup agree.
 * Choosing an entry sets its range, selects its cell, and moves the camera there (GlobeApp).
 * Renders nothing until a story is published.
 */
export function FeaturedList({ onChoose }: { onChoose: (e: FeaturedEntry) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current && window.matchMedia(OPEN_MIN_HEIGHT).matches) ref.current.open = true;
  }, []);
  if (FEATURED.length === 0) return null;
  return (
    <details ref={ref} className={styles.featured}>
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

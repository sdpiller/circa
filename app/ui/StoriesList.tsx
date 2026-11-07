"use client";
/**
 * The way to a story without knowing where it is: one link by the wordmark, opening a short list ordered by
 * start year. Always mounted, so it can expand; inert while closed, so Tab skips it. Open or closed is the
 * app's to hold, so opening Saved closes it.
 */
import { useRef } from "react";
import type { PublishedStory } from "../../lib/narrative/publish.ts";
import { STORIES } from "../../lib/stories/catalog.ts";
import { formatRange } from "../../lib/time/index.ts";
import styles from "./globe.module.css";

export function StoriesList({ open, setOpen, onChoose }: { open: boolean; setOpen: (open: boolean) => void; onChoose: (story: PublishedStory) => void }) {
  const toggle = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={toggle} type="button" className={styles.storiesToggle} aria-expanded={open} aria-controls="stories-list" onClick={() => setOpen(!open)}>
        Stories
      </button>
      <div
        id="stories-list"
        className={`${styles.stories} ${open ? styles.storiesOpen : ""}`}
        inert={!open}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.stopPropagation(); // the panel also listens for Escape, and this one is only for the list
          setOpen(false);
          toggle.current?.focus();
        }}
      >
        <div className={styles.storiesClip}>
          <div className={styles.storiesBody}>
            <p className={styles.storiesNote}>Written by Claude from the Wikipedia and Wikidata text of each area. Other areas show their lists only.</p>
            <ul>
              {STORIES.map((s) => (
                <li key={s.entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onChoose(s);
                    }}
                  >
                    {s.entry.place}, {formatRange(s.entry.from, s.entry.to)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

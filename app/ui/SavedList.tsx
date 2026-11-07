"use client";
/**
 * The visitor's saved items, by the Stories link: events, then people and places, newest first. A row opens
 * to Wikipedia's paragraph; "Show on globe" reopens the area it was found in. Kept in this browser only
 * (decisions.md entry 37). Always mounted and inert while closed, as the Stories list is.
 */
import { useRef, useState } from "react";
import { itemMeta, what } from "../../lib/items.ts";
import type { SavedItem } from "../../lib/saved.ts";
import { formatRange } from "../../lib/time/index.ts";
import styles from "./globe.module.css";
import { SummaryText } from "./SummaryText.tsx";
import { removeSavedItem, useSaved } from "./useSaved.ts";

export function SavedList({ open, setOpen, onShow }: { open: boolean; setOpen: (open: boolean) => void; onShow: (saved: SavedItem) => void }) {
  const saved = useSaved();
  const toggle = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const events = saved.filter((s) => s.list === "events");
  const others = saved.filter((s) => s.list === "others");

  const group = (title: string, list: SavedItem[]) =>
    list.length > 0 && (
      <>
        <h3 className={styles.panelSection}>{title}</h3>
        <ul className={styles.savedItems}>
          {list.map((s) => (
            <SavedRow
              key={s.item.qid}
              saved={s}
              onShow={() => {
                setOpen(false);
                onShow(s);
              }}
              onRemove={() => {
                // Focus would fall to the page with the row: keep it in the list.
                listRef.current?.focus();
                removeSavedItem(s.item.qid);
              }}
            />
          ))}
        </ul>
      </>
    );

  return (
    <>
      <button ref={toggle} type="button" className={styles.storiesToggle} aria-expanded={open} aria-controls="saved-list" onClick={() => setOpen(!open)}>
        Saved{saved.length > 0 && <span className={styles.savedCount}> {saved.length}</span>}
      </button>
      <div
        ref={listRef}
        id="saved-list"
        tabIndex={-1}
        aria-label="Saved"
        className={`${styles.stories} ${styles.saved} ${open ? styles.storiesOpen : ""}`}
        inert={!open}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.stopPropagation(); // the panel also listens for Escape, and this one is only for the list
          setOpen(false);
          toggle.current?.focus();
        }}
      >
        <div className={styles.storiesClip}>
          <div className={styles.savedBody}>
            {saved.length === 0 ? (
              <p className={styles.storiesNote}>Nothing saved yet. Use the bookmark beside an event, or Save in a person&apos;s or place&apos;s card.</p>
            ) : (
              <>
                {group("Events", events)}
                {group("People and places", others)}
              </>
            )}
            <p className={styles.savedFoot}>Saved in this browser only. Descriptions from Wikidata, paragraphs from Wikipedia (CC BY-SA), linked per item.</p>
          </div>
        </div>
      </div>
    </>
  );
}

function SavedRow({ saved, onShow, onRemove }: { saved: SavedItem; onShow: () => void; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { item } = saved;
  const meta = itemMeta({ years: formatRange(item.start_year, item.end_year), what: what(item), approx: item.loc_confidence === "inherited" });
  return (
    <li>
      <button type="button" className={styles.savedRow} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className={styles.eventName}>{item.label}</span>
        <span className={styles.eventYears}>{meta}</span>
        {item.description && <span className={styles.eventDesc}>{item.description}</span>}
      </button>
      {expanded && <SummaryText item={item} />}
      <p className={styles.savedActions}>
        <button type="button" onClick={onShow}>
          Show on globe
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${item.label}`}>
          Remove
        </button>
      </p>
    </li>
  );
}

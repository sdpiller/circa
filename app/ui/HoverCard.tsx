"use client";
/**
 * A person or place name in the area box, and the small card it opens: picture, what the date means,
 * a description, and the first two sentences of the Wikipedia article. Pointer hover opens it after
 * HOVER_INTENT_MS, so sweeping across the list fetches nothing; keyboard focus opens it at once.
 * The card sits inside the name's list item, right below the name, so the pointer can move onto it
 * and Tab reaches its link before the next name.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { firstSentences, wikidataUrl } from "../../lib/box.ts";
import type { AreaItem } from "../../lib/db/area.ts";
import { dotMeta, what } from "../../lib/dots.ts";
import { formatRange } from "../../lib/time/index.ts";
import styles from "./globe.module.css";
import { useSummary } from "./useSummary.ts";

export const HOVER_INTENT_MS = 250;

export function NameWithCard({
  item,
  open,
  focused,
  onOpen,
  onClose,
}: {
  item: AreaItem;
  open: boolean;
  focused: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [place, setPlace] = useState<CSSProperties>({ top: 0 });

  useEffect(() => () => clearTimeout(timer.current), []);

  // The card spans the list's width, touching this name: below it, or above it when the name sits in
  // the lower half of the scrolling box. The list is the card's positioning parent.
  const show = () => {
    const b = buttonRef.current;
    const list = b?.offsetParent as HTMLElement | null | undefined;
    const scroller = list?.parentElement;
    if (b && list && scroller) {
      const r = b.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      const below = r.top - s.top < s.height / 2;
      setPlace(below ? { top: b.offsetTop + b.offsetHeight } : { bottom: list.offsetHeight - b.offsetTop });
    }
    onOpen();
  };

  const cardId = `card-${item.qid}`;
  return (
    <li
      data-qid={item.qid}
      className={focused ? styles.focused : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        clearTimeout(timer.current);
        timer.current = setTimeout(show, HOVER_INTENT_MS);
      }}
      onPointerLeave={() => {
        clearTimeout(timer.current);
        if (open) onClose();
      }}
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) onClose();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={styles.nameButton}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        // Keyboard focus opens the card at once; a mouse click focuses without :focus-visible, and opens it too.
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) show();
        }}
        onClick={show}
      >
        {item.label}
      </button>
      {open && <HoverCard id={cardId} item={item} place={place} />}
    </li>
  );
}

function HoverCard({ id, item, place }: { id: string; item: AreaItem; place: CSSProperties }) {
  const s = useSummary(item.wikipedia_title, item.wikipedia_title !== null);
  const summary = s.state === "ok" ? s.summary : null;
  const description = summary?.description ?? item.description;
  const meta = dotMeta({ years: formatRange(item.start_year, item.end_year), what: what(item), approx: item.loc_confidence === "inherited" });
  return (
    <div id={id} className={styles.hoverCard} style={place}>
      {summary?.thumbnail && (
        // A remote Commons thumbnail at its own small size; next/image would need a remote loader for no gain.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.cardImage} src={summary.thumbnail.source} alt={item.label} />
      )}
      <div>
        <p className={styles.cardName}>{item.label}</p>
        <p className={styles.muted}>{meta}</p>
        {description && <p className={styles.cardDesc}>{description}</p>}
        {summary ? (
          <>
            <p className={styles.cardExtract}>{firstSentences(summary.extract)}</p>
            <a href={summary.url} target="_blank" rel="noreferrer">
              Read on Wikipedia
            </a>
          </>
        ) : s.state === "loading" ? (
          <p className={styles.muted}>Loading</p>
        ) : s.state === "error" ? (
          <p className={styles.muted}>Could not load from Wikipedia</p>
        ) : (
          <>
            {s.state === "missing" && <p className={styles.muted}>No English Wikipedia article</p>}
            <a href={wikidataUrl(item.qid)} target="_blank" rel="noreferrer">
              Wikidata item
            </a>
          </>
        )}
      </div>
    </div>
  );
}

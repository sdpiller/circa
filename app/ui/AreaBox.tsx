"use client";
/**
 * The area box: what is documented in one grid cell for the selected years. Events (by year, each
 * expandable to Wikipedia's opening paragraph), then people and places (names with hover cards).
 * The Phase 5 story goes between the header and the events.
 */
import { getResolution } from "h3-js";
import { useEffect, useRef, useState } from "react";
import { EVENTS_STEP, OTHERS_STEP, areaUrl, moreControl } from "../../lib/box.ts";
import { cellAcrossKm, type Res } from "../../lib/cells.ts";
import type { AreaItem, AreaResult } from "../../lib/db/area.ts";
import { DOT_GROUPS, groupOf } from "../../lib/dots.ts";
import { formatRange, type YearRange } from "../../lib/time/index.ts";
import { NameWithCard } from "./HoverCard.tsx";
import { SummaryText } from "./SummaryText.tsx";
import styles from "./globe.module.css";

// Dragging the range slider changes the range on every step: wait for a pause before asking.
const FETCH_DEBOUNCE_MS = 120;

const COLOR = Object.fromEntries(DOT_GROUPS.map((g) => [g.key, g.color]));

type List = "events" | "others";
type Answer = { url: string; base: string; result: AreaResult | null };

export function AreaBox({ cell, focus, range, onClose }: { cell: string; focus?: string; range: YearRange; onClose: () => void }) {
  const [eventsLimit, setEventsLimit] = useState(EVENTS_STEP);
  const [othersLimit, setOthersLimit] = useState(OTHERS_STEP);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [card, setCard] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef("");
  // After a keyboard "show more", focus goes to the first new item, since the button may vanish.
  const moveFocusRef = useRef<{ list: List; before: Set<string> } | null>(null);

  const url = areaUrl({ cell, from: range.from, to: range.to, eventsLimit, othersLimit, focus });
  const base = `${cell} ${range.from} ${range.to}`; // what the box describes; limits and focus only refine it
  const rangeText = formatRange(range.from, range.to);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let result: AreaResult | null = null;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) result = (await res.json()) as AreaResult;
      } catch {
        // aborted, or the network failed: handled below
      }
      if (!controller.signal.aborted) setAnswer({ url, base, result });
    }, FETCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, base]);

  // While "show more" or a new focus loads, keep showing the same cell and years. Never show another
  // range's answer: until the new one arrives, the box says it is loading.
  const shown = answer && (answer.url === url || answer.base === base) ? answer : null;
  const pending = answer?.url !== url;
  const result = shown?.result;
  // A card whose name left the list (new range) is closed, so Escape never closes an invisible card.
  const openCard = card !== null && result?.others.some((i) => i.qid === card) ? card : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openCard) setCard(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCard, onClose]);

  // Scroll the focus item into view once per cell, range, and focus, when its answer arrives.
  useEffect(() => {
    if (!focus || !result) return;
    const key = `${base} ${focus}`;
    if (scrolledRef.current === key) return;
    const el = bodyRef.current?.querySelector(`[data-qid="${focus}"]`);
    if (!el) return;
    scrolledRef.current = key;
    el.scrollIntoView({ block: "center" });
  }, [focus, base, result]);

  // Runs after every render: the new items exist only once the longer answer is drawn.
  useEffect(() => {
    const m = moveFocusRef.current;
    if (!m || pending || !result) return;
    moveFocusRef.current = null;
    const items = bodyRef.current?.querySelectorAll<HTMLElement>(`[data-list="${m.list}"] > li`) ?? [];
    const first = [...items].find((li) => !m.before.has(li.dataset.qid ?? ""));
    first?.querySelector("button")?.focus();
  });

  const showMore = (list: List, next: number, keyboard: boolean) => {
    if (keyboard && result) moveFocusRef.current = { list, before: new Set(result[list].map((i) => i.qid)) };
    (list === "events" ? setEventsLimit : setOthersLimit)(next);
  };

  const toggle = (qid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(qid)) next.add(qid);
      return next;
    });

  return (
    <section className={`${styles.panel} ${styles.box}`} aria-labelledby="area-box-title">
      <header className={styles.boxHeader}>
        <h2 id="area-box-title" className={styles.boxTitle}>
          Area about {cellAcrossKm(getResolution(cell) as Res)} km across, {rangeText}
        </h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close area">
          ×
        </button>
      </header>

      <div ref={bodyRef} className={styles.boxBody} aria-busy={pending} data-scroller>
        {!shown ? (
          <p className={styles.muted} role="status">
            Loading
          </p>
        ) : !result ? (
          <p role="status">Could not load this area.</p>
        ) : result.eventsTotal + result.othersTotal === 0 ? (
          <p role="status">Nothing documented here for {rangeText}</p>
        ) : (
          <>
            {result.events.length > 0 && (
              <>
                <h3 className={styles.boxSection}>Events</h3>
                <ul className={styles.events} data-list="events">
                  {result.events.map((item) => (
                    <EventRow key={item.qid} item={item} open={expanded.has(item.qid)} focused={item.qid === focus} onToggle={() => toggle(item.qid)} />
                  ))}
                </ul>
                <More shown={result.events.length} total={result.eventsTotal} limit={eventsLimit} step={EVENTS_STEP} pending={pending} onMore={(next, kb) => showMore("events", next, kb)} />
              </>
            )}
            {result.others.length > 0 && (
              <>
                <h3 className={styles.boxSection}>People and places</h3>
                <ul className={styles.names} data-list="others">
                  {result.others.map((item) => (
                    <NameWithCard
                      key={item.qid}
                      item={item}
                      open={openCard === item.qid}
                      focused={item.qid === focus}
                      onOpen={() => setCard(item.qid)}
                      onClose={() => setCard((c) => (c === item.qid ? null : c))}
                    />
                  ))}
                </ul>
                <More shown={result.others.length} total={result.othersTotal} limit={othersLimit} step={OTHERS_STEP} pending={pending} onMore={(next, kb) => showMore("others", next, kb)} />
              </>
            )}
          </>
        )}
      </div>

      <footer className={styles.boxFooter}>Descriptions from Wikidata. Paragraphs and pictures from Wikipedia (CC BY-SA), linked per item.</footer>
    </section>
  );
}

function EventRow({ item, open, focused, onToggle }: { item: AreaItem; open: boolean; focused: boolean; onToggle: () => void }) {
  const approx = item.loc_confidence === "inherited";
  const color = COLOR[groupOf(item)];
  return (
    <li data-qid={item.qid} className={focused ? styles.focused : undefined}>
      <button type="button" className={styles.eventRow} aria-expanded={open} onClick={onToggle}>
        <span
          className={`${styles.swatch} ${approx ? styles.swatchApprox : ""}`}
          style={approx ? { borderColor: color } : { background: color }}
          aria-hidden="true"
        />
        <span>
          <span className={styles.eventYears}>{formatRange(item.start_year, item.end_year)}</span>
          <span className={styles.eventName}>{item.label}</span>
          {item.description && <span className={styles.eventDesc}>{item.description}</span>}
          {approx && <span className={styles.eventApprox}>approximate location</span>}
        </span>
      </button>
      {open && <SummaryText item={item} />}
    </li>
  );
}

function More({
  shown,
  total,
  limit,
  step,
  pending,
  onMore,
}: {
  shown: number;
  total: number;
  limit: number;
  step: number;
  pending: boolean;
  onMore: (next: number, keyboard: boolean) => void;
}) {
  const more = moreControl(shown, total, limit, step);
  if (!more) return null;
  if (more.kind === "text") return <p className={styles.muted}>and {more.n} more</p>;
  // Not disabled while loading: a disabled button would drop keyboard focus.
  return (
    <button type="button" className={styles.more} aria-disabled={pending} onClick={(e) => !pending && onMore(more.next, e.currentTarget.matches(":focus-visible"))}>
      {pending ? "Loading" : `Show ${more.n} more`}
    </button>
  );
}

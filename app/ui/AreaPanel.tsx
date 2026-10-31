"use client";
/**
 * The reading column: what is documented in the clicked area for the chosen years. Name, atlas line, years
 * and scale, then the story if one applies, then events (each expandable to Wikipedia's opening paragraph),
 * then people and places (names with hover cards). Always mounted, so it can slide; the map never resizes.
 */
import { useCallback, useEffect, useRef, useState, type ActionDispatch } from "react";
import { EVENTS_STEP, OTHERS_STEP, moreControl } from "../../lib/box.ts";
import type { AreaItem } from "../../lib/db/area.ts";
import type { Position } from "../../lib/geo/geometry.ts";
import { ATLAS_LINE, scaleLine } from "../../lib/outline/scale.ts";
import { requestUrl, shownAnswer, type AreaAction, type AreaList, type AreaState } from "../../lib/selection.ts";
import { missingCites, PUBLISHED } from "../../lib/stories/catalog.ts";
import { formatRange } from "../../lib/time/index.ts";
import { NameWithCard } from "./HoverCard.tsx";
import { still } from "./motion.ts";
import { Story } from "./Story.tsx";
import { SummaryText } from "./SummaryText.tsx";
import styles from "./globe.module.css";

/** The answer last on screen, and what it described. `closed` once the panel has shut since. */
type Held = { answer: NonNullable<AreaState["answer"]>; base: string; point: Position | null; closed: boolean };

/** How a cited row flashes: from the prototype's pale violet back to its own colour. */
const FLASH: Keyframe[] = [{ backgroundColor: "#e7e2f3" }, {}];
const FLASH_MS = 900;

export function AreaPanel({ area, dispatch, focusRequest }: { area: AreaState; dispatch: ActionDispatch<[AreaAction]>; focusRequest: number }) {
  const open = area.point !== null;
  const pending = open && area.answer?.url !== requestUrl(area);
  const current = shownAnswer(area);
  const base = `${area.point} ${area.range.from} ${area.range.to}`; // what the panel describes; limits only refine it
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const [held, setHeld] = useState<Held | null>(null);
  if (current && held?.answer !== current) {
    // Here, not at the click: the old rows should not jump while they fade out.
    if (!held || held.closed || held.point !== area.point) setExpanded(new Set());
    setHeld({ answer: current, base, point: area.point, closed: false });
  } else if (!open && held && !held.closed) {
    setHeld({ ...held, closed: true });
  }
  // Switching areas: the old text fades out while the next loads. Closing: it stays while the panel slides out,
  // so it does not blank mid-slide. Opening again: it is gone.
  const fading = open && !current && held !== null && !held.closed;
  const shown = current ?? (fading || !open ? (held?.answer ?? null) : null);
  const swapKey = !shown ? "empty" : current ? base : held?.base;
  const body = shown?.body ?? null;
  const selection = body && body.selection.kind !== "none" ? body.selection : null;

  const [card, setCard] = useState<string | null>(null);
  const [cited, setCited] = useState<{ base: string; qid: string | null } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const eventsHeadingRef = useRef<HTMLHeadingElement>(null);
  const warnedRef = useRef(new Set<string>());
  const bodyRef = useRef<HTMLDivElement>(null);
  // After a keyboard "show more", focus goes to the first new item, since the button may vanish.
  const moveFocusRef = useRef<{ list: AreaList; before: Set<string> } | null>(null);

  // The story, shown only if every item it cites is listed.
  const story = body?.storyId ? (PUBLISHED.find((s) => s.entry.id === body.storyId) ?? null) : null;
  const missing = story && body ? missingCites(story, body) : [];
  const missingKey = story && missing.length > 0 ? `${story.entry.id} ${missing.join(",")}` : "";
  useEffect(() => {
    if (!missingKey || warnedRef.current.has(missingKey)) return;
    warnedRef.current.add(missingKey);
    console.warn(`Featured story hidden, cited items missing from the panel: ${missingKey}`);
  }, [missingKey]);

  const citedQid = cited?.base === base ? cited.qid : null;
  const onCite = (qid: string | null) => {
    setCited({ base, qid });
    const instant = still();
    const behavior = instant ? "auto" : "smooth";
    if (qid === null) {
      eventsHeadingRef.current?.scrollIntoView({ block: "start", behavior });
      return;
    }
    const row = bodyRef.current?.querySelector(`[data-qid="${qid}"]`);
    row?.scrollIntoView({ block: "center", behavior });
    if (!instant) row?.querySelector("button")?.animate(FLASH, FLASH_MS);
  };

  // A card whose name left the list (new range) is closed, so Escape never closes an invisible card.
  const openCard = card !== null && body?.others.some((i) => i.qid === card) ? card : null;

  const close = useCallback(() => {
    // Before the panel goes inert, which would drop its focus to the body. Focus elsewhere, on the slider, stays.
    const active = document.activeElement;
    if (active === document.body || panelRef.current?.contains(active)) {
      document.querySelector<HTMLElement>(".maplibregl-canvas")?.focus({ preventScroll: true });
    }
    dispatch({ type: "close" });
  }, [dispatch]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openCard) setCard(null);
      else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openCard, close]);

  // After the commit that lifts `inert`. No scroll: the panel may still be off screen, sliding in.
  useEffect(() => {
    if (focusRequest > 0) panelRef.current?.focus({ preventScroll: true });
  }, [focusRequest]);

  // Before the effect below: a "show more" from an area left behind must not pull focus into the next one.
  useEffect(() => {
    moveFocusRef.current = null;
  }, [base]);

  // Runs after every render: the new items exist only once the longer answer is drawn.
  useEffect(() => {
    const m = moveFocusRef.current;
    if (!m || pending || !body) return;
    moveFocusRef.current = null;
    const items = bodyRef.current?.querySelectorAll<HTMLElement>(`[data-list="${m.list}"] > li`) ?? [];
    const first = [...items].find((li) => !m.before.has(li.dataset.qid ?? ""));
    first?.querySelector("button")?.focus();
  });

  const showMore = (list: AreaList, next: number, keyboard: boolean) => {
    if (keyboard && body) moveFocusRef.current = { list, before: new Set(body[list].map((i) => i.qid)) };
    dispatch({ type: "more", list, next });
  };

  const toggle = (qid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(qid)) next.add(qid);
      return next;
    });

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className={`${styles.panel} ${open ? styles.panelOpen : ""}`}
      aria-hidden={!open}
      inert={!open}
      aria-labelledby={selection ? "area-name" : undefined}
    >
      <button type="button" className={styles.panelClose} onClick={close} aria-label="Close area">
        ×
      </button>

      {open && !current && (
        <p className={`${styles.panelLoading} ${fading ? styles.panelLoadingLate : ""}`} role="status">
          Loading
        </p>
      )}

      {/* A new key for new text: it fades in, and its list starts scrolled to the top. */}
      <div key={swapKey} className={`${styles.swap} ${fading ? styles.swapOut : ""}`} inert={fading}>
        {selection && body && (
          <header className={styles.panelHead}>
            <h2 id="area-name" className={styles.panelName}>
              {selection.name}
            </h2>
            {selection.source === "basemaps" && <p className={styles.panelAtlas}>{ATLAS_LINE}</p>}
            <p className={styles.panelYears}>{formatRange(body.from, body.to)}</p>
            <p className={styles.panelScale}>{scaleLine(selection)}</p>
          </header>
        )}

        <div ref={bodyRef} className={styles.panelBody} aria-busy={pending} data-scroller>
          {shown &&
            (!body ? (
              <p role="status">Could not load this area.</p>
            ) : body.eventsTotal + body.othersTotal === 0 ? (
              <p role="status">Nothing documented here for these years.</p>
            ) : (
              <>
                {story && missing.length === 0 && (
                  <>
                    <h3 className={styles.storyPlace}>{story.entry.place}</h3>
                    <Story story={story} onCite={onCite} />
                  </>
                )}
                {body.events.length > 0 && (
                  <>
                    <h3 ref={eventsHeadingRef} className={styles.panelSection}>
                      Events
                    </h3>
                    <ul className={styles.events} data-list="events">
                      {body.events.map((item) => (
                        <EventRow key={item.qid} item={item} open={expanded.has(item.qid)} focused={item.qid === citedQid} onToggle={() => toggle(item.qid)} />
                      ))}
                    </ul>
                    <More shown={body.events.length} total={body.eventsTotal} limit={area.eventsLimit} step={EVENTS_STEP} pending={pending} onMore={(next, kb) => showMore("events", next, kb)} />
                  </>
                )}
                {body.others.length > 0 && (
                  <>
                    <h3 className={styles.panelSection}>People and places</h3>
                    <ul className={styles.names} data-list="others">
                      {body.others.map((item) => (
                        <NameWithCard
                          key={item.qid}
                          item={item}
                          open={openCard === item.qid}
                          focused={item.qid === citedQid}
                          onOpen={() => setCard(item.qid)}
                          onClose={() => setCard((c) => (c === item.qid ? null : c))}
                        />
                      ))}
                    </ul>
                    <More shown={body.others.length} total={body.othersTotal} limit={area.othersLimit} step={OTHERS_STEP} pending={pending} onMore={(next, kb) => showMore("others", next, kb)} />
                  </>
                )}
              </>
            ))}
        </div>
      </div>

      <footer className={styles.panelFooter}>Descriptions from Wikidata. Paragraphs and pictures from Wikipedia (CC BY-SA), linked per item.</footer>
    </aside>
  );
}

function EventRow({ item, open, focused, onToggle }: { item: AreaItem; open: boolean; focused: boolean; onToggle: () => void }) {
  const approx = item.loc_confidence === "inherited";
  return (
    <li data-qid={item.qid} className={focused ? styles.focused : undefined}>
      <button type="button" className={styles.eventRow} aria-expanded={open} onClick={onToggle}>
        <span className={`${styles.mark} ${approx ? styles.markApprox : ""}`} aria-hidden="true" />
        <span>
          <span className={styles.eventName}>{item.label}</span>
          <span className={styles.eventYears}>
            {formatRange(item.start_year, item.end_year)}
            {approx && ", approximate location"}
          </span>
          {item.description && <span className={styles.eventDesc}>{item.description}</span>}
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

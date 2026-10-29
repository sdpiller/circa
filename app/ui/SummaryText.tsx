"use client";
/** An expanded event row: Wikipedia's opening paragraph as plain text, with a link to the article. */
import { wikidataUrl } from "../../lib/box.ts";
import type { AreaItem } from "../../lib/db/area.ts";
import styles from "./globe.module.css";
import { useSummary } from "./useSummary.ts";

export function SummaryText({ item }: { item: Pick<AreaItem, "qid" | "wikipedia_title"> }) {
  const summary = useSummary(item.qid, item.wikipedia_title !== null);
  if (item.wikipedia_title === null || summary.state === "missing") {
    return (
      <div className={styles.summary}>
        <p className={styles.muted}>No English Wikipedia article</p>
        <a href={wikidataUrl(item.qid)} target="_blank" rel="noreferrer">
          Wikidata item
        </a>
      </div>
    );
  }
  return (
    <div className={styles.summary} aria-live="polite">
      {summary.state === "ok" ? (
        <>
          <p>{summary.summary.extract}</p>
          <a href={summary.summary.url} target="_blank" rel="noreferrer">
            Read on Wikipedia
          </a>
        </>
      ) : summary.state === "error" ? (
        <p className={styles.muted}>Could not load from Wikipedia</p>
      ) : (
        <p className={styles.muted}>Loading</p>
      )}
    </div>
  );
}

"use client";
/**
 * A Wikipedia page summary from /api/summary. Settled answers (an article, or no article) are kept in
 * a module-level cache keyed by Wikidata id, so each item is fetched at most once per page load and
 * every row or card showing it shares the answer. Errors are not cached: the next open tries again.
 */
import { useEffect, useState } from "react";
import { summaryApiUrl } from "../../lib/box.ts";
import type { Summary } from "../../lib/wiki/summary.ts";

export type SummaryState = { state: "idle" | "loading" | "missing" | "error" } | { state: "ok"; summary: Summary };
type Settled = Exclude<SummaryState, { state: "idle" | "loading" }>;

const settled = new Map<string, Settled>();
const inFlight = new Map<string, Promise<Settled>>();

function load(qid: string): Promise<Settled> {
  let p = inFlight.get(qid);
  if (!p) {
    p = (async (): Promise<Settled> => {
      try {
        const res = await fetch(summaryApiUrl(qid));
        const result: Settled =
          res.status === 404
            ? { state: "missing" }
            : res.ok
              ? { state: "ok", summary: (await res.json()) as Summary }
              : { state: "error" };
        if (result.state !== "error") settled.set(qid, result);
        return result;
      } catch {
        return { state: "error" };
      } finally {
        inFlight.delete(qid);
      }
    })();
    inFlight.set(qid, p);
  }
  return p;
}

/** Nothing is fetched until `enabled` is true (the item has an English Wikipedia title). */
export function useSummary(qid: string, enabled: boolean): SummaryState {
  const [answer, setAnswer] = useState<{ qid: string; value: Settled } | null>(null);

  useEffect(() => {
    if (!enabled || settled.has(qid)) return;
    let current = true;
    void load(qid).then((value) => {
      if (current) setAnswer({ qid, value });
    });
    return () => {
      current = false;
    };
  }, [qid, enabled]);

  const known = settled.get(qid) ?? (answer?.qid === qid ? answer.value : undefined);
  if (known) return known;
  return enabled ? { state: "loading" } : { state: "idle" };
}

"use client";
/**
 * A Wikipedia page summary from /api/summary. Settled answers (an article, or no article) are kept in
 * a module-level cache, so each title is fetched at most once per page load and every row or card
 * showing it shares the answer. Errors are not cached: the next open tries again.
 */
import { useEffect, useState } from "react";
import { summaryApiUrl } from "../../lib/box.ts";
import type { Summary } from "../../lib/wiki/summary.ts";

export type SummaryState = { state: "idle" | "loading" | "missing" | "error" } | { state: "ok"; summary: Summary };
type Settled = Exclude<SummaryState, { state: "idle" | "loading" }>;

const settled = new Map<string, Settled>();
const inFlight = new Map<string, Promise<Settled>>();

function load(title: string): Promise<Settled> {
  let p = inFlight.get(title);
  if (!p) {
    p = (async (): Promise<Settled> => {
      try {
        const res = await fetch(summaryApiUrl(title));
        const result: Settled =
          res.status === 404
            ? { state: "missing" }
            : res.ok
              ? { state: "ok", summary: (await res.json()) as Summary }
              : { state: "error" };
        if (result.state !== "error") settled.set(title, result);
        return result;
      } catch {
        return { state: "error" };
      } finally {
        inFlight.delete(title);
      }
    })();
    inFlight.set(title, p);
  }
  return p;
}

/** Nothing is fetched until `enabled` is true and `title` is set. */
export function useSummary(title: string | null, enabled: boolean): SummaryState {
  const [answer, setAnswer] = useState<{ title: string; value: Settled } | null>(null);

  useEffect(() => {
    if (!enabled || title === null || settled.has(title)) return;
    let current = true;
    void load(title).then((value) => {
      if (current) setAnswer({ title, value });
    });
    return () => {
      current = false;
    };
  }, [title, enabled]);

  if (title === null) return { state: "idle" };
  const known = settled.get(title) ?? (answer?.title === title ? answer.value : undefined);
  if (known) return known;
  return enabled ? { state: "loading" } : { state: "idle" };
}

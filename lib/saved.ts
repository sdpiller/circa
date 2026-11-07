/**
 * Saved items, kept in the visitor's browser (decisions.md entry 37). A record is a snapshot: the item as it
 * was listed, which list it was in, and the point and years of the area it was found in, so the saved list
 * reads without the database and "Show on globe" reopens the same outline. Pure; the storage itself is
 * app/ui/useSaved.ts.
 */
import { z } from "zod";
import type { AreaItem } from "./db/area.ts";
import { CATEGORIES, KINDS } from "./db/schema.ts";
import type { Position } from "./geo/geometry.ts";
import type { YearRange } from "./time/index.ts";

/** Namespaced: under samarchive.com/circa the browser shares this storage with every samarchive page. */
export const SAVED_KEY = "circa.saved.v1";

export type SavedList = "events" | "others";
export type SavedItem = { item: AreaItem; list: SavedList; point: Position; range: YearRange; savedAt: number };

const year = z.number().int().refine((y) => y !== 0);

// Written out, not picked from EventRow: a stored record is outside input, and this is exactly the AreaItem shape.
const Item = z.object({
  qid: z.string().regex(/^Q\d+$/),
  label: z.string().min(1),
  description: z.string().nullable(),
  kind: z.enum(KINDS),
  category: z.enum(CATEGORIES),
  start_year: year,
  end_year: year,
  loc_confidence: z.enum(["exact", "inherited"]),
  wikipedia_title: z.string().min(1).nullable(),
  sitelinks: z.number().int().min(0),
});

const Saved = z.object({
  item: Item,
  list: z.enum(["events", "others"]),
  point: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  range: z.object({ from: year, to: year }).refine((r) => r.from <= r.to),
  savedAt: z.number(),
});

/**
 * What is stored, as a list. Nothing, broken JSON or a non-list gives an empty list; a broken record is
 * dropped and the rest kept, so one bad entry never costs the visitor everything else.
 */
export function parseSaved(raw: string | null): SavedItem[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: SavedItem[] = [];
  for (const entry of data) {
    const r = Saved.safeParse(entry);
    if (!r.success || seen.has(r.data.item.qid)) continue;
    seen.add(r.data.item.qid);
    out.push(r.data as SavedItem);
  }
  return out;
}

export const serializeSaved = (list: readonly SavedItem[]): string => JSON.stringify(list);

export const isSaved = (list: readonly SavedItem[], qid: string): boolean => list.some((s) => s.item.qid === qid);

export function removeSaved(list: readonly SavedItem[], qid: string): SavedItem[] {
  return isSaved(list, qid) ? list.filter((s) => s.item.qid !== qid) : [...list];
}

/** Saves the item at the top, or unsaves it if it is already saved, wherever it was found. */
export function toggleSaved(list: readonly SavedItem[], entry: SavedItem): SavedItem[] {
  return isSaved(list, entry.item.qid) ? removeSaved(list, entry.item.qid) : [entry, ...list];
}

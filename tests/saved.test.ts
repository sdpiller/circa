import { describe, expect, it } from "vitest";
import type { AreaItem } from "../lib/db/area.ts";
import { isSaved, parseSaved, removeSaved, serializeSaved, toggleSaved, type SavedItem } from "../lib/saved.ts";

const item = (qid: string, over: Partial<AreaItem> = {}): AreaItem => ({
  qid,
  label: `Item ${qid}`,
  description: null,
  kind: "event",
  category: "conflict",
  start_year: -490,
  end_year: -490,
  loc_confidence: "exact",
  wikipedia_title: null,
  sitelinks: 10,
  ...over,
});
const saved = (qid: string, savedAt = 1, over: Partial<SavedItem> = {}): SavedItem => ({
  item: item(qid),
  list: "events",
  point: [23.97, 38.15],
  range: { from: -500, to: -300 },
  savedAt,
  ...over,
});

describe("parseSaved", () => {
  it("reads back what serializeSaved wrote", () => {
    const list = [saved("Q2", 2), saved("Q1", 1, { list: "others", item: item("Q1", { kind: "birth", wikipedia_title: "Pericles" }) })];
    expect(parseSaved(serializeSaved(list))).toEqual(list);
  });

  it("gives an empty list for nothing stored, for broken JSON, and for something that is not a list", () => {
    expect(parseSaved(null)).toEqual([]);
    expect(parseSaved("")).toEqual([]);
    expect(parseSaved("{not json")).toEqual([]);
    expect(parseSaved('{"qid":"Q1"}')).toEqual([]);
  });

  it("drops a broken record and keeps the rest", () => {
    const good = saved("Q1");
    const raw = JSON.stringify([good, { ...good, item: { ...good.item, qid: "nope" } }, { ...good, range: { from: 0, to: 5 } }, 42]);
    expect(parseSaved(raw)).toEqual([good]);
  });

  it("keeps the first of two records for one item", () => {
    expect(parseSaved(serializeSaved([saved("Q1", 2), saved("Q1", 1)]))).toEqual([saved("Q1", 2)]);
  });
});

describe("toggleSaved, removeSaved, isSaved", () => {
  it("adds a new item first, so the newest is at the top", () => {
    const list = toggleSaved([saved("Q1", 1)], saved("Q2", 2));
    expect(list.map((s) => s.item.qid)).toEqual(["Q2", "Q1"]);
    expect(isSaved(list, "Q2")).toBe(true);
  });

  it("removes an item already saved, wherever it was found", () => {
    const list = toggleSaved([saved("Q1"), saved("Q2")], saved("Q1", 9, { point: [0, 0] }));
    expect(list.map((s) => s.item.qid)).toEqual(["Q2"]);
    expect(isSaved(list, "Q1")).toBe(false);
  });

  it("removes by qid and leaves the list alone when the item is absent", () => {
    const list = [saved("Q1"), saved("Q2")];
    expect(removeSaved(list, "Q1").map((s) => s.item.qid)).toEqual(["Q2"]);
    expect(removeSaved(list, "Q3")).toEqual(list);
  });
});

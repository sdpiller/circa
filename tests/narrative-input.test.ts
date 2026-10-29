import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AreaItem, AreaResult } from "../lib/db/area.ts";
import { buildStoryInput, sourceText } from "../lib/narrative/input.ts";
import { FeaturedListSchema, StoryInputSchema, type FeaturedEntry } from "../lib/narrative/types.ts";

const entry: FeaturedEntry = { id: "athens", place: "Athens", from: -500, to: -300, cell: "851eda77fffffff" };
const meta = { generatedAt: "2026-10-29T00:00:00.000Z", dbRows: 100 };

const item = (n: number, over: Partial<AreaItem> = {}): AreaItem => ({
  qid: `Q${n}`,
  label: `Label ${n}`,
  description: `Description ${n}`,
  kind: "event",
  category: "conflict",
  start_year: -430,
  end_year: -426,
  loc_confidence: "exact",
  wikipedia_title: `Title ${n}`,
  sitelinks: 10,
  ...over,
});

const area = (events: AreaItem[], others: AreaItem[], eventsTotal = events.length, othersTotal = others.length): AreaResult => ({
  cell: entry.cell,
  res: 5,
  acrossKm: 10,
  events,
  eventsTotal,
  others,
  othersTotal,
});

describe("buildStoryInput", () => {
  it("numbers events E1..En and others P1..Pn in area order, capped at 12 and 5", () => {
    const events = Array.from({ length: 15 }, (_, i) => item(i + 1));
    const others = Array.from({ length: 8 }, (_, i) => item(100 + i, { kind: "birth" }));
    const input = buildStoryInput(entry, area(events, others), new Map(), meta);
    const refs = input.items.map((i) => i.ref);
    expect(refs).toEqual([
      ...Array.from({ length: 12 }, (_, i) => `E${i + 1}`),
      ...Array.from({ length: 5 }, (_, i) => `P${i + 1}`),
    ]);
    expect(input.items[0].qid).toBe("Q1");
    expect(input.items[12].qid).toBe("Q100");
    expect(input.eventsTotal).toBe(15);
    expect(input.othersTotal).toBe(8);
  });

  it("writes years with formatRange", () => {
    const input = buildStoryInput(entry, area([item(1, { start_year: -430, end_year: -426 })], []), new Map(), meta);
    expect(input.items[0].years).toBe("430 BCE to 426 BCE");
  });

  it("states the context exactly", () => {
    const events = [item(1), item(2, { loc_confidence: "inherited" }), item(3)];
    const input = buildStoryInput(entry, area(events, [item(9, { kind: "birth" })]), new Map(), meta);
    expect(input.context).toEqual({
      ref: "C",
      text: "This area has 3 documented events and 1 documented people and places in this range. 1 of these 3 events have approximate locations.",
    });
  });

  it("builds source text per ref", () => {
    const events = [item(1), item(2, { loc_confidence: "inherited" })];
    const input = buildStoryInput(entry, area(events, []), new Map([["Q1", "The extract."], ["Q2", null]]), meta);
    expect(sourceText(input, "E1").split("\n")).toEqual(["Label 1", "Description 1", "430 BCE to 426 BCE", "The extract."]);
    expect(sourceText(input, "E1")).not.toContain("approximate location");
    expect(sourceText(input, "E2")).toContain("approximate location");
    expect(sourceText(input, "C")).toBe(input.context.text);
    expect(() => sourceText(input, "E99")).toThrow();
  });

  it("produces something StoryInputSchema accepts", () => {
    const input = buildStoryInput(entry, area([item(1)], [item(2, { kind: "structure" })]), new Map([["Q1", "x"]]), meta);
    expect(() => StoryInputSchema.parse(input)).not.toThrow();
  });
});

describe("stories/featured.json", () => {
  const list = FeaturedListSchema.parse(JSON.parse(readFileSync("stories/featured.json", "utf8")));
  it("has twenty entries with unique ids, ordered by from", () => {
    expect(list).toHaveLength(20);
    expect(new Set(list.map((e) => e.id)).size).toBe(20);
    expect(list.map((e) => e.from)).toEqual([...list.map((e) => e.from)].sort((a, b) => a - b));
  });
});

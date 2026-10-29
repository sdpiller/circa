import { describe, expect, it } from "vitest";
import type { AreaItem, AreaResult } from "../lib/db/area.ts";
import type { PublishedStory } from "../lib/narrative/publish.ts";
import { staleness } from "../lib/narrative/stale.ts";
import type { InputItem, StoryInput } from "../lib/narrative/types.ts";

const ai = (qid: string, label: string, s = -429, e = -427): AreaItem => ({
  qid, label, description: null, kind: "event", category: "conflict", start_year: s, end_year: e,
  loc_confidence: "exact", wikipedia_title: null, sitelinks: 5,
});
const area = (events: AreaItem[]): AreaResult => ({
  cell: "851eda77fffffff", res: 5, acrossKm: 1, events, eventsTotal: events.length, others: [], othersTotal: 0,
});
const ii = (ref: string, qid: string, label: string): InputItem => ({
  ref, qid, label, kind: "event", description: null, years: "429 BCE to 427 BCE", start_year: -429, end_year: -427,
  loc_confidence: "exact", wikipedia_title: null, extract: null,
});
const input: StoryInput = {
  entry: { id: "a", place: "a", from: -500, to: -300, cell: "851eda77fffffff" },
  generatedAt: "t", dbRows: 1, eventsTotal: 2, othersTotal: 0,
  context: { ref: "C", text: "x" }, items: [ii("E1", "Q1", "One"), ii("E2", "Q2", "Two")],
};
const published: PublishedStory = {
  entry: input.entry, writtenAt: "t", writtenBy: "t",
  paragraphs: [[{ text: "x", cites: [{ ref: "E1", qid: "Q1", label: "One" }, { ref: "C", qid: null, label: "this area's lists" }] }]],
};

describe("staleness", () => {
  it("is clean when everything matches", () => {
    const a = area([ai("Q1", "One"), ai("Q2", "Two")]);
    expect(staleness(published, a, a, input)).toEqual({ stale: [], drift: false });
  });
  it("flags a cited qid missing from the box", () => {
    const r = staleness(published, area([ai("Q2", "Two")]), area([ai("Q1", "One"), ai("Q2", "Two")]), input);
    expect(r.stale).toHaveLength(1);
    expect(r.stale[0]).toContain("Q1");
  });
  it("flags a changed label", () => {
    const r = staleness(published, area([ai("Q1", "Uno")]), area([ai("Q1", "Uno"), ai("Q2", "Two")]), input);
    expect(r.stale[0]).toContain("Q1");
  });
  it("flags changed years text", () => {
    const r = staleness(published, area([ai("Q1", "One", -430, -427)]), area([ai("Q1", "One"), ai("Q2", "Two")]), input);
    expect(r.stale[0]).toContain("Q1");
  });
  it("reports drift without stale when only uncited top items differ", () => {
    const box = area([ai("Q1", "One"), ai("Q2", "Two"), ai("Q3", "Three")]);
    const top = area([ai("Q1", "One"), ai("Q3", "Three")]);
    expect(staleness(published, box, top, input)).toEqual({ stale: [], drift: true });
  });
});

import { describe, expect, it } from "vitest";
import type { PublishedStory } from "../lib/narrative/publish.ts";
import { staleness, type CitedNow } from "../lib/narrative/stale.ts";
import type { InputItem, StoryInput } from "../lib/narrative/types.ts";

const now = (qid: string, label: string, over: Partial<CitedNow> = {}): CitedNow => ({
  qid, label, start_year: -429, end_year: -427, loc_confidence: "exact", lat: 10, lon: 20, sitelinks: 5, province_id: "A", ...over,
});
const rows = (...list: CitedNow[]): ReadonlyMap<string, CitedNow> => new Map(list.map((r) => [r.qid, r]));
const ii = (ref: string, qid: string, label: string): InputItem => ({
  ref, qid, label, kind: "event", description: null, years: "429 BCE to 427 BCE", start_year: -429, end_year: -427,
  loc_confidence: "exact", wikipedia_title: null, extract: null,
});
const input: StoryInput = {
  entry: { id: "a", place: "a", from: -500, to: -300, cell: "851eda77fffffff" },
  generatedAt: "t", dbRows: 1, eventsTotal: 2, othersTotal: 0,
  context: { ref: "C", text: "This area has 2 documented events." }, items: [ii("E1", "Q1", "One"), ii("E2", "Q2", "Two")],
};
const cite = (ref: string, qid: string | null, label: string) => ({ ref, qid, label });
const published: PublishedStory = {
  entry: { id: "a", place: "a", from: -500, to: -300 },
  point: [20, 10],
  provinces: ["A"],
  writtenAt: "t",
  writtenBy: "t",
  paragraphs: [[{ text: "x", cites: [cite("E1", "Q1", "One"), cite("C", null, "this area's lists")] }]],
};

describe("staleness", () => {
  it("is clean when everything matches", () => {
    expect(staleness(published, input, rows(now("Q1", "One")))).toEqual({ stale: [], outOfDate: [], warnings: [] });
  });
  it("ignores items the story does not cite", () => {
    const r = staleness(published, input, rows(now("Q1", "One"), now("Q2", "Two", { province_id: null })));
    expect(r).toEqual({ stale: [], outOfDate: [], warnings: [] });
  });
  it("flags a cited qid that is gone", () => {
    const r = staleness(published, input, rows());
    expect(r.stale).toHaveLength(1);
    expect(r.stale[0]).toContain("Q1");
  });
  it("flags a changed label", () => {
    expect(staleness(published, input, rows(now("Q1", "Uno"))).stale[0]).toContain("Q1");
  });
  it("flags changed years text", () => {
    expect(staleness(published, input, rows(now("Q1", "One", { start_year: -430 }))).stale[0]).toContain("Q1");
  });
  it("flags a cited item that lost its province, and does not also report out of date", () => {
    const r = staleness(published, input, rows(now("Q1", "One", { province_id: null })));
    expect(r.stale).toHaveLength(1);
    expect(r.stale[0]).toContain("Q1");
    expect(r.outOfDate).toEqual([]);
  });
  it("reports out of date when the recomputed provinces differ", () => {
    const r = staleness(published, input, rows(now("Q1", "One", { province_id: "Z" })));
    expect(r.stale).toEqual([]);
    expect(r.outOfDate.join(" ")).toContain("provinces");
  });
  it("reports out of date when the recomputed point differs", () => {
    const r = staleness(published, input, rows(now("Q1", "One", { lat: 11 })));
    expect(r.stale).toEqual([]);
    expect(r.outOfDate.join(" ")).toContain("point");
  });
  it("warns, without staleness, when a cited item's location confidence changed", () => {
    const r = staleness(published, input, rows(now("Q1", "One", { loc_confidence: "inherited" })));
    expect(r.stale).toEqual([]);
    expect(r.outOfDate).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("Q1");
    expect(r.warnings[0]).toContain("exact");
    expect(r.warnings[0]).toContain("inherited");
  });
  it("lets a sentence citing only C add nothing", () => {
    const onlyC: PublishedStory = { ...published, paragraphs: [[{ text: "x", cites: [cite("C", null, "this area's lists")] }]] };
    expect(staleness(onlyC, input, rows())).toEqual({ stale: [], outOfDate: [], warnings: [] });
  });
});

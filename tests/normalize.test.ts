import { describe, expect, it } from "vitest";
import rows from "./fixtures/wikidata/battle-rows.json" with { type: "json" };
import { chooseDates, chooseLocation, collectFacts, normalize, parseWktPoint, type DateValue, type LocValue } from "../etl/normalize.ts";
import type { ClassConfig } from "../etl/queries.ts";
import type { Binding } from "../etl/sparql.ts";

const battle: ClassConfig = {
  key: "battle",
  qid: "Q178561",
  label: "battle",
  category: "conflict",
  dateProps: ["P585", "P580", "P582"],
  locProps: ["P625", "P276", "P131"],
  minSitelinks: 1,
};
const birth: ClassConfig = { ...battle, key: "birth", category: "culture", dateProps: ["P569"], locProps: ["P19"] };

const facts = collectFacts(rows.items as Binding[], rows.meta as Binding[], rows.dates as Binding[], rows.locs as Binding[]);
const record = (qid: string) => {
  const r = normalize(battle, facts.get(qid)!);
  if (!r.ok) throw new Error(`${qid} rejected: ${r.reason}`);
  return r.record;
};

describe("real battle rows", () => {
  it("Battle of Marathon: 490 BCE, own coordinates, preferred date", () => {
    const m = record("Q31900");
    expect(m.label).toBe("Battle of Marathon");
    expect([m.startYear, m.endYear, m.origYear, m.yearPrecision]).toEqual([-490, -490, -490, 11]);
    expect(m.locConfidence).toBe("exact");
    expect(m.locSource).toBe("P625");
    expect(m.lat).toBeCloseTo(38.118, 2);
    expect(m.lon).toBeCloseTo(23.978, 2);
  });

  it("Battle of Salamis: 480 BCE, exact", () => {
    const s = record("Q178850");
    expect([s.startYear, s.endYear]).toEqual([-480, -480]);
    expect(s.locConfidence).toBe("exact");
  });

  it("an item with only a P276 place gets an inherited location", () => {
    const d = record("Q233366"); // Second Battle of Drepana
    expect(d.startYear).toBe(-243);
    expect(d.locConfidence).toBe("inherited");
    expect(d.locSource).toBe("P276");
  });
});

const date = (prop: string, year: number, precision = 9, rank: DateValue["rank"] = "normal"): DateValue => ({ prop, year, precision, rank });
const loc = (src: string, place: string, stopped = false, lat = 10, lon = 20): LocValue => ({ src, place, lat, lon, stopped });

describe("chooseDates", () => {
  it("ignores deprecated values, even when they are the only earlier date", () => {
    expect(chooseDates(battle, [date("P585", 79, 11, "deprecated"), date("P585", 80)])).toMatchObject({ start: 80, end: 80 });
  });

  it("returns no-date when every value is deprecated", () => {
    expect(chooseDates(battle, [date("P585", 79, 11, "deprecated")])).toBe("no-date");
  });

  it("uses preferred values over normal ones", () => {
    expect(chooseDates(battle, [date("P585", -491), date("P585", -490, 9, "preferred")])).toMatchObject({ start: -490, end: -490 });
  });

  it("spans disagreeing values of the same rank", () => {
    expect(chooseDates(battle, [date("P585", -491), date("P585", -489)])).toMatchObject({ start: -491, end: -489, origYear: -491 });
  });

  it("prefers P585 over P580 and extends the end with P582", () => {
    expect(chooseDates(battle, [date("P580", -431), date("P582", -404)])).toMatchObject({ start: -431, end: -404 });
    expect(chooseDates(battle, [date("P585", -430), date("P580", -431), date("P582", -404)])).toMatchObject({ start: -430, end: -404 });
  });

  it("widens a century-precision date to the whole century", () => {
    expect(chooseDates(battle, [date("P585", -500, 7)])).toMatchObject({ start: -500, end: -401, origYear: -500, precision: 7 });
  });

  it("ignores an end date that falls before the start (bad data)", () => {
    expect(chooseDates(battle, [date("P580", 1200), date("P582", 1100)])).toMatchObject({ start: 1200, end: 1200 });
  });

  it("returns no-date for an item with only an end date", () => {
    expect(chooseDates(battle, [date("P582", 1100)])).toBe("no-date");
  });
});

describe("chooseLocation", () => {
  it("prefers own coordinates, then P276, then P131", () => {
    expect(chooseLocation(battle, [loc("P131", "Q3"), loc("P276", "Q2"), loc("P625", "Q1")])).toMatchObject({ locSource: "P625", locConfidence: "exact" });
    expect(chooseLocation(battle, [loc("P131", "Q3"), loc("P276", "Q2")])).toMatchObject({ locSource: "P276", locConfidence: "inherited" });
  });

  it("skips stopped (country-like) places and falls through to the next source", () => {
    expect(chooseLocation(battle, [loc("P276", "Q41", true), loc("P131", "Q5")])).toMatchObject({ locSource: "P131" });
  });

  it("returns country-only when every candidate is stopped", () => {
    expect(chooseLocation(battle, [loc("P276", "Q41", true), loc("P131", "Q43", true)])).toBe("country-only");
  });

  it("returns no-location when there are no candidates", () => {
    expect(chooseLocation(battle, [])).toBe("no-location");
  });

  it("picks deterministically among several places and counts them", () => {
    const r = chooseLocation(battle, [loc("P276", "Q900", false, 1, 1), loc("P276", "Q12", false, 2, 2)]);
    expect(r).toMatchObject({ lat: 2, lon: 2, locChoices: 2 });
  });

  it("treats births' P19 birthplace as inherited", () => {
    expect(chooseLocation(birth, [loc("P19", "Q1524")])).toMatchObject({ locSource: "P19", locConfidence: "inherited" });
  });
});

describe("parseWktPoint", () => {
  it("parses lon/lat order", () => {
    expect(parseWktPoint("Point(23.97 38.11)")).toEqual({ lat: 38.11, lon: 23.97 });
  });

  it("rejects coordinates on other globes and out-of-range values", () => {
    expect(parseWktPoint("<http://www.wikidata.org/entity/Q111> Point(10 20)")).toBeNull();
    expect(parseWktPoint("Point(200 10)")).toBeNull();
  });
});

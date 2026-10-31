import { describe, expect, it } from "vitest";
import entityTimes from "./fixtures/wikidata/entity-times.json" with { type: "json" };
import sparqlTimes from "./fixtures/wikidata/sparql-times.json" with { type: "json" };
import {
  astronomicalToHistorical,
  effectiveInterval,
  formatYear,
  historicalToAstronomical,
  midYear,
  overlaps,
  yearCount,
  yearFromEntityTime,
  yearFromSparqlTime,
} from "../lib/time/index.ts";

type SparqlBinding = { item: { value: string }; tStr: { value: string } };

function sparqlYearsFor(qid: string): number[] {
  const all = [...sparqlTimes.dayPrecision, ...sparqlTimes.yearPrecision] as SparqlBinding[];
  return all
    .filter((b) => b.item.value.endsWith(`/${qid}`))
    .map((b) => yearFromSparqlTime(b.tStr.value));
}

function entityYearsFor(qid: string): number[] {
  const item = (entityTimes as unknown as Record<string, { claims: Record<string, { value: { time: string } }[]> }>)[qid];
  return Object.values(item.claims).flat().map((c) => yearFromEntityTime(c.value.time));
}

describe("year numbering conversion", () => {
  it("maps astronomical years to historical years with no year zero", () => {
    expect(astronomicalToHistorical(1)).toBe(1);
    expect(astronomicalToHistorical(0)).toBe(-1);
    expect(astronomicalToHistorical(-1)).toBe(-2);
    expect(astronomicalToHistorical(-489)).toBe(-490);
  });

  it("round-trips through astronomical numbering", () => {
    for (const y of [-3500, -490, -2, -1, 1, 2, 79, 1453, 2026]) {
      expect(astronomicalToHistorical(historicalToAstronomical(y))).toBe(y);
    }
  });

  it("rejects year zero as a historical year", () => {
    expect(() => historicalToAstronomical(0)).toThrow();
  });
});

describe("known events, from live Wikidata fixtures", () => {
  // Each event is checked through BOTH encodings. They must agree.
  const cases: [string, string, number[]][] = [
    ["Battle of Marathon", "Q31900", [-490]],
    ["Battle of Salamis", "Q178850", [-480]],
    ["eruption of Mount Vesuvius in 79", "Q2411998", [79]],
    ["Fall of Constantinople", "Q160077", [1453]],
  ];

  for (const [label, qid, expected] of cases) {
    it(`${label} (${qid}) from entity JSON`, () => {
      expect(new Set(entityYearsFor(qid))).toEqual(new Set(expected));
    });
    it(`${label} (${qid}) from SPARQL`, () => {
      expect(new Set(sparqlYearsFor(qid))).toEqual(new Set(expected));
    });
  }

  it("year-precision BCE battles agree across both encodings", () => {
    // These are stored as e.g. -0212-00-00 in entity JSON and -0211-01-01 in SPARQL.
    for (const qid of ["Q233363", "Q204343", "Q233386", "Q233352", "Q195881", "Q233344", "Q233366", "Q223220"]) {
      expect(sparqlYearsFor(qid)).toEqual(entityYearsFor(qid));
    }
  });
});

describe("parsing time strings", () => {
  it("parses entity JSON times with a sign and zeroed month/day", () => {
    expect(yearFromEntityTime("-0490-00-00T00:00:00Z")).toBe(-490);
    expect(yearFromEntityTime("+1453-05-29T00:00:00Z")).toBe(1453);
    expect(yearFromEntityTime("-13798000000-00-00T00:00:00Z")).toBe(-13798000000);
  });

  it("parses SPARQL xsd:dateTime strings with or without a sign", () => {
    expect(yearFromSparqlTime("0079-08-22T00:00:00Z")).toBe(79);
    expect(yearFromSparqlTime("0000-01-01T00:00:00Z")).toBe(-1);
    expect(yearFromSparqlTime("-0489-08-07T00:00:00Z")).toBe(-490);
  });

  it("rejects malformed strings", () => {
    expect(() => yearFromSparqlTime("not a date")).toThrow();
    expect(() => yearFromEntityTime("+0000-00-00T00:00:00Z")).toThrow();
  });
});

describe("effective interval by precision", () => {
  // Expected values match Wikibase's own formatter (wbformatvalue), checked 2026-10-28.
  it("year precision and finer is a single year", () => {
    expect(effectiveInterval(-490, 9)).toEqual({ start: -490, end: -490 });
    expect(effectiveInterval(1453, 11)).toEqual({ start: 1453, end: 1453 });
  });

  it("decade precision floors to the decade", () => {
    expect(effectiveInterval(1450, 8)).toEqual({ start: 1450, end: 1459 });
    expect(effectiveInterval(1459, 8)).toEqual({ start: 1450, end: 1459 });
    expect(effectiveInterval(-490, 8)).toEqual({ start: -499, end: -490 }); // "490s BCE"
    expect(effectiveInterval(-499, 8)).toEqual({ start: -499, end: -490 });
    expect(effectiveInterval(-500, 8)).toEqual({ start: -509, end: -500 }); // "500s BCE"
    expect(effectiveInterval(5, 8)).toEqual({ start: 1, end: 9 }); // no year zero
    expect(effectiveInterval(-1, 8)).toEqual({ start: -9, end: -1 });
  });

  it("century precision uses ceil, so 1900 is the 19th century", () => {
    expect(effectiveInterval(-500, 7)).toEqual({ start: -500, end: -401 }); // 5th c. BCE
    expect(effectiveInterval(-401, 7)).toEqual({ start: -500, end: -401 });
    expect(effectiveInterval(-400, 7)).toEqual({ start: -400, end: -301 }); // 4th c. BCE
    expect(effectiveInterval(-1, 7)).toEqual({ start: -100, end: -1 });
    expect(effectiveInterval(1, 7)).toEqual({ start: 1, end: 100 });
    expect(effectiveInterval(100, 7)).toEqual({ start: 1, end: 100 });
    expect(effectiveInterval(101, 7)).toEqual({ start: 101, end: 200 });
    expect(effectiveInterval(1900, 7)).toEqual({ start: 1801, end: 1900 });
    expect(effectiveInterval(1901, 7)).toEqual({ start: 1901, end: 2000 });
  });

  it("millennium precision uses ceil", () => {
    expect(effectiveInterval(-3000, 6)).toEqual({ start: -3000, end: -2001 });
    expect(effectiveInterval(-2001, 6)).toEqual({ start: -3000, end: -2001 });
    expect(effectiveInterval(1000, 6)).toEqual({ start: 1, end: 1000 });
    expect(effectiveInterval(1001, 6)).toEqual({ start: 1001, end: 2000 });
  });

  it("rejects year zero and unknown precisions", () => {
    expect(() => effectiveInterval(0, 9)).toThrow();
    expect(() => effectiveInterval(100, 15)).toThrow();
  });
});

describe("range overlap", () => {
  const fifthCenturyBce = effectiveInterval(-450, 7); // -500..-401

  it("matches an event whose interval only partly overlaps the range", () => {
    expect(overlaps(fifthCenturyBce, { from: -420, to: -300 })).toBe(true);
    expect(overlaps(fifthCenturyBce, { from: -600, to: -500 })).toBe(true); // touches start
  });

  it("does not match a disjoint range", () => {
    expect(overlaps(fifthCenturyBce, { from: -400, to: -300 })).toBe(false);
  });

  it("matches a range fully inside the event interval", () => {
    expect(overlaps(fifthCenturyBce, { from: -480, to: -470 })).toBe(true);
  });
});

describe("formatYear", () => {
  it("formats BCE and CE years", () => {
    expect(formatYear(-490)).toBe("490 BCE");
    expect(formatYear(79)).toBe("79 CE");
  });
});

describe("yearCount", () => {
  it("counts inclusively and skips year 0", () => {
    expect(yearCount(-100, 100)).toBe(200);
    expect(yearCount(5, 5)).toBe(1);
    expect(yearCount(-1, 1)).toBe(2);
  });
});

describe("midYear", () => {
  it("takes the middle of a range", () => {
    expect(midYear(-500, -300)).toBe(-400);
    expect(midYear(5, 5)).toBe(5);
  });

  it("never returns year 0", () => {
    expect(midYear(-100, 100)).not.toBe(0);
    expect(midYear(-1, 1)).not.toBe(0);
    expect(midYear(-2, -1)).not.toBe(0);
  });
});

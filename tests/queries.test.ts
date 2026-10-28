import { describe, expect, it } from "vitest";
import { facetQuery, membershipQuery, type ClassConfig } from "../etl/queries.ts";

const base: ClassConfig = { key: "battle", qid: "Q178561", label: "battle", category: "conflict", kind: "event", dateProps: ["P585", "P580"], locProps: ["P625", "P276"], minSitelinks: 1 };
const discovery: ClassConfig = {
  ...base,
  key: "discovery",
  qid: null,
  kind: "discovery",
  dateProps: ["P575"],
  locProps: ["P189", "P625"],
  memberPattern: "{ ?item wdt:P189 ?findSpot } UNION { ?item wdt:P625 ?coord }",
  ownCoordsFilter: "FILTER NOT EXISTS { ?item wdt:P195 ?collection }",
};

describe("membershipQuery", () => {
  it("uses the subclass closure of the root class", () => {
    expect(membershipQuery(base)).toContain("?item wdt:P31/wdt:P279* wd:Q178561 .");
  });

  it("uses memberPattern for a property-defined group, not a class", () => {
    const q = membershipQuery(discovery);
    expect(q).not.toContain("wdt:P31");
    expect(q).toContain("?item wdt:P189 ?findSpot");
    expect(q).toContain("?item wdt:P575 ?anyDate .");
  });

  it("refuses a class with neither qid nor memberPattern", () => {
    expect(() => membershipQuery({ ...discovery, memberPattern: undefined })).toThrow();
  });
});

describe("facetQuery locs", () => {
  it("applies ownCoordsFilter to the own-coordinates branch only, and only when configured", () => {
    expect(facetQuery(discovery, "locs", ["Q1"], [])).toContain("FILTER NOT EXISTS { ?item wdt:P195 ?collection }");
    expect(facetQuery(base, "locs", ["Q1"], [])).not.toContain("P195");
  });
});

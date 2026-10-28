import { describe, expect, it } from "vitest";
import { membershipQuery, type ClassConfig } from "../etl/queries.ts";

const base: ClassConfig = { key: "battle", qid: "Q178561", label: "battle", category: "conflict", kind: "event", dateProps: ["P585", "P580"], locProps: ["P625", "P276"], minSitelinks: 1 };

describe("membershipQuery", () => {
  it("uses the subclass closure of the root class", () => {
    expect(membershipQuery(base)).toContain("?item wdt:P31/wdt:P279* wd:Q178561 .");
  });

  it("defines a property-based group (discovery) by its properties, not a class", () => {
    const q = membershipQuery({ ...base, key: "discovery", qid: null, kind: "discovery", dateProps: ["P575"], locProps: ["P189"] });
    expect(q).not.toContain("wdt:P31");
    expect(q).toContain("?item wdt:P189 ?anyP189 .");
    expect(q).toContain("?item wdt:P575 ?anyDate .");
  });
});

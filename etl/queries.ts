/**
 * SPARQL builders for the fetch stage, in two steps (see docs/decisions.md, entry 15):
 * 1. membership: which items are in a class, with sitelink counts. One query per class.
 * 2. facets (meta, dates, locs): per-item details, looked up in chunks of explicit QIDs.
 *    Facets are separate queries so multi-valued properties never multiply rows.
 *
 * Shape matters on WDQS (Blazegraph): an outer VALUES ?item with UNION branches can make it
 * evaluate each branch over all of Wikidata first. The dates facet therefore binds its
 * predicates through VALUES instead of UNION (1 s instead of a 60 s timeout, measured).
 */
import type { EndpointName } from "./sparql.ts";

export type ClassConfig = {
  key: string;
  qid: string;
  label: string;
  category: string;
  dateProps: string[];
  locProps: string[];
  minSitelinks: number;
  subclassClosure?: boolean;
  candidate?: boolean;
  membershipEndpoint?: EndpointName;
};

export type Facet = "meta" | "dates" | "locs" | "labels";
/** "labels" runs last and only for items whose meta has no English label (see fetch.ts). */
export const FACETS: Facet[] = ["meta", "dates", "locs", "labels"];

export function membershipQuery(c: ClassConfig): string {
  const path = c.subclassClosure === false ? "wdt:P31" : "wdt:P31/wdt:P279*";
  const anyDate = c.dateProps.map((p) => `wdt:${p}`).join("|");
  // A plain join + DISTINCT, not FILTER EXISTS: on QLever the join is much cheaper
  // (settlements: 15 s, versus repeated timeouts and an out-of-memory error with FILTER EXISTS).
  return `SELECT DISTINCT ?item ?sl WHERE {
  ?item ${path} wd:${c.qid} .
  ?item ${anyDate} ?anyDate .
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${c.minSitelinks})
}`;
}

export function facetQuery(c: ClassConfig, facet: Facet, qids: string[], stoplist: string[]): string {
  const values = `VALUES ?item { ${qids.map((q) => `wd:${q}`).join(" ")} }`;
  switch (facet) {
    case "meta":
      return `SELECT ?item ?label ?desc ?enwiki WHERE {
  ${values}
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "en") }
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "en") }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enwiki }
}`;
    case "dates": {
      const preds = c.dateProps.map((p) => `(p:${p} psv:${p} "${p}")`).join(" ");
      return `SELECT ?item ?prop ?t ?prec ?rank WHERE {
  ${values}
  VALUES (?p ?psv ?prop) { ${preds} }
  ?item ?p ?st . ?st ?psv ?node ; wikibase:rank ?rank .
  ?node wikibase:timeValue ?t ; wikibase:timePrecision ?prec .
}`;
    }
    case "locs": {
      const branches = c.locProps.map((p) =>
        p === "P625"
          ? `{ ?item wdt:P625 ?coord . BIND(?item AS ?place) BIND("P625" AS ?src) }`
          : `{ ?item wdt:${p} ?place . ?place wdt:P625 ?coord . BIND("${p}" AS ?src) }`,
      );
      const stops = stoplist.map((q) => `wd:${q}`).join(" ");
      return `SELECT ?item ?src ?place ?coord ?stop WHERE {
  ${values}
  ${branches.join(" UNION ")}
  OPTIONAL { VALUES ?stop { ${stops} } ?place wdt:P31/wdt:P279* ?stop . }
}`;
    }
    case "labels":
      // Every language, including "mul" (Wikidata's language-neutral default label).
      return `SELECT ?item ?label WHERE {
  ${values}
  ?item rdfs:label ?label .
}`;
  }
}

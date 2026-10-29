/**
 * How API dots look on the globe: legend groups, colours, and the GeoJSON the map layer draws.
 *
 * Colour encodes four groups, not the seven categories (decisions.md entry 26): on a map every pair
 * of colours can sit side by side, and at most four colours stay distinct for colour-blind readers
 * on the dark basemap. Events get three vivid hues; foundings, structures, and births share one
 * gray, so the events the narrative is about stand out from their context.
 */
import type { Dot } from "./db/events.ts";
import { formatRange } from "./time/index.ts";

export const DOT_GROUPS = [
  { key: "conflict", label: "Conflict", color: "#d55181" },
  { key: "disaster", label: "Disaster", color: "#3987e5" },
  { key: "society", label: "Politics, society, science", color: "#008300" },
  { key: "context", label: "Places and people", color: "#a3a29b" },
] as const;
export type GroupKey = (typeof DOT_GROUPS)[number]["key"];

export function groupOf(d: Pick<Dot, "kind" | "category">): GroupKey {
  if (d.kind === "event") return d.category === "conflict" || d.category === "disaster" ? d.category : "society";
  return d.kind === "discovery" ? "society" : "context";
}

/** What an item's date means, for the dot tooltip and the area box's hover card. */
export function what(d: Pick<Dot, "kind" | "category">): string {
  switch (d.kind) {
    case "event":
      return d.category;
    case "founding":
      return "founded";
    case "structure":
      return "dated"; // inception is sometimes a rebuild, so never "built"
    case "birth":
      return "born here";
    case "discovery":
      return "discovered here";
  }
}

export type DotProperties = {
  qid: string;
  label: string;
  group: GroupKey;
  approx: boolean;
  years: string;
  what: string;
  sortKey: number;
  sitelinks: number; // picks which members of a stack get a web leg
};

/** The tooltip's second line, shared by the map tooltip and the web's leg tooltip. */
export function dotMeta(p: Pick<DotProperties, "years" | "what" | "approx">): string {
  return [p.years, p.what, p.approx ? "approximate location" : null].filter(Boolean).join(" · ");
}
export type DotFeatureCollection = {
  type: "FeatureCollection";
  features: { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: DotProperties }[];
};

// Draw order: context beneath events, then by notability, so a famous event is never hidden.
const EVENT_LAYER = 1_000_000;

export function toFeatureCollection(dots: Dot[]): DotFeatureCollection {
  return {
    type: "FeatureCollection",
    features: dots.map((d) => {
      const group = groupOf(d);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [d.lon, d.lat] },
        properties: {
          qid: d.qid,
          label: d.label,
          group,
          approx: d.loc_confidence === "inherited",
          years: formatRange(d.start_year, d.end_year),
          what: what(d),
          sortKey: (group === "context" ? 0 : EVENT_LAYER) + d.sitelinks,
          sitelinks: d.sitelinks,
        },
      };
    }),
  };
}

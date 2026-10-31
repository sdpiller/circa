/** How an area item is described: what its date means, and the one-line meta under a name. */
import type { AreaItem } from "./db/area.ts";

/** What an item's date means, for the area box's hover card. */
export function what(d: Pick<AreaItem, "kind" | "category">): string {
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

export function itemMeta(p: { years: string; what: string; approx: boolean }): string {
  return [p.years, p.what, p.approx ? "approximate location" : null].filter(Boolean).join(" · ");
}

/**
 * /circa/preview: the plate samarchive.com shows for Circa on its front page, in a same-origin iframe (Circa's
 * pages are served there through a rewrite). samarchive's rule is that a plate shows a live preview the thing
 * renders of itself, never a screenshot (decisions.md entry 35). Not for search engines.
 */
import type { Metadata } from "next";
import { PUBLISHED } from "../../lib/stories/catalog.ts";
import { GlobePreview, type PreviewPlace } from "../ui/GlobePreview.tsx";
import { styleUrl } from "../ui/style-url.ts";

export const metadata: Metadata = { title: "Circa", robots: { index: false, follow: false } };

/** Six stories spread around the world, visited in this order. */
const IDS = ["athens", "baghdad", "kyoto", "isandlwana", "cusco", "tenochtitlan"];

const places: PreviewPlace[] = IDS.map((id) => {
  const s = PUBLISHED.find((p) => p.entry.id === id);
  if (!s) throw new Error(`No published story ${id}`);
  return { lon: s.point[0], lat: s.point[1], from: s.entry.from, to: s.entry.to };
});

export default function Preview() {
  return <GlobePreview styleUrl={styleUrl()} places={places} />;
}

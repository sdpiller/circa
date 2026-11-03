/**
 * The basemap recoloured to cream, shared by the globe and its preview. Map paint values match the palette in
 * globals.css and spec 3.2. Each call is guarded: a custom BASEMAP_STYLE_URL may lack a layer or property, and
 * must not throw.
 */
import type { Map as MapLibreMap } from "maplibre-gl";

export const LAND = "#f8f4ea";
export const WATER = "#e3ded2";
export const LINE = "#cfc8ba";
export const ROAD = "#e6e0d3";
export const INK = "#241f1a";
export const MUTED = "#7f786e";
export const ACCENT = "#5140a4";

const COUNTRY_LABELS = ["label_country_1", "label_country_2", "label_country_3"];

export function paintCream(m: MapLibreMap) {
  const paint = (id: string, prop: string, value: unknown) => {
    if (m.getLayer(id)) m.setPaintProperty(id, prop as never, value as never);
  };
  for (const l of m.getStyle().layers) {
    if (l.type === "line" && "source" in l && l.source === "openmaptiles") paint(l.id, "line-color", ROAD);
    if (l.type === "fill" && l.id !== "water") paint(l.id, "fill-color", LAND);
    if (l.type === "symbol") {
      paint(l.id, "text-color", MUTED);
      paint(l.id, "text-halo-color", LAND);
      paint(l.id, "text-halo-width", 1.2);
    }
  }
  paint("background", "background-color", LAND);
  paint("water", "fill-color", WATER);
  for (const id of ["boundary_2", "boundary_3", "boundary_disputed"]) paint(id, "line-color", LINE);
  for (const id of COUNTRY_LABELS) paint(id, "text-color", INK);
}

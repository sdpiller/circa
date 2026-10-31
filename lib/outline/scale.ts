/** Quiet line shown under a name that comes from historical-basemaps. */
export const ATLAS_LINE = "A broad label from a historical atlas.";

/** Scale line for the panel. Areas are rounded to two significant figures. */
export function scaleLine(s: { kind: "historical" | "modern"; areaKm2: number; capped: boolean }): string {
  const area = Number(s.areaKm2.toPrecision(2)).toLocaleString("en-US");
  const how = s.kind === "historical" ? "approximate, built from modern provinces" : "modern borders";
  return `about ${area} km², ${how}${s.capped ? ", within 800 km" : ""}`;
}

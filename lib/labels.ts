/**
 * Names by zoom (spec 3.3). MapLibre's globe lowers getZoom() as the camera leaves the equator, to hold the
 * globe's size on screen, so a plain zoom threshold would fire during a pan. apparentZoom does not move.
 */

/** Group thresholds in apparent zoom, and the basemap layers each one shows. */
export const LABEL_GROUPS: { at: number; layers: string[] }[] = [
  { at: 3.15, layers: ["label_country_1", "label_country_2", "label_country_3"] },
  { at: 3.9, layers: ["water_name_point_label", "water_name_line_label"] },
  { at: 5.2, layers: ["label_city_capital"] },
  { at: 6.0, layers: ["label_city", "label_state"] },
  { at: 8.0, layers: ["label_town"] },
  { at: 10.5, layers: ["label_village"] },
  { at: 12.0, layers: ["label_other", "waterway_line_label"] },
];

export const FADE_MS = 320;

const DEAD_BAND = 0.08;

export function apparentZoom(zoom: number, lat: number): number {
  return zoom - Math.log2(Math.max(Math.cos((lat * Math.PI) / 180), 0.05));
}

/** Whether a group should be on. A dead band either side of the threshold stops a slow zoom from flickering. */
export function labelGroupOn(wasOn: boolean, apparent: number, at: number): boolean {
  return wasOn ? apparent >= at - DEAD_BAND : apparent >= at + DEAD_BAND;
}

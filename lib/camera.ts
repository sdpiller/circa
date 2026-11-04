/**
 * Framing an outline in the part of the map the panel and the dates leave free. Worked out on the sphere, not
 * with cameraForBounds: that answers from the map's current padding and center, so one area at one window size
 * landed up to half a zoom level apart depending on what came before, even when asked only for the padding the
 * map did not yet hold. Here the answer depends on the bounds and the window alone.
 */

/** Room the dates take at the bottom of the map. The same value as --range-h in globe.module.css. Measured: 169.3. */
export const RANGE_H = 170;

/** Space kept between an outline's bounds and the edges of the free area. A narrow window keeps 6% of its width a side. */
const MARGIN_X = 60;
const MARGIN_X_SHARE = 0.06;
const MARGIN_Y = 45;

/** A click never zooms in further than this, or out past it (spec 5.6). */
export const MIN_FLY_ZOOM = 1.9;
export const MAX_FLY_ZOOM = 6.2;

/** Room other things take at the map's edges, in pixels: the camera centres the outline in what is left. */
export type Insets = { top: number; right: number; bottom: number };

const TILE_SIZE = 512;
/** Steps along each side of the bounds. On a sphere the widest point of a box need not be a corner. */
const SAMPLES = 8;

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The camera for a box [west, south, east, north], whose west may run past -180 and east past 180. The box is
 * seen from above its middle, as fractions of the globe's radius; the globe's radius in pixels that fits it in
 * the free area gives the zoom, through MapLibre's own relation (globe_utils.ts, getGlobeRadiusPixels):
 * radius = 512 * 2^zoom / (2 * PI * cos(latitude)). This leaves out perspective, which only draws the far parts
 * of a very large box inward, so the error is a little extra margin.
 */
export function frameOutline(
  bounds: [number, number, number, number],
  view: { width: number; height: number; insets: Insets },
): { center: [number, number]; zoom: number } {
  const [west, south, east, north] = bounds;
  const lon0 = (west + east) / 2;
  const lat0 = (south + north) / 2;

  let across = 0;
  let down = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    const dLon = rad(west + ((east - west) * i) / SAMPLES - lon0);
    for (let j = 0; j <= SAMPLES; j++) {
      const lat = rad(south + ((north - south) * j) / SAMPLES);
      across = Math.max(across, Math.abs(Math.cos(lat) * Math.sin(dLon)));
      down = Math.max(down, Math.abs(Math.cos(rad(lat0)) * Math.sin(lat) - Math.sin(rad(lat0)) * Math.cos(lat) * Math.cos(dLon)));
    }
  }

  const { top, right, bottom } = view.insets;
  const freeWidth = view.width - right - 2 * Math.min(MARGIN_X, view.width * MARGIN_X_SHARE);
  const freeHeight = view.height - top - bottom - 2 * MARGIN_Y;
  const radius = Math.min(freeWidth / 2 / across, freeHeight / 2 / down);
  const zoom = radius > 0 ? Math.log2((radius * 2 * Math.PI * Math.cos(rad(lat0))) / TILE_SIZE) : MIN_FLY_ZOOM;
  return { center: [lon0, lat0], zoom: Math.max(MIN_FLY_ZOOM, Math.min(MAX_FLY_ZOOM, zoom)) };
}

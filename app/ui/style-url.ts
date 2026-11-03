/** OpenFreeMap: free, no API key, no request limits, attribution required (shown by MapLibre and in the footer). */
const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** The basemap style. Read at build time, so rebuild after changing BASEMAP_STYLE_URL. */
export const styleUrl = () => process.env.BASEMAP_STYLE_URL || DEFAULT_STYLE_URL;

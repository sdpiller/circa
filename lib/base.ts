/**
 * The path Circa is served under: samarchive.com/circa (docs/PLAN.md Phase 7). Next.js prefixes its own pages
 * and assets with it; URLs the browser builds by hand, like the API calls in lib/box.ts, must add it themselves.
 */
export const BASE_PATH = "/circa";

/** The processed historical-basemaps outlines, written to public/open-data/ by npm run open-data (GPL-3.0). */
export const OUTLINES_FILE = "historical-basemaps-processed.geojson.gz";

/** Where visitors reach Circa. The project's own vercel.app address serves the same pages, so pages name this one as canonical. */
export const PUBLIC_URL = "https://samarchive.com/circa";

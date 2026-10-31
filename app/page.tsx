import { GlobeApp } from "./ui/GlobeApp.tsx";

/** OpenFreeMap: free, no API key, no request limits, attribution required (shown by MapLibre and in the footer). */
const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export default function Home() {
  return <GlobeApp styleUrl={process.env.BASEMAP_STYLE_URL || DEFAULT_STYLE_URL} />;
}

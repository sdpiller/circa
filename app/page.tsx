import { GlobeApp } from "./ui/GlobeApp.tsx";
import { styleUrl } from "./ui/style-url.ts";

export default function Home() {
  return <GlobeApp styleUrl={styleUrl()} />;
}

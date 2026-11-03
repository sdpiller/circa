import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/base.ts";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  basePath: BASE_PATH,
  // The bare root goes to the app: on localhost and on the project's own vercel.app address.
  async redirects() {
    return [{ source: "/", destination: BASE_PATH, basePath: false, permanent: false }];
  },
  // The read-only database is a file next to the code, not a server: every route that opens it ships it.
  outputFileTracingIncludes: {
    "/api/area": ["./data/circa.db"],
    "/api/outline": ["./data/circa.db"],
    "/api/summary": ["./data/circa.db"],
  },
};

export default nextConfig;

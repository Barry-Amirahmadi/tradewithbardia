import type { NextConfig } from "next";

/**
 * The deployment target is GitHub Pages: a static file host with no Node
 * runtime, no request-time rendering and no image optimizer.
 *
 * Nothing had to be given up to go there. The product has no API route, no
 * server action, no middleware, and never reads `cookies()` or `headers()`;
 * every dynamic segment sets `dynamicParams = false`, so the whole route tree
 * is enumerable at build time. The journal persists to `localStorage` by
 * design — the privacy boundary in `lib/journal/repository.ts` means there is
 * no server for it to want. 94 routes prerender.
 */
const nextConfig: NextConfig = {
  /**
   * Emit a directory of files instead of a server. `next start` no longer
   * applies; serve `out/` with any static server to preview a production
   * build locally.
   */
  output: "export",

  /**
   * The site is a project page at `barry-amirahmadi.github.io/tradewithbardia/`,
   * not a user page at the domain root, so every asset and route URL carries
   * this prefix.
   *
   * Deliberately unconditional rather than gated on an environment variable:
   * `next dev` then serves under the same prefix as production, so a path bug
   * that only appears behind a basePath shows up on the first local load
   * instead of after a deploy. `<Link>` and the router apply it automatically;
   * a hand-written absolute `<a href="/...">` would not, which is why there
   * are none.
   */
  basePath: "/tradewithbardia",

  /**
   * Static hosts serve a directory by its `index.html`. Without this, export
   * writes `/fa/setups.html`, which GitHub Pages will not serve at
   * `/fa/setups` — the route 404s while the file exists.
   */
  trailingSlash: true,

  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    /**
     * The optimizer is a server. There is none — and nothing to optimize:
     * the product imports `next/image` zero times and ships no raster assets.
     * Required by `output: "export"` regardless, so it is set explicitly
     * rather than left for the build to complain about.
     */
    unoptimized: true,
    // Kept for a future asset pipeline (docs/architecture.md §Assets).
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;

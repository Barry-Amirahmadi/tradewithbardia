import { Inter, JetBrains_Mono, Vazirmatn } from "next/font/google";

import "./globals.css";

import { themeInitScript } from "@/lib/theme";

import type { Metadata } from "next";

/**
 * The document shell — master prompt §14, §70.
 *
 * This exists so there is a root layout OUTSIDE the `[locale]` segment. When
 * `app/[locale]/layout.tsx` was the root, Next had no styled shell to render a
 * not-found into: an unmatched path fell through to the framework's internal
 * error document, which loads none of the application's CSS. The branded 404
 * was, in production and in dev alike, an unstyled blank page whose copy
 * existed only in the RSC payload. Verified before and after.
 *
 * `lang` and `dir` are NOT set here, because a layout above the locale segment
 * cannot know the locale, and a wrong `lang` is worse than an absent one. They
 * are set on the wrapper in `app/[locale]/layout.tsx` instead, which is where
 * the locale is actually known. Both attributes drive bidi and assistive
 * technology from any element, not only from `<html>`.
 */

/**
 * The one place the deployed origin is written down.
 *
 * Every page builds its canonical and hreflang URLs as a root-relative path —
 * `/fa/academy` — which the Metadata API resolves against this base. Without
 * it Next emits those paths verbatim, and `basePath` is NOT applied to
 * metadata the way it is to `<Link>`: the tags pointed at
 * `barry-amirahmadi.github.io/fa`, a path on the user page that belongs to a
 * different project entirely. Navigation was unaffected, so nothing looked
 * broken — only crawlers would have followed it.
 *
 * The base carries the `/tradewithbardia` prefix because the site is a project
 * page, not the domain root. Next joins the two pathnames rather than letting
 * the leading slash escape to the origin.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://barry-amirahmadi.github.io/tradewithbardia"),
};

/**
 * Fonts are self-hosted at build time by next/font — no runtime request to
 * Google, no third-party connection on the critical path, and no layout shift
 * from a late swap (§8, §47).
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  variable: "--font-vazirmatn",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      className={`${inter.variable} ${vazirmatn.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Parse-blocking by design: it has to run before the first paint or
            the visitor sees a flash of the theme they did not choose. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

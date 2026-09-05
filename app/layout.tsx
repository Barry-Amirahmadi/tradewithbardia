import { Inter, JetBrains_Mono, Vazirmatn } from "next/font/google";

import "./globals.css";

import { themeInitScript } from "@/lib/theme";

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

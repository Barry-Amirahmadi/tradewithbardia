import { NextResponse, type NextRequest } from "next/server";

import { defaultLocale, isLocale, locales } from "@/lib/i18n/config";

/**
 * Every page lives under a locale — master prompt §17.
 *
 * A URL without one is not a page, it is a request that has not been resolved
 * yet, so it redirects rather than rendering. That keeps `/fa/...` and
 * `/en/...` as the only canonical shapes, which is what makes the hreflang
 * pairs in generateMetadata honest.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const first = pathname.split("/")[1] ?? "";
  // Already localised: pass through untouched. Deliberately no header
  // stamping — reading a request header in a page is what forced the whole
  // locale tree to render dynamically. Locale reaches components through the
  // route segment, and reaches `not-found.tsx` through `<html lang>`.
  if (isLocale(first)) return NextResponse.next();

  const locale = negotiate(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

/**
 * Deliberately simple: honour a clear preference for a supported language,
 * otherwise fall through to the default. Quality values are parsed but a full
 * RFC 4647 lookup would be more machinery than two locales justify.
 */
function negotiate(header: string | null): string {
  if (header === null) return defaultLocale;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q === undefined ? 1 : Number.parseFloat(q.split("=")[1] ?? "1");
      return { tag: tag.trim().toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0] ?? "";
    const match = locales.find((locale) => locale === base);
    if (match !== undefined) return match;
  }

  return defaultLocale;
}

export const config = {
  // Static assets and API routes have no locale and must not be rewritten.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

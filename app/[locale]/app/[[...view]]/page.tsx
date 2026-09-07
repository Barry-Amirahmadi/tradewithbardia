import type { Metadata } from "next";
import { notFound } from "next/navigation";

import JournalApp from "@/components/journal/app/JournalApp";
import { isLocale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { appViews, isAppView, type AppView } from "@/lib/journal/views";

/**
 * THE PRIVATE APPLICATION SHELL — master prompt §14, §24, §25, §42.
 *
 * One catch-all route, statically generated once per view, rendering **no
 * records at all**. Everything the user sees arrives in the browser from the
 * repository; the prerendered HTML contains the chrome and nothing else.
 *
 * That is the privacy boundary, and it is structural rather than procedural:
 * there is no server render of user data to leak, no RSC payload carrying
 * records, and nothing for a crawler to index even if it ignored the robots
 * directive. A future backend changes `TradeRepository`, not this file.
 *
 * `noindex, nofollow` because an application shell is not content. The public
 * product page at `/journal` is the indexable surface (§42).
 */

export const dynamicParams = false;

export function generateStaticParams() {
  // The four known views, plus the bare `/app` root. Never a route per record:
  // trade ids are user data and are addressed by URL fragment instead.
  return locales.flatMap((locale) => [
    { locale, view: [] as string[] },
    ...appViews.map((view) => ({ locale, view: [view] })),
  ]);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dictionary = await getDictionary(locale);
  return {
    title: `${dictionary.journal.app.title} — ${dictionary.nav.brand}`,
    robots: { index: false, follow: false },
  };
}

export default async function AppPage({
  params,
}: {
  params: Promise<{ locale: string; view?: string[] }>;
}) {
  const { locale, view } = await params;
  if (!isLocale(locale)) notFound();

  const segment = view?.[0];
  // A bare `/app` is the dashboard; anything unrecognised is a routing miss.
  const active: AppView =
    segment === undefined ? "dashboard" : isAppView(segment) ? segment : "dashboard";
  if (segment !== undefined && !isAppView(segment)) notFound();
  if ((view?.length ?? 0) > 1) notFound();

  const dictionary = await getDictionary(locale);

  return (
    <JournalApp
      locale={locale}
      view={active}
      journal={dictionary.journal}
      concepts={dictionary.concepts}
      lab={dictionary.lab}
      dict={dictionary.dict}
    />
  );
}

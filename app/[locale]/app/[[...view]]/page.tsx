import type { Metadata } from "next";
import { notFound } from "next/navigation";

import JournalApp from "@/components/journal/app/JournalApp";
import { isLocale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { journalLab } from "@/lib/journal/lab-view";
import { appScreenSegments, resolveAppScreen } from "@/lib/journal/views";

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
  // Every application screen, and nothing else. `appScreenSegments` is the same
  // array the resolver reads, so a screen cannot be routable without also being
  // prerendered — the failure that only shows up in the exported build.
  //
  // NEVER A ROUTE PER RECORD (§34). `/app/trades/new` is a screen and carries no
  // id; a trade being created does not have one yet. Every existing trade is
  // addressed by URL fragment, which is never sent to a server and therefore
  // cannot appear in the route manifest, an access log or a crawl.
  return locales.flatMap((locale) =>
    appScreenSegments.map((view) => ({ locale, view: [...view] })),
  );
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

  // A mistyped URL is a 404, not a silent redirect to the dashboard — a
  // fallback would hide broken links rather than surface them.
  const screen = resolveAppScreen(view ?? []);
  if (screen === null) notFound();

  const dictionary = await getDictionary(locale);

  return (
    <JournalApp
      locale={locale}
      view={screen.view}
      mode={screen.mode}
      journal={dictionary.journal}
      concepts={dictionary.concepts}
      lab={journalLab(dictionary.lab)}
      dict={dictionary.dict}
    />
  );
}

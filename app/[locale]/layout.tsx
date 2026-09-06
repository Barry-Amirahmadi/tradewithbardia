import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Footer from "@/components/sections/Footer";
import SmoothScroll from "@/components/motion/SmoothScroll";
import Navbar from "@/components/navigation/Navbar";
import {
  isLocale,
  localeDirection,
  localeTag,
  locales,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

/**
 * The locale shell — master prompt §17.
 *
 * `lang` and `dir` live on a wrapper element rather than on `<html>`, because
 * the document shell sits above this segment and cannot know the locale. Both
 * attributes are honoured by the bidi algorithm and by assistive technology
 * from any element, so RTL layout, Persian font selection and screen-reader
 * language all work exactly as they did — see docs/architecture.md.
 */

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
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
    title: dictionary.meta.title,
    description: dictionary.meta.description,
    // Every page exists in both languages; saying so is what stops the two
    // versions competing with each other in search (§62).
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(
        locales.map((code) => [localeTag[code], `/${code}`]),
      ),
    },
    openGraph: {
      title: dictionary.meta.title,
      description: dictionary.meta.description,
      locale: localeTag[locale],
      type: "website",
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typedLocale: Locale = locale;
  const dictionary = await getDictionary(typedLocale);

  return (
    <div lang={typedLocale} dir={localeDirection[typedLocale]}>
      <SmoothScroll />
      <Navbar locale={typedLocale} nav={dictionary.nav} />
      {children}
      <Footer locale={typedLocale} dictionary={dictionary} />
    </div>
  );
}

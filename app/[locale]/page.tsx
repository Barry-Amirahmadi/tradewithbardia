import { notFound } from "next/navigation";

import PageMain from "@/components/layout/PageMain";
import Hero from "@/components/sections/Hero";
import SystemTeaser from "@/components/sections/TradingSystem/SystemTeaser";
import { isLocale, localeDirection } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = await getDictionary(locale);

  return (
    <PageMain>
      <Hero
        locale={locale}
        direction={localeDirection[locale]}
        dictionary={dictionary}
      />
      <SystemTeaser locale={locale} dictionary={dictionary} />
    </PageMain>
  );
}

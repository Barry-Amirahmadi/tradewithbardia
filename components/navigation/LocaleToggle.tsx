"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  localeLabel,
  localeShortLabel,
  locales,
  withLocale,
  type Locale,
} from "@/lib/i18n/config";

interface Props {
  current: Locale;
  label: string;
}

/**
 * A real link, not a button with an onClick.
 *
 * The other locale is a distinct URL with its own document language and
 * direction, so switching has to be a navigation: crawlable, middle-clickable,
 * and correct with JavaScript off (§17, §62, §63).
 */
export default function LocaleToggle({ current, label }: Props) {
  const pathname = usePathname();
  const target = locales.find((locale) => locale !== current) ?? current;

  return (
    <Link
      href={withLocale(pathname, target)}
      hrefLang={target}
      lang={target}
      className="btn btn-ghost btn-icon"
      aria-label={`${label} — ${localeLabel[target]}`}
    >
      {localeShortLabel[target]}
    </Link>
  );
}

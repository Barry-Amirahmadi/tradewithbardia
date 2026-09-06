import Link from "next/link";

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { hrefFor, primaryNav } from "@/lib/navigation";

export default function Footer({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  const { footer, nav } = dictionary;

  return (
    <footer className="border-t border-subtle py-[var(--space-16)]">
      <div className="container-page grid gap-[var(--space-12)] lg:grid-cols-[1fr_auto]">
        <div>
          <p className="site-brand">{nav.brand}</p>
          <p className="mt-3 type-caption">
            {footer.tagline}
          </p>
          <p className="type-label mt-6">{footer.phase}</p>
        </div>

        <nav aria-label={nav.primaryLabel} className="flex flex-wrap gap-x-8 gap-y-2">
          {primaryNav.map((item) => (
            <Link
              key={item.id}
              href={hrefFor(locale, item) ?? `/${locale}`}
              className="nav-link"
            >
              {nav[item.labelKey]}
            </Link>
          ))}
        </nav>
      </div>

      {/* Not boilerplate. The product teaches trading and will later hold user
          trade data, so saying plainly what it is not — advice, signals, money
          management — belongs on every page, not buried in a terms link
          (§67, §77.13). */}
      <div className="container-page mt-[var(--space-12)] border-t border-subtle pt-[var(--space-6)]">
        <h2 className="type-label">{footer.riskTitle}</h2>
        <p className="type-caption mt-2 max-w-[var(--container-text)]">
          {footer.riskBody}
        </p>
      </div>
    </footer>
  );
}

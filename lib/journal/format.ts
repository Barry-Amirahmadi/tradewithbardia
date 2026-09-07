import type { Locale } from "../i18n/config";
import { basisPointsToNumber, fromMoney, fromPrice, type BasisPoints, type Money, type Price } from "./money";

/**
 * PRESENTATION FORMATTING — master prompt §27, §28.
 *
 * The one place a number becomes a string.
 *
 * Domain records store integers and ISO timestamps; nothing in them is
 * formatted, because a stored `"$1,204.50"` is unusable in every other locale
 * and cannot be summed. Formatting is a property of the reader, not of the
 * trade — so it happens here, at the edge, driven by locale.
 *
 * `null` is formatted as the insufficient-data marker rather than as `0` or
 * `NaN`. That is the §6 rule reaching the last layer: the absence of a result
 * must look different from a result of zero, everywhere.
 */

const INTL_LOCALE: Record<Locale, string> = {
  en: "en-US",
  fa: "fa-IR",
};

/** What a caller passes when a metric could not be computed. */
export const NO_VALUE = "—";

export function formatMoney(
  value: Money | null,
  locale: Locale,
  currency = "USD",
): string {
  if (value === null) return NO_VALUE;
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(fromMoney(value));
}

/** Signed, so a loss reads as a loss without needing a colour to say so. */
export function formatSignedMoney(
  value: Money | null,
  locale: Locale,
  currency = "USD",
): string {
  if (value === null) return NO_VALUE;
  const formatted = formatMoney(Math.abs(value), locale, currency);
  if (value === 0) return formatted;
  return value > 0 ? `+${formatted}` : `−${formatted}`;
}

export function formatPercent(value: BasisPoints | null, locale: Locale): string {
  if (value === null) return NO_VALUE;
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(basisPointsToNumber(value));
}

/**
 * R multiples always read left-to-right, in both locales.
 *
 * `2.4R` is a technical notation, like MSS or FVG — Persian trading discourse
 * writes it in Latin, and mirroring it would make it harder to read, not
 * easier. Same reasoning as the chart axis exception in PROJECT_RULES §6.
 */
export function formatR(value: BasisPoints | null): string {
  if (value === null) return NO_VALUE;
  const r = basisPointsToNumber(value);
  const sign = r > 0 ? "+" : r < 0 ? "−" : "";
  return `${sign}${Math.abs(r).toFixed(2)}R`;
}

export function formatPrice(value: Price | undefined, locale: Locale): string {
  if (value === undefined) return NO_VALUE;
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    maximumFractionDigits: 5,
    minimumFractionDigits: 2,
  }).format(fromPrice(value));
}

export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value);
}

export function formatDate(iso: string, locale: Locale): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return NO_VALUE;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
    // UTC so a record reads the same wherever it is opened. Local-time display
    // needs the trader's own timezone, which the journal does not yet collect.
    timeZone: "UTC",
  }).format(time);
}

export function formatDuration(minutes: number | null, locale: Locale): string {
  if (minutes === null) return NO_VALUE;
  if (minutes < 60) return `${formatCount(minutes, locale)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${formatCount(hours, locale)}h`
    : `${formatCount(hours, locale)}h ${formatCount(rest, locale)}m`;
}

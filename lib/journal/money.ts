/**
 * MONEY AND PRICE ARITHMETIC — master prompt §8, §28.
 *
 * Financial values are integers. Never floats.
 *
 * `0.1 + 0.2 !== 0.3` is not a curiosity here; it is a product defect. A
 * journal that reports a different P&L depending on the order trades were
 * summed is worthless as evidence, and the whole premise of this epic is that
 * the journal is where the system meets evidence.
 *
 * THE STRATEGY:
 *
 * - **Money** is stored in minor units — cents, and the integer is exact.
 * - **Prices** are stored as scaled integers at a fixed precision, so 2014.37
 *   is 201_437_000 at `PRICE_SCALE = 1e5`. Five decimal places covers FX to a
 *   fractional pip and index/metal prices to well past tick size.
 * - **Division** happens exactly once per derived value, at the end, with a
 *   single documented rounding rule. Intermediate results stay integer.
 *
 * Nothing in the domain model stores a formatted string. `"$1,204.50"` is a
 * presentation of a value, not the value, and storing it makes the number
 * unusable in every other locale (§27, §28).
 */

/** Fixed-point scale for prices. Five decimals. */
export const PRICE_SCALE = 100_000;

/** Money is minor units — an integer count of cents. */
export type Money = number;
/** A price as a scaled integer. */
export type Price = number;

export function toPrice(value: number): Price {
  if (!Number.isFinite(value)) {
    throw new Error(`money: "${value}" is not a price.`);
  }
  return Math.round(value * PRICE_SCALE);
}

export function fromPrice(price: Price): number {
  return price / PRICE_SCALE;
}

export function toMoney(majorUnits: number): Money {
  if (!Number.isFinite(majorUnits)) {
    throw new Error(`money: "${majorUnits}" is not an amount.`);
  }
  return Math.round(majorUnits * 100);
}

export function fromMoney(money: Money): number {
  return money / 100;
}

/**
 * Half-away-from-zero, applied once at the end of a calculation.
 *
 * `Math.round` is half-UP, which is asymmetric across zero: it rounds -0.5 to
 * 0 and 0.5 to 1. On a ledger that quietly biases losses toward zero and makes
 * a set of gains and losses fail to net out. Symmetry matters more than
 * matching the platform default.
 */
export function roundHalfAway(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * A ratio expressed in basis points — hundredths of a percent, as an integer.
 *
 * Percentages and R multiples are ratios, and a ratio is the one place a
 * division is unavoidable. Keeping the result as an integer in a known unit
 * means it can still be summed and averaged exactly; only the final display
 * divides again.
 */
export type BasisPoints = number;

export function ratioToBasisPoints(numerator: number, denominator: number): BasisPoints {
  if (denominator === 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return 0;
  }
  return roundHalfAway((numerator / denominator) * 10_000);
}

export function basisPointsToNumber(bp: BasisPoints): number {
  return bp / 10_000;
}

/** Exact integer sum. Present so no caller reaches for `reduce` with floats. */
export function sumMoney(values: readonly Money[]): Money {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * Mean of integer minor units, rounded once.
 *
 * Returns null rather than NaN for an empty set — "no trades" is a real state
 * the UI must render as INSUFFICIENT DATA, and NaN would silently format as
 * something that looks like a number (§6, §17).
 */
export function meanMoney(values: readonly Money[]): Money | null {
  if (values.length === 0) return null;
  return roundHalfAway(sumMoney(values) / values.length);
}

export function meanBasisPoints(values: readonly BasisPoints[]): BasisPoints | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return roundHalfAway(total / values.length);
}

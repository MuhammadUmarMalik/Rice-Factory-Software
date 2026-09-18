import Decimal from "decimal.js";

/**
 * Money arithmetic helpers.
 *
 * Amounts are stored as decimal strings in the schema, but aggregation used to
 * run through parseFloat/Number, so long chains of additions accumulated binary
 * floating-point error (0.1 + 0.2 !== 0.3). Everything that sums money should
 * go through here instead; only the final value is handed back as a string or
 * a number for the response.
 */

// 2 decimal places, half-up — the rounding a ledger expects.
export const MONEY_DP = 2;

/**
 * Coerces anything that might carry an amount into a Decimal. Unparseable or
 * non-finite input becomes 0, matching the old parseAmount()/parseNum() guards
 * so a bad row can never poison a whole total with NaN.
 */
export function toDecimal(value: unknown): Decimal {
  if (value == null || value === "") return new Decimal(0);
  if (value instanceof Decimal) return value;

  if (typeof value === "number") {
    return Number.isFinite(value) ? new Decimal(value) : new Decimal(0);
  }

  const raw = typeof value === "string" ? value.trim() : String(value).trim();
  if (!raw) return new Decimal(0);

  try {
    const d = new Decimal(raw);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

/**
 * Adds a list of amounts exactly and returns a decimal string (never a float).
 * Callers that must hand a number to their response shape should wrap this in
 * Number(), which keeps the float conversion to a single, final step.
 */
export function sumAmounts(values: unknown[]): string {
  let total = new Decimal(0);
  for (const value of values) total = total.plus(toDecimal(value));
  return formatMoney(total);
}

/** Renders a Decimal (or any amount-ish value) as a fixed 2dp decimal string. */
export function formatMoney(value: Decimal | unknown): string {
  return toDecimal(value).toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP).toFixed(MONEY_DP);
}

/** Convenience for the many call sites whose response shape is a number. */
export function sumAmountsAsNumber(values: unknown[]): number {
  return Number(sumAmounts(values));
}

export { Decimal };

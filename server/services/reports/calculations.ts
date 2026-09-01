type Moneyish = string | number | null | undefined;

export type AgingBucket = "0-30" | "31-60" | "61-90" | "91+";

export function toNumber(value: Moneyish): number {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  return Number.isFinite(num) ? num : 0;
}

export function toCents(value: Moneyish): number {
  return Math.round(toNumber(value) * 100);
}

export function fromCents(value: number): string {
  return (value / 100).toFixed(2);
}

export function computeTrialBalanceTotals(rows: Array<{ debit: Moneyish; credit: Moneyish }>) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.debit += toCents(row.debit);
      acc.credit += toCents(row.credit);
      return acc;
    },
    { debit: 0, credit: 0 },
  );
  const difference = Math.abs(totals.debit - totals.credit);
  return {
    totals: { debit: fromCents(totals.debit), credit: fromCents(totals.credit) },
    balanced: difference === 0,
    difference: fromCents(difference),
  };
}

export function computeInventoryRollForward(values: {
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
}) {
  const closingQty = values.openingQty + values.inQty - values.outQty;
  const closingValue = values.openingValue + values.inValue - values.outValue;
  const avgCost =
    values.openingQty + values.inQty > 0
      ? (values.openingValue + values.inValue) / (values.openingQty + values.inQty)
      : 0;
  return { closingQty, closingValue, avgCost };
}

export function computeAgingBucket(daysOutstanding: number): AgingBucket {
  if (daysOutstanding <= 30) return "0-30";
  if (daysOutstanding <= 60) return "31-60";
  if (daysOutstanding <= 90) return "61-90";
  return "91+";
}

export function computeAgingBuckets(amount: Moneyish, daysOutstanding: number) {
  const value = toNumber(amount);
  const bucket = computeAgingBucket(daysOutstanding);
  return {
    bucket,
    buckets: {
      "0-30": bucket === "0-30" ? value : 0,
      "31-60": bucket === "31-60" ? value : 0,
      "61-90": bucket === "61-90" ? value : 0,
      "91+": bucket === "91+" ? value : 0,
    } as Record<AgingBucket, number>,
  };
}

export function computeBalanceSheetValidation(assets: Moneyish, liabilitiesAndEquity: Moneyish) {
  const assetsCents = toCents(assets);
  const liabilitiesCents = toCents(liabilitiesAndEquity);
  const difference = Math.abs(assetsCents - liabilitiesCents);
  return {
    balanced: difference === 0,
    difference: fromCents(difference),
  };
}

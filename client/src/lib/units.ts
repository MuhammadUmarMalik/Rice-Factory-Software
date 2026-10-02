/**
 * Product stock and average purchase price are stored in kilograms no matter
 * which unit the product is traded in — purchases normalise every line to
 * `netWeightKg` before touching `products.currentStock` / `avgPurchasePrice`.
 * The UI used to print those kg figures with the product's unit glued on, so a
 * 2,000 kg holding bought at Rs. 8,000/mound displayed as "2,000 mound @ Rs.
 * 200/mound" — off by the mound factor in both directions at once.
 *
 * These helpers are the single place that converts between the stored kg and
 * the unit the user actually thinks in.
 */

/**
 * Kilograms in one of each product unit.
 *
 * `bag` is deliberately absent: a bag's weight is per-purchase
 * (`filling_per_bag_kg`), so there is no product-level factor to convert with.
 *
 * `mound` is 40 kg here to match the product form's own "Mound (40 kg)" label.
 * Purchases may be booked against a 60 kg mound, but that choice is per-invoice
 * and is already folded into the kg stored on the product, so it cannot be
 * recovered at the product level.
 */
export const UNIT_KG: Record<string, number> = {
  kg: 1,
  mound: 40,
  quintal: 100,
  ton: 1000,
};

/** Kilograms per one `unit`, or null when the unit has no fixed weight. */
export function kgPerUnit(unit: string | null | undefined): number | null {
  if (!unit) return null;
  return UNIT_KG[unit] ?? null;
}

/** True when figures for this unit can be shown as anything other than kg. */
export function isConvertibleUnit(unit: string | null | undefined): boolean {
  return kgPerUnit(unit) !== null;
}

const toNumber = (value: string | number | null | undefined): number => {
  if (value == null || value === "") return 0;
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : 0;
};

/**
 * The unit a figure should be labelled with. Unconvertible units (bag) fall
 * back to kg, because kg is what the stored number actually is.
 */
export function displayUnit(unit: string | null | undefined): string {
  return isConvertibleUnit(unit) ? (unit as string) : "kg";
}

/** Stored kg -> quantity in the product's unit. */
export function stockInUnit(stockKg: string | number | null | undefined, unit: string | null | undefined): number {
  const factor = kgPerUnit(unit);
  return factor ? toNumber(stockKg) / factor : toNumber(stockKg);
}

/** Stored per-kg price -> price per one of the product's unit. */
export function pricePerUnit(pricePerKg: string | number | null | undefined, unit: string | null | undefined): number {
  const factor = kgPerUnit(unit);
  return factor ? toNumber(pricePerKg) * factor : toNumber(pricePerKg);
}

/**
 * Quantity in some unit -> kilograms, for values typed into a form before they
 * are sent to an API that expects kg. Unconvertible units pass through
 * unchanged, preserving the behaviour sale-quantity validation already had.
 */
export function unitToKg(quantity: string | number | null | undefined, unit: string | null | undefined): number {
  const factor = kgPerUnit(unit);
  return factor ? toNumber(quantity) * factor : toNumber(quantity);
}

/** Per-unit price -> per-kg price, the inverse of `pricePerUnit`. */
export function unitPriceToPerKg(price: string | number | null | undefined, unit: string | null | undefined): number {
  const factor = kgPerUnit(unit);
  return factor ? toNumber(price) / factor : toNumber(price);
}

const formatQty = (value: number): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** e.g. "50 mound" — the headline figure, in the unit the user trades in. */
export function formatStock(stockKg: string | number | null | undefined, unit: string | null | undefined): string {
  return `${formatQty(stockInUnit(stockKg, unit))} ${displayUnit(unit)}`;
}

/**
 * The kg equivalent, for showing underneath `formatStock`. Null for products
 * already measured in kg, where repeating the same number twice adds nothing.
 */
export function formatStockKgHint(stockKg: string | number | null | undefined, unit: string | null | undefined): string | null {
  if (!isConvertibleUnit(unit) || unit === "kg") return null;
  return `${formatQty(toNumber(stockKg))} kg`;
}

/** e.g. "Rs. 8,000/mound". */
export function formatPricePerUnit(pricePerKg: string | number | null | undefined, unit: string | null | undefined): string {
  const value = pricePerUnit(pricePerKg, unit);
  return `Rs. ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}/${displayUnit(unit)}`;
}

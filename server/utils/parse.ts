/**
 * Amounts are stored as decimal strings. Throws rather than yielding NaN so a
 * malformed row fails loudly instead of poisoning a balance.
 */
export function parseAmount(value: string | number | null | undefined): number {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  if (!Number.isFinite(num)) {
    throw new Error("Invalid numeric value");
  }
  return num;
}

/**
 * Money is stored as decimal strings; binary floats such as 3 * 33.33 =
 * 99.99000000000001 were being written verbatim, which looked wrong in the UI
 * and made debit/credit totals fail to net to zero. Round to paisa at every
 * persistence boundary.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Invalid numeric value");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Paisa-precision display formatting for amounts embedded in report text. */
export function formatMoney(value: string | number | null | undefined): string {
  return parseAmount(value).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseRequiredDate(value: unknown, label: string): Date {
  if (!value || typeof value !== "string") throw new Error(`${label} is required`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`${label} is invalid`);
  return d;
}

export function parseOptionalDate(value: unknown): Date | undefined {
  if (!value || typeof value !== "string") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date filter");
  return d;
}

export function parseOptionalInt(value: unknown): number | undefined {
  if (value == undefined || value == null || value == "") return undefined;
  const n = typeof value == "string" ? parseInt(value, 10) : Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Invalid numeric filter");
  return n;
}

export function parseRequiredInt(value: unknown, label: string): number | undefined {
  if (value == undefined || value == null || value === "") return undefined;
  const n = typeof value === "string" ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (!Number.isInteger(n)) return undefined;
  if (n < 0) return undefined;
  return n;
}

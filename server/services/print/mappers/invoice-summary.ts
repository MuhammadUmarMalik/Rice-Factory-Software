import type { PrintableSection } from "../../../types/print";

/**
 * Canonical summary sequence shared by every invoice document.
 *
 * Sale and purchase invoices must print these thirteen fields in this exact
 * relative order, on every output the app produces. Preview HTML (what the
 * print dialog uses) and the downloaded PDF are rendered from the same payload
 * by the same template, so the order is defined once here.
 *
 * Document-specific extras are allowed (the party identity row, charge
 * breakdowns, `Total Qty`, `Total Weight`, ...), but they must never disturb the
 * relative order of the fields below.
 */
export const INVOICE_SUMMARY_ORDER = [
  "Invoice Date",
  "Total Bags",
  "Weight per Bags",
  "Total Weight",
  "Bardana / Kaat",
  "Less / Watta Kaat (Moisture + Quality)",
  "Net Weight",
  "Watta Kaat (Moisture + Quality) / Bag",
  "Maund (40 kg)",
  "Line Subtotal",
  "Commission",
  "Charges (-)",
  "Grand Total",
] as const;

export type InvoiceSummaryField = (typeof INVOICE_SUMMARY_ORDER)[number];

/**
 * The sales invoice prints its own fixed sequence (no purchase-only rows such
 * as kaat or commission). Every label always prints, "-" when empty. Ends in
 * "Grand Total" like the canonical order, which the template relies on.
 */
export const SALE_INVOICE_SUMMARY_ORDER = [
  "Customer",
  "Invoice Date",
  "Item Name",
  "Total Bag",
  "Weight for Bag",
  "Total Weight",
  "Maund (kg)",
  "Price (40kg)",
  "Subtotal",
  "Bardana Charges",
  "Loading Charges",
  "Stitching Charges",
  "Grand Total",
] as const;

export function buildSaleInvoiceSummary(
  values: Partial<Record<(typeof SALE_INVOICE_SUMMARY_ORDER)[number], string>>,
): PrintableSection[] {
  const highlight = new Set(["Customer", "Subtotal", "Grand Total"]);
  return SALE_INVOICE_SUMMARY_ORDER.map((label) => {
    const value = values[label];
    return {
      label,
      value: value != null && String(value).trim() ? String(value) : "-",
      highlight: highlight.has(label),
    };
  });
}

/**
 * Every way `labels` breaks the canonical sequence: a field that never prints,
 * one that prints more than once, or one that prints out of order. Returns an
 * empty array when the sequence is correct.
 */
export function findInvoiceSummaryOrderProblems(labels: readonly string[]): string[] {
  const problems: string[] = [];
  let previousIndex = -1;
  for (const field of INVOICE_SUMMARY_ORDER) {
    const at = labels.indexOf(field);
    if (at === -1) {
      problems.push(`missing: ${field}`);
      continue;
    }
    if (labels.indexOf(field, at + 1) !== -1) {
      problems.push(`duplicated: ${field}`);
    }
    if (at < previousIndex) {
      problems.push(`out of order: ${field}`);
    }
    previousIndex = Math.max(previousIndex, at);
  }
  return problems;
}

export type InvoiceSummaryValues = Partial<Record<InvoiceSummaryField, string>>;

/**
 * A document-specific row that is not part of the canonical sequence. It is
 * anchored to the canonical field it should follow, so an extra can never push
 * a canonical field out of order.
 */
export type InvoiceSummaryExtra = {
  after: InvoiceSummaryField;
  label: string;
  value: string;
  highlight?: boolean;
};

/**
 * Builds an invoice's summary rows by mapping over `INVOICE_SUMMARY_ORDER`, so
 * the sequence is owned by that constant alone and never by the call site.
 *
 * A canonical field with no value still prints, as "-", because a row that
 * disappears shifts every row under it and makes two invoices of the same type
 * read differently.
 */
export function buildInvoiceSummary(options: {
  /** Identity row (Customer / Supplier) printed above the sequence. */
  lead?: PrintableSection;
  values: InvoiceSummaryValues;
  highlight?: readonly InvoiceSummaryField[];
  extras?: readonly InvoiceSummaryExtra[];
}): PrintableSection[] {
  const { lead, values, extras = [] } = options;
  const highlight = new Set(options.highlight || []);
  const rows: PrintableSection[] = lead ? [lead] : [];

  for (const field of INVOICE_SUMMARY_ORDER) {
    const value = values[field];
    rows.push({
      label: field,
      value: value != null && String(value).trim() ? String(value) : "-",
      highlight: highlight.has(field),
    });
    for (const extra of extras) {
      if (extra.after !== field) continue;
      rows.push({ label: extra.label, value: extra.value, highlight: Boolean(extra.highlight) });
    }
  }

  return rows;
}

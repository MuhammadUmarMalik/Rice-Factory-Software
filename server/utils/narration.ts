const NULL_LIKE_TEXT = new Set(["undefined", "null"]);

/**
 * Converts an optional narration value into safe display text.
 * Null-like placeholders are treated as missing so generated narration never
 * leaks JavaScript/database sentinel values into reports or documents.
 */
export function cleanNarrationSegment(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  if (!text || NULL_LIKE_TEXT.has(text.toLowerCase())) return "";
  return text;
}

/** Joins only meaningful narration segments, preventing empty separators. */
export function joinNarration(
  segments: readonly unknown[],
  separator = " — ",
): string {
  return segments
    .map(cleanNarrationSegment)
    .filter(Boolean)
    .join(separator);
}

/** Builds a segment only when its dynamic value is meaningful. */
export function narrationSegment(prefix: string, value: unknown): string {
  const cleanValue = cleanNarrationSegment(value);
  return cleanValue ? `${prefix}${cleanValue}` : "";
}

/** Preserves manual narration and generates a fallback only when it is blank. */
export function preferManualNarration(manual: unknown, fallback: unknown): string {
  if (cleanNarrationSegment(manual)) return String(manual);
  return cleanNarrationSegment(fallback);
}

/** Returns persisted narration unchanged, or a dash for blank/null-like history. */
export function displayNarration(value: unknown): string {
  return cleanNarrationSegment(value) ? String(value) : "-";
}

export function buildSaleNarration(input: {
  notes?: unknown;
  customerName?: unknown;
  invoiceNumber?: unknown;
}): string {
  const fallback = joinNarration([
    narrationSegment("Sale to ", input.customerName),
    narrationSegment("Invoice #", input.invoiceNumber),
  ]);
  return preferManualNarration(input.notes, fallback);
}

export function buildPurchaseNarration(input: {
  notes?: unknown;
  supplierName?: unknown;
  invoiceNumber?: unknown;
}): string {
  const fallback = joinNarration([
    narrationSegment("Purchase from ", input.supplierName),
    narrationSegment("Invoice #", input.invoiceNumber),
  ]);
  return preferManualNarration(input.notes, fallback);
}

export function appendNarrationDetail(narration: unknown, detail: unknown): string {
  return joinNarration([narration, detail]);
}

export function firstMeaningfulNarration(values: readonly unknown[]): string {
  for (const value of values) {
    if (cleanNarrationSegment(value)) return String(value);
  }
  return "";
}

export function summarizeNarrationValues(values: readonly unknown[]): string {
  const unique = Array.from(new Set(values.map(cleanNarrationSegment).filter(Boolean)));
  if (unique.length <= 2) return unique.join(" / ");
  return `${unique.slice(0, 2).join(" / ")} +${unique.length - 2} more`;
}

export function buildReceiptVoucherNarration(input: {
  headerNarration?: unknown;
  lineNarrations?: readonly unknown[];
  partyName?: unknown;
  invoiceNumber?: unknown;
  voucherNumber?: unknown;
}): string {
  const manual = firstMeaningfulNarration([
    input.headerNarration,
    ...(input.lineNarrations || []),
  ]);
  const fallback = joinNarration([
    joinNarration([
      narrationSegment("Payment received from ", input.partyName),
      narrationSegment("against Invoice #", input.invoiceNumber),
    ], " "),
    narrationSegment("Voucher #", input.voucherNumber),
  ]);
  return preferManualNarration(manual, fallback);
}

export function buildPaymentVoucherNarration(input: {
  headerNarration?: unknown;
  lineNarrations?: readonly unknown[];
  partyName?: unknown;
  invoiceNumber?: unknown;
  voucherNumber?: unknown;
}): string {
  const manual = firstMeaningfulNarration([
    input.headerNarration,
    ...(input.lineNarrations || []),
  ]);
  const fallback = joinNarration([
    joinNarration([
      narrationSegment("Payment made to ", input.partyName),
      narrationSegment("against Invoice #", input.invoiceNumber),
    ], " "),
    narrationSegment("Voucher #", input.voucherNumber),
  ]);
  return preferManualNarration(manual, fallback);
}

export function buildJournalVoucherNarration(input: {
  narration?: unknown;
  voucherNumber?: unknown;
  debitAccount?: unknown;
  creditAccount?: unknown;
}): string {
  const fallback = joinNarration([
    narrationSegment("Journal Voucher #", input.voucherNumber),
    joinNarration([input.debitAccount, input.creditAccount], " to "),
  ]);
  return preferManualNarration(input.narration, fallback);
}

export function buildCashJournalVoucherNarration(input: {
  headerNarration?: unknown;
  itemNarrations?: readonly unknown[];
  voucherNumber?: unknown;
  summary?: unknown;
}): string {
  const manual = firstMeaningfulNarration([
    input.headerNarration,
    ...(input.itemNarrations || []),
  ]);
  const fallback = joinNarration([
    narrationSegment("Cash Journal Voucher #", input.voucherNumber),
    input.summary,
  ]);
  return preferManualNarration(manual, fallback);
}

export function buildCashReceiptNarration(input: {
  description?: unknown;
  partyName?: unknown;
  reference?: unknown;
  invoiceNumber?: unknown;
}): string {
  const linkedSale = cleanNarrationSegment(input.invoiceNumber)
    ? joinNarration([
        narrationSegment("Cash received from ", input.partyName),
        narrationSegment("against Invoice #", input.invoiceNumber),
      ], " ")
    : "";
  const fallback = linkedSale || joinNarration([
    narrationSegment("Cash received from ", input.partyName),
    narrationSegment("Ref #", input.reference),
  ]);
  return preferManualNarration(input.description, fallback);
}

export function buildCashPaymentNarration(input: {
  description?: unknown;
  partyName?: unknown;
  reference?: unknown;
  invoiceNumber?: unknown;
}): string {
  const linkedPurchase = cleanNarrationSegment(input.invoiceNumber)
    ? joinNarration([
        narrationSegment("Cash paid to ", input.partyName),
        narrationSegment("against Invoice #", input.invoiceNumber),
      ], " ")
    : "";
  const fallback = linkedPurchase || joinNarration([
    narrationSegment("Cash paid to ", input.partyName),
    narrationSegment("Ref #", input.reference),
  ]);
  return preferManualNarration(input.description, fallback);
}

export function buildExpenseNarration(input: {
  description?: unknown;
  expenseAccount?: unknown;
  voucherNumber?: unknown;
  purpose?: unknown;
}): string {
  const fallback = joinNarration([
    "Expense",
    input.expenseAccount,
    narrationSegment("Voucher #", input.voucherNumber),
    input.purpose,
  ]);
  return preferManualNarration(input.description, fallback);
}

export function buildSalesReturnNarration(input: {
  description?: unknown;
  reason?: unknown;
  notes?: unknown;
  customerName?: unknown;
  returnNumber?: unknown;
  invoiceNumber?: unknown;
}): string {
  const manual = firstMeaningfulNarration([input.description, input.reason, input.notes]);
  const fallback = joinNarration([
    narrationSegment("Sales return from ", input.customerName),
    narrationSegment("Return #", input.returnNumber),
    narrationSegment("Invoice #", input.invoiceNumber),
  ]);
  return preferManualNarration(manual, fallback);
}

export function buildPurchaseReturnNarration(input: {
  description?: unknown;
  reason?: unknown;
  notes?: unknown;
  supplierName?: unknown;
  returnNumber?: unknown;
  invoiceNumber?: unknown;
}): string {
  const manual = firstMeaningfulNarration([input.description, input.reason, input.notes]);
  const fallback = joinNarration([
    narrationSegment("Purchase return to ", input.supplierName),
    narrationSegment("Return #", input.returnNumber),
    narrationSegment("Invoice #", input.invoiceNumber),
  ]);
  return preferManualNarration(manual, fallback);
}

export function buildProcessingNarration(input: {
  notes?: unknown;
  inputProduct?: unknown;
  inputQuantity?: unknown;
  outputProduct?: unknown;
  outputQuantity?: unknown;
  batchNumber?: unknown;
  reference?: unknown;
}): string {
  const inputDetail = joinNarration([
    input.inputProduct,
    narrationSegment("Qty: ", input.inputQuantity),
  ], " ");
  const outputDetail = joinNarration([
    input.outputProduct,
    narrationSegment("Qty: ", input.outputQuantity),
  ], " ");
  const conversion = inputDetail && outputDetail
    ? `${inputDetail} to ${outputDetail}`
    : joinNarration([inputDetail, outputDetail], " to ");
  const fallback = joinNarration([
    "Stock processing",
    conversion,
    narrationSegment("Batch #", input.batchNumber),
    narrationSegment("Ref #", input.reference),
  ]);
  return preferManualNarration(input.notes, fallback);
}

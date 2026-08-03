import { format } from "date-fns";
import { storage } from "../../../models/storage";
import * as daybooksService from "../../daybooks.service";
import type { PrintableDocumentPayload, PrintableSection, PrintableTableColumn } from "../../../types/print";

type PrintContext = {
  company: PrintableDocumentPayload["company"];
  createdBy?: string;
  createdAt?: string;
};

function fmtDate(value?: string | number | Date) {
  if (!value) return "";
  try {
    return format(new Date(value), "dd MMM yyyy");
  } catch {
    return "";
  }
}

function money(value?: string | number | null, prefix = "Rs.") {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  if (!Number.isFinite(num)) return `${prefix} 0`;
  return `${prefix} ${num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function num(value?: string | number | null) {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusLabel(status?: string | null) {
  if (!status) return "-";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function baseMeta(ctx: PrintContext, meta?: PrintableDocumentPayload["meta"]) {
  return {
    createdBy: ctx.createdBy,
    createdAt: ctx.createdAt,
    ...meta,
  };
}

function summaryCard(label: string, value: string, highlight = false): PrintableSection {
  return { label, value, highlight };
}

function buildColumns(list: Array<{ key: string; label: string; align?: "left" | "right" | "center"; width?: string }>): PrintableTableColumn[] {
  return list.map((c) => ({ key: c.key, label: c.label, align: c.align, width: c.width }));
}

/*
 * Report filter chips are built straight from query params. The pages send "all"
 * (or nothing) to mean "no filter", and bare numeric ids otherwise - printing
 * either one verbatim is what produced chips like "Customer: all" and
 * "Supplier: 42". Everything that renders a filter chip goes through these two
 * helpers instead.
 */
function isAllSentinel(value: unknown) {
  if (value === undefined || value === null) return true;
  const text = String(value).trim().toLowerCase();
  return text === "" || text === "all" || text === "undefined" || text === "null";
}

/** Falls back to `#id` only when the entity lookup came back empty. */
function filterLabel(value: unknown, resolvedName?: string | null) {
  if (isAllSentinel(value)) return "All";
  return resolvedName || `#${String(value).trim()}`;
}

/** Title-cases a free-text filter such as a status or voucher type. */
function filterTextLabel(value: unknown) {
  if (isAllSentinel(value)) return "All";
  const text = String(value).trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function lookupAccountName(id: unknown) {
  if (isAllSentinel(id)) return null;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return null;
  try {
    const account = await storage.getAccount(numericId);
    return account?.name || null;
  } catch {
    return null;
  }
}

async function lookupProductName(id: unknown) {
  if (isAllSentinel(id)) return null;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return null;
  try {
    const product = await storage.getProduct(numericId);
    return product?.name || null;
  } catch {
    return null;
  }
}

export async function mapSalesInvoice(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const saleId = Number(params.saleId);
  const sale = await storage.getSale(saleId);
  if (!sale) throw new Error("Sale not found");
  const items = await storage.getSaleItems(saleId);
  const customer = await storage.getAccount(sale.customerId);
  const products = await storage.getProducts();
  const productMap = new Map(products.map((p) => [p.id, p]));

  const tableColumns = buildColumns([
    { key: "sr", label: "Sr", width: "6%" },
    { key: "item", label: "Item" },
    { key: "qty", label: "Qty", align: "right" },
    { key: "rate", label: "Rate", align: "right" },
    { key: "amount", label: "Amount", align: "right" },
  ]);

  const toKg = (qty: number, unit?: string) => {
    if (unit === "mound") return qty * 40;
    if (unit === "quintal") return qty * 100;
    if (unit === "ton") return qty * 1000;
    if (unit === "kg") return qty;
    return null;
  };

  const resolveUnit = (it: any) => (it as any).unit || "";

  const tableRows = items.map((it, index) => {
    const product = productMap.get(it.productId);
    const rawUnit = resolveUnit(it);
    const unitLabel = rawUnit;
    const qtyValue = parseFloat(String(it.quantity || "0"));
    const kgValue = toKg(qtyValue, rawUnit);
    const qtyLabel =
      unitLabel && kgValue != null && rawUnit !== "kg"
        ? `${num(qtyValue)} ${unitLabel} (${num(kgValue)} kg)`
        : unitLabel
          ? `${num(qtyValue)} ${unitLabel}`
          : num(qtyValue);
    return {
      sr: String(index + 1),
      item: product ? `${product.name}${rawUnit ? ` (${rawUnit})` : ""}` : `#${it.productId}`,
      qty: qtyLabel,
      rate: money(it.pricePerUnit),
      amount: money(it.totalPrice),
    };
  });

  const charges = [
    { label: "Loading", value: sale.loadingCharges },
    { label: "Weighing", value: sale.weighingCharges },
    { label: "Other", value: sale.otherCharges },
    { label: "Rent", value: (sale as { rentCharges?: string | null }).rentCharges },
  ];
  const chargeSummary = charges.filter((c) => Number(c.value || 0) !== 0);
  const chargesTotal = chargeSummary.reduce((sum, c) => sum + parseFloat(String(c.value || "0")), 0);
  const discountAmount = parseFloat(String((sale as { discountAmount?: string | null }).discountAmount || "0"));
  const unitSet = new Set(items.map((it) => resolveUnit(it)).filter(Boolean));
  const totalQtyLabel = (() => {
    if (unitSet.size === 1) {
      const [rawUnit] = Array.from(unitSet);
      const unitLabel = rawUnit;
      const totalQty = items.reduce((sum, item) => sum + parseFloat(String(item.quantity || "0")), 0);
      const kgValue = toKg(totalQty, rawUnit);
      if (unitLabel && kgValue != null && rawUnit !== "kg") {
        return `${num(totalQty)} ${unitLabel} (${num(kgValue)} kg)`;
      }
      return unitLabel ? `${num(totalQty)} ${unitLabel}` : num(totalQty);
    }
    const totalKg = items.reduce((sum, item) => {
      const rawUnit = resolveUnit(item);
      const qty = parseFloat(String(item.quantity || "0"));
      const kgValue = toKg(qty, rawUnit);
      return kgValue == null ? sum : sum + kgValue;
    }, 0);
    return totalKg > 0 ? `${num(totalKg)} kg` : "Mixed";
  })();
  const taxAmount = parseFloat(String(sale.taxAmount || "0"));
  const chargeRows = [
    ...chargeSummary.map((c, idx) => ({
      sr: "",
      item: `${c.label}${Number(c.value || 0) < 0 ? " (less)" : ""}`,
      qty: "",
      rate: "",
      amount: money(c.value),
    })),
    ...(taxAmount !== 0
      ? [
          {
            sr: "",
            item: "Tax",
            qty: "",
            rate: "",
            amount: money(taxAmount),
          },
        ]
      : []),
  ];
  const tableRowsWithCharges = [...tableRows, ...chargeRows];

  const sections = [
    summaryCard("Customer", customer?.name || "-"),
    summaryCard("Invoice Date", fmtDate(sale.saleDate)),
    summaryCard("Total Qty", totalQtyLabel, true),
    summaryCard("Subtotal", money(sale.subtotal), true),
    ...(Number(sale.loadingCharges || 0) !== 0 ? [summaryCard("Loading", money(sale.loadingCharges))] : []),
    ...(Number(sale.weighingCharges || 0) !== 0 ? [summaryCard("Weighing", money(sale.weighingCharges))] : []),
    ...(Number(sale.otherCharges || 0) !== 0 ? [summaryCard("Other Charges", money(sale.otherCharges))] : []),
    ...(Number((sale as { rentCharges?: string | null }).rentCharges || 0) !== 0 ? [summaryCard("Rent", money((sale as { rentCharges?: string | null }).rentCharges))] : []),
    ...(discountAmount !== 0 ? [summaryCard("Discount", `- ${money(discountAmount)}`)] : []),
    ...(taxAmount !== 0 ? [summaryCard("Tax", money(taxAmount))] : []),
    ...(chargesTotal !== 0 ? [summaryCard("Charges Total", money(chargesTotal), true)] : []),
    summaryCard("Total", money(sale.totalAmount), true),
  ];

  return {
    docType: "INVOICE",
    docKey: "invoice.sales",
    title: "Sales Invoice",
    docNo: sale.invoiceNumber || undefined,
    company: ctx.company,
    meta: baseMeta(ctx, {
      filters: {
        Vehicle: sale.vehicleNumber || "-",
        GatePass: sale.gatePassNumber || "-",
      },
    }),
    sections,
    table: {
      columns: tableColumns,
      rows: tableRowsWithCharges,
      totalsRow: {
        sr: "",
        item: "Totals",
        qty: "",
        rate: "",
        amount: money(sale.totalAmount),
      },
    },
    // The template already renders the "Notes:" label - prefixing here produced
    // "Notes: Notes: pending".
    notes: sale.notes || "",
    signatures: [
      { label: "Prepared By" },
      { label: "Approved By" },
      { label: "Received By" },
    ],
    settings: { currency: "PKR" },
  };
}

export async function mapPurchaseInvoice(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const purchaseId = Number(params.purchaseId);
  const purchase = await storage.getPurchaseWithDetails(purchaseId);
  if (!purchase) throw new Error("Purchase not found");
  const supplier = await storage.getAccount(purchase.supplierId);
  const products = await storage.getProducts();
  const productMap = new Map(products.map((p) => [p.id, p]));

  const tableColumns = buildColumns([
    { key: "sr", label: "Sr", width: "6%" },
    { key: "item", label: "Item" },
    { key: "bags", label: "Bags", align: "right" },
    { key: "weight", label: "Net Wt", align: "right" },
    { key: "rate", label: "Rate", align: "right" },
    { key: "amount", label: "Amount", align: "right" },
  ]);

  const tableRows = purchase.items.map((it, index) => {
    const product = productMap.get(it.productId);
    return {
      sr: String(index + 1),
      item: product ? `${product.name} (${product.unit})` : `#${it.productId}`,
      bags: num(it.bags),
      weight: num(it.netWeightKg),
      rate: money(it.rate),
      amount: money(it.amount),
    };
  });

  const chargeLabel = (type: string) => {
    switch (type) {
      case "weight":
        return "Weight";
      case "freight":
        return "Freight";
      case "loading_filling":
        return "Loading / Filling";
      case "market_fee":
        return "Market Fee";
      case "mitha_sukri":
        return "Mitha Sukri";
      case "phone_analysis":
        return "Phone / Analysis";
      case "brokerage":
        return "Brokerage";
      case "commission":
        return "Commission";
      case "bardana":
        return "Bardana / Kaat";
      case "broken_allowance":
        return "Broken Allowance";
      case "accountant_clerk":
        return "Accountant / Clerk";
      case "other":
      default:
        return "Other";
    }
  };

  const charges = (purchase.charges || []).filter((c) => Number(c.amount || 0) !== 0);
  const chargeRows = charges.map((charge) => {
    const amount = parseFloat(String(charge.amount || "0"));
    const signed = charge.mode === "less" ? -Math.abs(amount) : amount;
    const label = `${chargeLabel(charge.type)}${charge.mode === "less" ? " (Less / Watta Kaat (Moisture + Quality))" : ""}`;
    return {
      sr: "",
      item: label,
      bags: "",
      weight: "",
      rate: "",
      amount: money(signed),
    };
  });
  const rowsWithCharges = [...tableRows, ...chargeRows];
  const chargesAddTotal = charges
    .filter((c) => c.mode !== "less")
    .reduce((sum, c) => sum + parseFloat(String(c.amount || "0")), 0);
  const chargesLessTotal = charges
    .filter((c) => c.mode === "less")
    .reduce((sum, c) => sum + parseFloat(String(c.amount || "0")), 0);
  const totalBags = parseFloat(String(purchase.totalBags || "0"));
  const totalGross = parseFloat(String(purchase.totalGrossWeightKg || "0"));
  const totalNet = parseFloat(String(purchase.totalNetWeightKg || "0"));
  const totalBardana = (purchase.items || []).reduce((sum, i) => sum + parseFloat(String(i.bardanaKatKg || "0")), 0);
  const totalLess = (purchase.items || []).reduce((sum, i) => sum + parseFloat(String(i.lessKg || "0")), 0);
  const weightPerBag = totalBags > 0 ? totalNet / totalBags : 0;
  const moundQtyRaw = parseFloat(String(purchase.totalMoundQty || "0"));
  const moundWhole = Math.floor(moundQtyRaw);
  const moundRemainder = parseFloat(String(purchase.totalMoundRemainderKg || "0"));
  const commissionAmount = parseFloat(String(purchase.brokerCommissionAmount || "0"));
  const lineSubtotal = parseFloat(String(purchase.subtotal || "0")) + commissionAmount;
  const qualityLessPerBag = totalBags > 0 ? totalLess / totalBags : 0;
  const accountantClerkCharges = charges
    .filter((c) => c.type === "accountant_clerk")
    .reduce((sum, c) => {
      const amt = parseFloat(String(c.amount || "0"));
      if (!Number.isFinite(amt)) return sum;
      return sum + (c.mode === "less" ? -Math.abs(amt) : amt);
    }, 0);

  const sections = [
    summaryCard("Supplier", supplier?.name || "-"),
    summaryCard("Invoice Date", fmtDate(purchase.purchaseDate)),
    summaryCard("Total Bags", num(totalBags)),
    summaryCard("Total Weight", `${num(totalGross)} kg`),
    summaryCard("Net Weight", `${num(totalNet)} kg`),
    summaryCard("Bardana / Kaat", `${num(totalBardana)} kg`),
    summaryCard("Less / Watta Kaat (Moisture + Quality)", `${num(totalLess)} kg`),
    summaryCard("Watta Kaat (Moisture + Quality) / Bag", `${num(qualityLessPerBag)} kg`),
    summaryCard("Weight per Bag", `${num(weightPerBag)} kg`),
    summaryCard("Maund (40 kg)", `${moundWhole} + ${num(moundRemainder)}kg`),
    summaryCard("Line Subtotal", money(lineSubtotal), true),
    summaryCard("Commission", money(commissionAmount)),
    ...(accountantClerkCharges !== 0 ? [summaryCard("Accountant / Clerk", money(accountantClerkCharges))] : []),
    ...(chargesAddTotal !== 0 ? [summaryCard("Charges (+)", money(chargesAddTotal), true)] : []),
    ...(chargesLessTotal !== 0 ? [summaryCard("Charges (-)", money(chargesLessTotal), true)] : []),
    summaryCard("Grand Amount", money(purchase.totalAmount), true),
  ];

  return {
    docType: "INVOICE",
    docKey: "invoice.purchase",
    title: "Purchase Invoice",
    docNo: purchase.invoiceNumber || undefined,
    company: ctx.company,
    meta: baseMeta(ctx, {
      filters: {
        Vehicle: purchase.vehicleNumber || "-",
        BillNo: purchase.billNo || "-",
        BookNo: purchase.bookNo || "-",
      },
    }),
    sections,
    table: {
      columns: tableColumns,
      rows: rowsWithCharges,
      totalsRow: {
        sr: "",
        item: "Totals",
        bags: num(purchase.totalBags),
        weight: num(purchase.totalNetWeightKg),
        rate: "",
        amount: money(purchase.totalAmount),
      },
    },
    notes: [
      ...charges.map((c) => {
        const amount = parseFloat(String(c.amount || "0"));
        const signed = c.mode === "less" ? -Math.abs(amount) : amount;
        return `${chargeLabel(c.type)}${c.mode === "less" ? " (Less / Watta Kaat (Moisture + Quality))" : ""}: ${money(signed)}`;
      }),
      (purchase as { amountInWords?: string }).amountInWords ? `In words: ${(purchase as { amountInWords?: string }).amountInWords}` : "",
      // "Remarks", not "Notes" - the template already prefixes the whole block
      // with "Notes:", so a second "Notes:" here read as "Notes: Notes: ...".
      purchase.notes ? `Remarks: ${purchase.notes}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
    signatures: [
      { label: "Prepared By" },
      { label: "Approved By" },
      { label: "Received By" },
    ],
    settings: { currency: "PKR" },
  };
}
export async function mapCashVoucher(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const voucherId = Number(params.voucherId);
  const voucher = await storage.getReceiptVoucher(voucherId);
  if (!voucher) throw new Error("Voucher not found");
  const accounts = await storage.getAccounts();
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const isReceipt = voucher.voucherType === "CR";
  const title = isReceipt ? "Cash Receipt Voucher" : "Cash Payment Voucher";

  const tableColumns = buildColumns([
    { key: "sr", label: "Sr", width: "6%" },
    { key: "account", label: "Account" },
    { key: "narration", label: "Narration" },
    { key: "debit", label: "Debit", align: "right" },
    { key: "credit", label: "Credit", align: "right" },
  ]);

  const tableRows = (voucher.lines || []).map((line, index) => ({
    sr: String(index + 1),
    account: accountMap.get(line.accountId) || `#${line.accountId}`,
    narration: line.narration || "",
    debit: money(line.debit),
    credit: money(line.credit),
  }));

  return {
    docType: "VOUCHER",
    docKey: isReceipt ? "voucher.cashReceipt" : "voucher.cashPayment",
    title,
    docNo: voucher.voucherNumber || undefined,
    company: ctx.company,
    meta: baseMeta(ctx, {
      filters: {
        Date: fmtDate(voucher.voucherDate),
        Type: voucher.voucherType,
      },
    }),
    sections: [
      summaryCard("Total Debit", money(voucher.totalDebit || voucher.totalCredit), true),
      summaryCard("Total Credit", money(voucher.totalCredit || voucher.totalDebit), true),
    ],
    table: {
      columns: tableColumns,
      rows: tableRows,
    },
    notes: voucher.narration || "",
    signatures: [
      { label: "Prepared By" },
      { label: "Approved By" },
      { label: "Received By" },
    ],
    settings: { currency: "PKR" },
  };
}

export async function mapJournalVoucher(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const voucherId = Number(params.voucherId);
  const voucher = await storage.getJournalVoucher(voucherId);
  if (!voucher) throw new Error("Journal voucher not found");
  const accounts = await storage.getAccounts();
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  const tableColumns = buildColumns([
    { key: "sr", label: "Sr", width: "6%" },
    { key: "account", label: "Account" },
    { key: "type", label: "Type", align: "center" },
    { key: "amount", label: "Amount", align: "right" },
  ]);

  const tableRows = (voucher.entries || []).map((entry, index) => ({
    sr: String(index + 1),
    account: accountMap.get(entry.accountId) || `#${entry.accountId}`,
    type: entry.entryType,
    amount: money(entry.amount),
  }));

  return {
    docType: "VOUCHER",
    docKey: "voucher.journal",
    title: "Journal Voucher",
    docNo: voucher.voucherNo || undefined,
    company: ctx.company,
    meta: baseMeta(ctx, {
      filters: {
        Date: fmtDate(voucher.voucherDate),
        Status: voucher.status,
      },
    }),
    sections: [
      summaryCard("Total Amount", money(voucher.totalAmount), true),
    ],
    table: {
      columns: tableColumns,
      rows: tableRows,
    },
    notes: voucher.narration || "",
    signatures: [
      { label: "Prepared By" },
      { label: "Approved By" },
      { label: "Received By" },
    ],
    settings: { currency: "PKR" },
  };
}

export async function mapLedgerReport(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const accountId = Number(params.accountId);
  if (!accountId) throw new Error("accountId is required");
  const scope = params.scope ? String(params.scope) : undefined;
  const voucherTypeRaw = params.voucherType ? String(params.voucherType) : undefined;
  const normalizeVoucherType = (value?: string) => {
    if (!value) return undefined;
    const v = value.trim().toLowerCase();
    if (v === "sale" || v === "sales") return "sale";
    if (v === "purchase" || v === "purchases") return "purchase";
    if (v === "journal" || v === "jv" || v === "journal_voucher") return "journal_voucher";
    if (v === "receipt" || v === "crv" || v === "brv") return "receipt";
    if (v === "payment" || v === "cpv" || v === "bpv") return "payment";
    if (v === "expense" || v === "exp") return "expense";
    return undefined;
  };
  const scopeRef =
    scope === "sales"
      ? "sale"
      : scope === "purchases"
        ? "purchase"
        : scope === "journal"
          ? "journal_voucher"
          : scope === "expenses"
            ? "expense"
            : scope === "payroll"
              ? "journal_voucher"
              : undefined;
  const referenceType = normalizeVoucherType(voucherTypeRaw) || scopeRef;
  const startDate = params.startDate ? new Date(String(params.startDate)) : undefined;
  const endDate = params.endDate ? new Date(String(params.endDate)) : undefined;
  const narration = params.narration ? String(params.narration) : undefined;
  const language = params.language ? String(params.language) : "en";
  const useUrdu = language.toLowerCase() === "ur";

  const report = await storage.getLedgerReport({
    accountId,
    referenceType,
    startDate,
    endDate,
    narration,
  });
  const account = report.account;
  const normalSide = (() => {
    const t = (account?.type || "").toLowerCase();
    return ["supplier", "liability", "equity", "income"].includes(t) ? "CREDIT" : "DEBIT";
  })();

  const columns = buildColumns([
    { key: "date", label: useUrdu ? "تاریخ" : "Date", width: "12%" },
    { key: "narration", label: useUrdu ? "تفصیل" : "Narration" },
    { key: "debit", label: useUrdu ? "ڈیبٹ" : "Debit", align: "right", width: "12%" },
    { key: "credit", label: useUrdu ? "کریڈٹ" : "Credit", align: "right", width: "12%" },
    { key: "balance", label: useUrdu ? "بقایا" : "Balance", align: "right", width: "12%" },
  ]);

  const ledgerDate = (value?: string | number | Date) => {
    if (!value) return "";
    try {
      return format(new Date(value), "dd.MM.yy");
    } catch {
      return "";
    }
  };
  const ledgerMoney = (value?: string | number | null) => {
    const num = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
    if (!Number.isFinite(num)) return "0.00";
    return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const balanceLabel = (value?: string | number | null) => {
    const num = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
    if (!Number.isFinite(num) || num === 0) return ledgerMoney(0);
    const side = num >= 0
      ? (normalSide === "DEBIT" ? "DR" : "CR")
      : (normalSide === "DEBIT" ? "CR" : "DR");
    return `${ledgerMoney(Math.abs(num))} ${side}`;
  };

  const rows = report.rows.map((e) => {
    return {
      date: ledgerDate(e.entryDate),
      narration: e.narration,
      debit: parseFloat(e.debit || "0") > 0 ? ledgerMoney(e.debit) : "-",
      credit: parseFloat(e.credit || "0") > 0 ? ledgerMoney(e.credit) : "-",
      balance: balanceLabel(e.runningBalance),
    };
  });

  return {
    docType: "REPORT",
    docKey: "report.ledger",
    title:
      scope === "sales"
        ? "Sales Ledger"
        : scope === "purchases"
          ? "Purchase Ledger"
          : scope === "journal"
            ? "Journal Ledger"
            : scope === "expenses"
              ? "Expense Ledger"
              : scope === "payroll"
                ? "Payroll Ledger"
                : scope === "employee"
                  ? "Employee Pay Ledger"
                  : scope === "cash"
                    ? "Cash Ledger"
                    : scope === "bank"
                      ? "Bank Ledger"
                      : "Ledger",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: startDate ? fmtDate(startDate) : undefined,
      dateTo: endDate ? fmtDate(endDate) : undefined,
      filters: {
        Account: account?.name || `#${accountId}`,
        ...(narration ? { Narration: narration } : {}),
        ...(voucherTypeRaw ? { VoucherType: voucherTypeRaw } : {}),
      },
    }),
    sections: [
      summaryCard("Opening", balanceLabel(report.openingBalance)),
      summaryCard("Debit", ledgerMoney(report.totals.debit), true),
      summaryCard("Credit", ledgerMoney(report.totals.credit), true),
      summaryCard("Closing", balanceLabel(report.totals.closingBalance), true),
    ],
    signatures: [],
    table: {
      columns,
      rows,
      totalsRow: {
        date: "",
        narration: useUrdu ? "کل" : "Totals",
        debit: ledgerMoney(report.totals.debit),
        credit: ledgerMoney(report.totals.credit),
        balance: balanceLabel(report.totals.closingBalance),
      },
    },
    settings: { currency: "PKR" },
  };
}

export async function mapTrialBalance(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const asOfDate = params.asOfDate ? new Date(String(params.asOfDate)) : undefined;
  const report = await storage.getTrialBalance(asOfDate);

  const columns = buildColumns([
    { key: "account", label: "Account" },
    { key: "debit", label: "Debit", align: "right", width: "20%" },
    { key: "credit", label: "Credit", align: "right", width: "20%" },
  ]);

  const rows = report.rows.map((r) => ({
    account: r.account?.name || "-",
    debit: parseFloat(r.debit || "0") > 0 ? money(r.debit) : "-",
    credit: parseFloat(r.credit || "0") > 0 ? money(r.credit) : "-",
  }));

  return {
    docType: "REPORT",
    docKey: "report.trialBalance",
    title: "Trial Balance",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateTo: asOfDate ? fmtDate(asOfDate) : undefined,
      filters: {
        Balanced: report.validation.balanced ? "Yes" : "No",
        Difference: report.validation.difference || "0",
      },
    }),
    sections: [
      summaryCard("Total Debit", money(report.totals.debit), true),
      summaryCard("Total Credit", money(report.totals.credit), true),
    ],
    table: {
      columns,
      rows,
      totalsRow: {
        account: "Totals",
        debit: money(report.totals.debit),
        credit: money(report.totals.credit),
      },
    },
    settings: { currency: "PKR" },
  };
}

export async function mapBalanceSheet(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const asOfDate = params.asOfDate ? new Date(String(params.asOfDate)) : undefined;
  const report = await storage.getBalanceSheet(asOfDate ?? new Date());

  const columns = buildColumns([
    { key: "account", label: "Account" },
    { key: "amount", label: "Amount", align: "right", width: "25%" },
  ]);

  const rows: Array<Record<string, any>> = [];
  rows.push({ __group: "Assets" });
  rows.push({ account: "Cash", amount: money(report.assets.cash) });
  rows.push({ account: "Bank", amount: money(report.assets.bank) });
  rows.push({ account: "Receivables", amount: money(report.assets.receivables) });
  rows.push({ account: "Inventory", amount: money(report.assets.inventory) });
  rows.push({ account: "Total Assets", amount: money(report.assets.total), __groupTotal: true });
  rows.push({ __group: "Liabilities" });
  rows.push({ account: "Payables", amount: money(report.liabilities.payables) });
  rows.push({ account: "Expenses Payable", amount: money(report.liabilities.expensesPayable) });
  rows.push({ account: "Total Liabilities", amount: money(report.liabilities.total), __groupTotal: true });
  rows.push({ __group: "Equity" });
  rows.push({ account: "Capital", amount: money(report.equity.capital) });
  rows.push({ account: "Retained Earnings", amount: money(report.equity.retainedEarnings) });
  rows.push({ account: "Total Equity", amount: money(report.equity.total), __groupTotal: true });

  return {
    docType: "STATEMENT",
    docKey: "statement.balanceSheet",
    title: "Balance Sheet",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateTo: asOfDate ? fmtDate(asOfDate) : undefined,
      filters: {
        Balanced: report.validation.balanced ? "Yes" : "No",
        Difference: report.validation.difference || "0",
      },
    }),
    sections: [
      summaryCard("Assets", money(report.totals.assets), true),
      summaryCard("Liabilities + Equity", money(report.totals.liabilitiesAndEquity), true),
    ],
    table: {
      columns,
      rows,
    },
    settings: { currency: "PKR" },
  };
}
export async function mapStockReport(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const report = await storage.getStockReport({
    fromDate: params.fromDate ? new Date(String(params.fromDate)) : undefined,
    toDate: params.toDate ? new Date(String(params.toDate)) : undefined,
    productId: params.productId ? Number(params.productId) : undefined,
    category: params.category ? String(params.category) : undefined,
    unit: params.unit ? String(params.unit) : undefined,
  });

  const columns = buildColumns([
    { key: "itemCode", label: "Item Code", width: "6%" },
    { key: "itemName", label: "Item Name", width: "20%" },
    { key: "category", label: "Category", width: "9%" },
    { key: "unit", label: "Unit", align: "center", width: "5%" },
    { key: "openingQty", label: "Opening Qty", align: "right", width: "6%" },
    { key: "openingValue", label: "Opening Value", align: "right", width: "9%" },
    { key: "inQty", label: "In Qty", align: "right", width: "6%" },
    { key: "inValue", label: "In Value", align: "right", width: "9%" },
    { key: "outQty", label: "Out Qty", align: "right", width: "6%" },
    { key: "outValue", label: "Out Value", align: "right", width: "9%" },
    { key: "closingQty", label: "Closing Qty", align: "right", width: "6%" },
    { key: "avgCost", label: "Avg Cost", align: "right", width: "8%" },
    { key: "closingValue", label: "Closing Value", align: "right", width: "9%" },
  ]);

  const rows = report.rows.map((r) => ({
    itemCode: r.itemCode,
    itemName: r.itemName,
    category: r.category || "-",
    unit: r.unit,
    openingQty: num(r.openingQty),
    openingValue: money(r.openingValue),
    inQty: num(r.inQty),
    inValue: money(r.inValue),
    outQty: num(r.outQty),
    outValue: money(r.outValue),
    closingQty: num(r.closingQty),
    avgCost: money(r.avgCost),
    closingValue: money(r.closingValue),
  }));

  return {
    docType: "REPORT",
    docKey: "report.stock",
    title: "Stock Report",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: params.fromDate,
      dateTo: params.toDate,
      filters: {
        Product: filterLabel(params.productId, await lookupProductName(params.productId)),
        Category: filterTextLabel(params.category),
        Unit: filterTextLabel(params.unit),
      },
    }),
    sections: [
      summaryCard("Total Items", String(report.rows.length)),
      summaryCard("Closing Qty", num(report.totals.closingQty), true),
      summaryCard("Closing Value", money(report.totals.closingValue), true),
    ],
    table: {
      columns,
      rows,
      totalsRow: {
        itemCode: "",
        itemName: "Totals",
        category: "",
        unit: "",
        openingQty: num(report.totals.openingQty),
        openingValue: "",
        inQty: num(report.totals.inQty),
        inValue: "",
        outQty: num(report.totals.outQty),
        outValue: "",
        closingQty: num(report.totals.closingQty),
        closingValue: money(report.totals.closingValue),
      },
    },
    settings: { currency: "PKR" },
  };
}

export async function mapPurchaseReport(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const report = await storage.getPurchaseReport({
    fromDate: params.fromDate ? new Date(String(params.fromDate)) : undefined,
    toDate: params.toDate ? new Date(String(params.toDate)) : undefined,
    supplierId: params.supplierId ? Number(params.supplierId) : undefined,
    productId: params.productId ? Number(params.productId) : undefined,
    paymentStatus: params.paymentStatus,
  });

  const columns = buildColumns([
    { key: "invoice", label: "Purchase No" },
    { key: "date", label: "Date", width: "14%" },
    { key: "supplier", label: "Supplier" },
    { key: "subtotal", label: "Subtotal", align: "right" },
    { key: "discount", label: "Less Charges", align: "right" },
    { key: "tax", label: "Tax", align: "right" },
    { key: "other", label: "Other", align: "right" },
    { key: "total", label: "Total", align: "right" },
    { key: "paid", label: "Paid", align: "right" },
    { key: "balance", label: "Balance", align: "right" },
    { key: "status", label: "Status", align: "center" },
  ]);

  const rows = report.rows.map((r) => ({
    invoice: r.invoiceNumber,
    date: fmtDate(r.purchaseDate),
    supplier: r.supplierName,
    subtotal: money(r.subtotal),
    discount: money(r.discount),
    tax: money(r.tax),
    other: money(r.otherCharges),
    total: money(r.total),
    paid: money(r.paid),
    balance: money(r.balance),
    status: statusLabel(r.status),
  }));

  return {
    docType: "REPORT",
    docKey: "report.purchases",
    title: "Purchase Report",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: params.fromDate,
      dateTo: params.toDate,
      filters: {
        Supplier: filterLabel(params.supplierId, await lookupAccountName(params.supplierId)),
        Product: filterLabel(params.productId, await lookupProductName(params.productId)),
        Status: filterTextLabel(params.paymentStatus),
      },
    }),
    sections: [
      summaryCard("Total", money(report.totals.total), true),
      summaryCard("Paid", money(report.totals.paid)),
      summaryCard("Balance", money(report.totals.balance)),
    ],
    table: {
      columns,
      rows,
      totalsRow: {
        invoice: "",
        date: "",
        supplier: "Totals",
        subtotal: money(report.totals.subtotal),
        discount: money(report.totals.discount),
        tax: money(report.totals.tax),
        other: money(report.totals.otherCharges),
        total: money(report.totals.total),
        paid: money(report.totals.paid),
        balance: money(report.totals.balance),
      },
    },
    settings: { currency: "PKR" },
  };
}

export async function mapSalesReport(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const report = await storage.getSalesReport({
    fromDate: params.fromDate ? new Date(String(params.fromDate)) : undefined,
    toDate: params.toDate ? new Date(String(params.toDate)) : undefined,
    customerId: params.customerId ? Number(params.customerId) : undefined,
    productId: params.productId ? Number(params.productId) : undefined,
    paymentStatus: params.paymentStatus,
  });
  // Use the report's own totals rather than re-summing here — a second
  // accumulator is a second source of truth that can drift from the screen.
  const totals = report.totals;

  const columns = buildColumns([
    { key: "invoice", label: "Sales No" },
    { key: "date", label: "Date", width: "14%" },
    { key: "customer", label: "Customer" },
    { key: "subtotal", label: "Subtotal", align: "right" },
    { key: "discount", label: "Discount", align: "right" },
    { key: "tax", label: "Tax", align: "right" },
    { key: "other", label: "Other", align: "right" },
    { key: "total", label: "Total", align: "right" },
    { key: "received", label: "Received", align: "right" },
    { key: "balance", label: "Balance", align: "right" },
    { key: "status", label: "Status", align: "center" },
  ]);

  const rows = report.rows.map((r) => ({
    invoice: r.invoiceNumber,
    date: fmtDate(r.saleDate),
    customer: r.customerName,
    subtotal: money(r.subtotal),
    discount: money(r.discount),
    tax: money(r.tax),
    other: money(r.otherCharges),
    total: money(r.total),
    received: money(r.received),
    balance: money(r.balance),
    status: statusLabel(r.status),
  }));

  return {
    docType: "REPORT",
    docKey: "report.sales",
    title: "Sales Report",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: params.fromDate,
      dateTo: params.toDate,
      filters: {
        Customer: filterLabel(params.customerId, await lookupAccountName(params.customerId)),
        Product: filterLabel(params.productId, await lookupProductName(params.productId)),
        Status: filterTextLabel(params.paymentStatus),
      },
    }),
    sections: [
      summaryCard("Total", money(totals.total), true),
      summaryCard("Received", money(totals.received)),
      summaryCard("Balance", money(totals.balance)),
    ],
    table: {
      columns,
      rows,
      totalsRow: {
        invoice: "",
        date: "",
        customer: "Totals",
        subtotal: money(totals.subtotal),
        discount: money(totals.discount),
        tax: money(totals.tax),
        other: money(totals.otherCharges),
        total: money(totals.total),
        received: money(totals.received),
        balance: money(totals.balance),
        status: "",
      },
    },
    settings: { currency: "PKR" },
  };
}

export async function mapBardanaReport(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const fromDate = params.fromDate ? new Date(String(params.fromDate)) : undefined;
  const toDate = params.toDate ? new Date(String(params.toDate)) : undefined;
  const supplierId = params.supplierId ? Number(params.supplierId) : undefined;
  const supplier = supplierId ? await storage.getAccount(supplierId) : undefined;
  const report = await storage.getBardanaReport({ fromDate, toDate, supplierId });

  return {
    docType: "REPORT",
    docKey: "report.bardana",
    title: "Bardana / Kaat Report",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: fromDate ? fmtDate(fromDate) : undefined,
      dateTo: toDate ? fmtDate(toDate) : undefined,
      filters: {
        Supplier: supplier?.name || (supplierId ? String(supplierId) : "All"),
      },
    }),
    sections: [
      summaryCard("Total Bardana / Kaat", `${num(report.totals.totalKg)} kg`, true),
      summaryCard("Total Bags", num(report.totals.totalBags)),
      summaryCard("Avg / Bag", `${num(report.totals.avgPerBag)} kg`),
      summaryCard("Purchases", report.totals.purchaseCount.toLocaleString("en-PK")),
    ],
    settings: { currency: "PKR" },
  };
}

export async function mapLessReport(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const fromDate = params.fromDate ? new Date(String(params.fromDate)) : undefined;
  const toDate = params.toDate ? new Date(String(params.toDate)) : undefined;
  const supplierId = params.supplierId ? Number(params.supplierId) : undefined;
  const supplier = supplierId ? await storage.getAccount(supplierId) : undefined;
  const report = await storage.getLessReport({ fromDate, toDate, supplierId });

  return {
    docType: "REPORT",
    docKey: "report.less",
    title: "Less / Watta Kaat (Moisture + Quality) Report",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: fromDate ? fmtDate(fromDate) : undefined,
      dateTo: toDate ? fmtDate(toDate) : undefined,
      filters: {
        Supplier: supplier?.name || (supplierId ? String(supplierId) : "All"),
      },
    }),
    sections: [
      summaryCard("Total Less / Watta Kaat (Moisture + Quality)", `${num(report.totals.totalKg)} kg`, true),
      summaryCard("Total Bags", num(report.totals.totalBags)),
      summaryCard("Avg / Bag", `${num(report.totals.avgPerBag)} kg`),
      summaryCard("Purchases", report.totals.purchaseCount.toLocaleString("en-PK")),
    ],
    settings: { currency: "PKR" },
  };
}

export async function mapPeriodPurchases(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const fromDate = params.fromDate ? new Date(String(params.fromDate)) : new Date(0);
  const toDate = params.toDate ? new Date(String(params.toDate)) : new Date(9999, 11, 31);
  const supplierId = params.supplierId ? Number(params.supplierId) : undefined;
  const groupBy = (params.groupBy as "day" | "week" | "month") || "month";
  const report = await storage.getPeriodPurchases(fromDate, toDate, supplierId, groupBy);

  const columns = buildColumns([
    { key: "period", label: "Period" },
    { key: "total", label: "Total Purchases", align: "right" },
    { key: "paid", label: "Paid", align: "right" },
    { key: "balance", label: "Balance", align: "right" },
    { key: "count", label: "Invoices", align: "right" },
  ]);

  const rows = report.rows.map((r: any) => ({
    period: r.period,
    total: money(r.totalAmount),
    paid: money(r.paidAmount),
    balance: money(r.balanceAmount),
    count: String(r.invoiceCount),
  }));

  return {
    docType: "REPORT",
    docKey: "report.periodPurchases",
    title: "Period-wise Purchases",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: fmtDate(fromDate),
      dateTo: fmtDate(toDate),
      filters: {
        GroupBy: filterTextLabel(groupBy),
        Supplier: filterLabel(supplierId, await lookupAccountName(supplierId)),
      },
    }),
    sections: [
      summaryCard("Total Purchases", money(report.totals.totalAmount), true),
      summaryCard("Paid", money(report.totals.paidAmount)),
      summaryCard("Balance", money(report.totals.balanceAmount)),
    ],
    table: {
      columns,
      rows,
      totalsRow: {
        period: "Totals",
        total: money(report.totals.totalAmount),
        paid: money(report.totals.paidAmount),
        balance: money(report.totals.balanceAmount),
        count: String(report.totals.invoiceCount),
      },
    },
    settings: { currency: "PKR" },
  };
}

export async function mapPeriodSales(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const fromDate = params.fromDate ? new Date(String(params.fromDate)) : new Date(0);
  const toDate = params.toDate ? new Date(String(params.toDate)) : new Date(9999, 11, 31);
  const customerId = params.customerId ? Number(params.customerId) : undefined;
  const groupBy = (params.groupBy as "day" | "week" | "month") || "month";
  const report = await storage.getPeriodSales(fromDate, toDate, customerId, groupBy);

  const columns = buildColumns([
    { key: "period", label: "Period" },
    { key: "total", label: "Total Sales", align: "right" },
    { key: "received", label: "Received", align: "right" },
    { key: "balance", label: "Balance", align: "right" },
    { key: "count", label: "Invoices", align: "right" },
  ]);

  const rows = report.rows.map((r: any) => ({
    period: r.period,
    total: money(r.totalAmount),
    received: money(r.receivedAmount),
    balance: money(r.balanceAmount),
    count: String(r.invoiceCount),
  }));

  return {
    docType: "REPORT",
    docKey: "report.periodSales",
    title: "Period-wise Sales",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: fmtDate(fromDate),
      dateTo: fmtDate(toDate),
      filters: {
        GroupBy: filterTextLabel(groupBy),
        Customer: filterLabel(customerId, await lookupAccountName(customerId)),
      },
    }),
    sections: [
      summaryCard("Total Sales", money(report.totals.totalAmount), true),
      summaryCard("Received", money(report.totals.receivedAmount)),
      summaryCard("Balance", money(report.totals.balanceAmount)),
    ],
    table: {
      columns,
      rows,
      totalsRow: {
        period: "Totals",
        total: money(report.totals.totalAmount),
        received: money(report.totals.receivedAmount),
        balance: money(report.totals.balanceAmount),
        count: String(report.totals.invoiceCount),
      },
    },
    settings: { currency: "PKR" },
  };
}
export async function mapGrossProfit(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const fromDate = params.fromDate ? new Date(String(params.fromDate)) : new Date(0);
  const toDate = params.toDate ? new Date(String(params.toDate)) : new Date(9999, 11, 31);
  const report = await storage.getGrossProfit(fromDate, toDate);

  return {
    docType: "REPORT",
    docKey: "report.grossProfit",
    title: "Gross Profit",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: fmtDate(fromDate),
      dateTo: fmtDate(toDate),
    }),
    sections: [
      summaryCard("Net Sales", money(report.netSales), true),
      summaryCard("COGS", money(report.costOfGoodsSold)),
      summaryCard("Gross Profit", money(report.grossProfit), true),
      summaryCard("Margin %", `${num(report.grossMarginPercent)}%`),
    ],
    settings: { currency: "PKR" },
  };
}

export async function mapDayBook(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const type = String(params.daybookType || params.kind || "").trim() || "legacy";
  const dateFrom = params.dateFrom ? new Date(String(params.dateFrom)) : undefined;
  const dateTo = params.dateTo ? new Date(String(params.dateTo)) : undefined;
  const filters = {
    dateFrom: dateFrom ? dateFrom.toISOString() : undefined,
    dateTo: dateTo ? dateTo.toISOString() : undefined,
    status: params.status ? String(params.status) : undefined,
    search: params.search ? String(params.search) : undefined,
  };

  if (!["sales", "purchases", "cash", "sales-returns", "purchase-returns", "general-journal", "all"].includes(type)) {
    const date = params.date ? new Date(String(params.date)) : new Date();
    const report = await storage.getDayBook(date);
    const balanceLabel = (amount?: string | number | null, side?: string) => {
      const n = typeof amount === "number" ? amount : parseFloat(String(amount ?? "0"));
      if (!Number.isFinite(n) || n === 0) return "0.00";
      const t = side || (n >= 0 ? "DR" : "CR");
      return `${Math.abs(n).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t}`;
    };

    const columns = buildColumns([
      { key: "srNo", label: "Sr.No", width: "8%" },
      { key: "id", label: "ID", width: "12%" },
      { key: "type", label: "Type", width: "8%" },
      { key: "particulars", label: "Particulars" },
      { key: "receipt", label: "Receipt", align: "right", width: "14%" },
      { key: "payment", label: "Payment", align: "right", width: "14%" },
      { key: "balance", label: "Balance", align: "right", width: "14%" },
    ]);

    const rows = [
      {
        srNo: "",
        id: "",
        type: "",
        particulars: "OPENING BALANCE",
        receipt: "0.00",
        payment: "0.00",
        balance: balanceLabel(report.openingBalance.amount, report.openingBalance.type),
      },
      ...report.rows.map((r: any) => ({
        srNo: String(r.srNo),
        id: r.id || "-",
        type: r.type || "-",
        particulars: [`[${r.partyName || "-"}]`, r.mode || ""].filter(Boolean).join("\n"),
        receipt: parseFloat(r.receipt || "0") > 0 ? num(r.receipt) : "0.00",
        payment: parseFloat(r.payment || "0") > 0 ? num(r.payment) : "0.00",
        balance: balanceLabel(r.balanceAmount, r.balanceType),
      })),
    ];

    return {
      docType: "REPORT",
      docKey: "report.dayBook",
      title: "Day Book",
      company: ctx.company,
      meta: baseMeta(ctx, { dateFrom: fmtDate(date), dateTo: fmtDate(date) }),
      table: {
        columns,
        rows,
        totalsRow: {
          srNo: "",
          id: "",
          type: "",
          particulars: "Total:",
          receipt: num(report.totals.receipt),
          payment: num(report.totals.payment),
          balance: "",
        },
      },
      settings: { currency: "PKR" },
    };
  }

  let title = "Day Book";
  let columns: PrintableTableColumn[] = [];
  let rows: Array<Record<string, any>> = [];
  let sections: PrintableSection[] = [];

  if (type === "all") {
    const sales = daybooksService.listSalesDaybook(filters as any) as any[];
    const purchases = daybooksService.listPurchasesDaybook(filters as any) as any[];
    const cash = daybooksService.listCashBook(filters as any) as any[];
    const salesReturns = daybooksService.listSalesReturnsDaybook(filters as any) as any[];
    const purchaseReturns = daybooksService.listPurchaseReturnsDaybook(filters as any) as any[];
    const journals = daybooksService.listGeneralJournal(filters as any) as any[];

    const sectionHeader = (name: string) => ({
      book: `${name}`,
      date: "",
      reference: "",
      party: "",
      details: "",
      amount: "",
      status: "",
      __groupTotal: true as any,
    });
    const spacer = () => ({ book: "", date: "", reference: "", party: "", details: "", amount: "", status: "" });

    columns = buildColumns([
      { key: "book", label: "Daybook" },
      { key: "date", label: "Date", width: "12%" },
      { key: "reference", label: "Reference", width: "14%" },
      { key: "party", label: "Party" },
      { key: "details", label: "Details" },
      { key: "amount", label: "Amount", align: "right", width: "14%" },
      { key: "status", label: "Status", width: "12%" },
    ]);

    const salesRows = sales.map((r) => ({
      book: "Sales",
      date: fmtDate(r.transaction_date),
      reference: r.invoice_number || "-",
      party: r.customer_name || "-",
      details: r.description || "",
      amount: money(r.total_amount),
      status: r.status || "-",
    }));
    const purchaseRows = purchases.map((r) => ({
      book: "Purchases",
      date: fmtDate(r.transaction_date),
      reference: r.invoice_number || "-",
      party: r.supplier_name || "-",
      details: r.description || "",
      amount: money(r.total_amount),
      status: r.status || "-",
    }));
    const cashRows = cash.map((r) => ({
      book: "Cash",
      date: fmtDate(r.transaction_date),
      reference: r.reference_number || "-",
      party: r.party_name || "-",
      details: `${r.account_type || ""} ${r.transaction_type || ""}`.trim(),
      amount: money(r.amount),
      status: r.transaction_type || "-",
    }));
    const salesReturnRows = salesReturns.map((r) => ({
      book: "Sales Returns",
      date: fmtDate(r.return_date),
      reference: r.credit_note_number || "-",
      party: r.customer_name || "-",
      details: r.reason || r.description || "",
      amount: money(r.total_credit_amount),
      status: r.status || "-",
    }));
    const purchaseReturnRows = purchaseReturns.map((r) => ({
      book: "Purchase Returns",
      date: fmtDate(r.return_date),
      reference: r.debit_note_number || "-",
      party: r.supplier_name || "-",
      details: r.reason || r.description || "",
      amount: money(r.total_debit_amount),
      status: r.status || "-",
    }));
    const journalRows = journals.map((r) => ({
      book: "General Journal",
      date: fmtDate(r.transaction_date),
      reference: r.journal_entry_number || "-",
      party: "-",
      details: r.description || "",
      amount: money(r.total_debits || r.total_credits || 0),
      status: r.status || "-",
    }));

    rows = [
      sectionHeader("Sales Daybook"),
      ...salesRows,
      spacer(),
      sectionHeader("Purchases Daybook"),
      ...purchaseRows,
      spacer(),
      sectionHeader("Cash Book"),
      ...cashRows,
      spacer(),
      sectionHeader("Sales Returns Daybook"),
      ...salesReturnRows,
      spacer(),
      sectionHeader("Purchase Returns Daybook"),
      ...purchaseReturnRows,
      spacer(),
      sectionHeader("General Journal"),
      ...journalRows,
    ];

    sections = [
      summaryCard("Sales Entries", String(sales.length), true),
      summaryCard("Purchase Entries", String(purchases.length), true),
      summaryCard("Cash Entries", String(cash.length), true),
      summaryCard("Sales Returns", String(salesReturns.length), true),
      summaryCard("Purchase Returns", String(purchaseReturns.length), true),
      summaryCard("Journal Entries", String(journals.length), true),
    ];

    return {
      docType: "REPORT",
      docKey: "report.dayBook",
      title: "All Daybooks",
      company: ctx.company,
      meta: baseMeta(ctx, {
        dateFrom: dateFrom ? fmtDate(dateFrom) : undefined,
        dateTo: dateTo ? fmtDate(dateTo) : undefined,
        filters: { Type: "All" },
      }),
      sections,
      table: { columns, rows },
      settings: { currency: "PKR" },
    };
  }

  if (type === "sales") {
    title = "Sales Daybook";
    const data = daybooksService.listSalesDaybook(filters as any) as any[];
    columns = buildColumns([
      { key: "date", label: "Date" },
      { key: "invoice", label: "Invoice" },
      { key: "party", label: "Customer" },
      { key: "amount", label: "Amount", align: "right" },
      { key: "status", label: "Status" },
    ]);
    rows = data.map((r) => ({ date: fmtDate(r.transaction_date), invoice: r.invoice_number, party: r.customer_name, amount: money(r.total_amount), status: r.status }));
    const total = data.reduce((s, r) => s + parseFloat(String(r.total_amount || "0")), 0);
    const paid = data.reduce((s, r) => s + parseFloat(String(r.paid_amount || "0")), 0);
    sections = [summaryCard("Total Sales", money(total), true), summaryCard("Paid", money(paid)), summaryCard("Outstanding", money(total - paid))];
  } else if (type === "purchases") {
    title = "Purchases Daybook";
    const data = daybooksService.listPurchasesDaybook(filters as any) as any[];
    columns = buildColumns([
      { key: "date", label: "Date" },
      { key: "invoice", label: "Invoice" },
      { key: "party", label: "Supplier" },
      { key: "amount", label: "Amount", align: "right" },
      { key: "status", label: "Status" },
    ]);
    rows = data.map((r) => ({ date: fmtDate(r.transaction_date), invoice: r.invoice_number, party: r.supplier_name, amount: money(r.total_amount), status: r.status }));
    const total = data.reduce((s, r) => s + parseFloat(String(r.total_amount || "0")), 0);
    const paid = data.reduce((s, r) => s + parseFloat(String(r.paid_amount || "0")), 0);
    sections = [summaryCard("Total Purchases", money(total), true), summaryCard("Paid", money(paid)), summaryCard("Outstanding", money(total - paid))];
  } else if (type === "cash") {
    title = "Cash Book";
    const data = daybooksService.listCashBook(filters as any) as any[];
    columns = buildColumns([
      { key: "date", label: "Date" },
      { key: "type", label: "Type" },
      { key: "account", label: "Account" },
      { key: "party", label: "Party" },
      { key: "amount", label: "Amount", align: "right" },
      { key: "running", label: "Running", align: "right" },
    ]);
    rows = data.map((r) => ({
      date: fmtDate(r.transaction_date),
      type: r.transaction_type,
      account: r.account_type,
      party: r.party_name || "-",
      amount: money(r.amount),
      running: num(r.runningBalance || 0),
    }));
    const receipt = data.filter((r) => r.transaction_type === "Receipt").reduce((s, r) => s + parseFloat(String(r.amount || "0")), 0);
    const payment = data.filter((r) => r.transaction_type === "Payment").reduce((s, r) => s + parseFloat(String(r.amount || "0")), 0);
    sections = [summaryCard("Receipts", money(receipt), true), summaryCard("Payments", money(payment)), summaryCard("Net", money(receipt - payment))];
  } else if (type === "sales-returns") {
    title = "Sales Returns Daybook";
    const data = daybooksService.listSalesReturnsDaybook(filters as any) as any[];
    columns = buildColumns([
      { key: "date", label: "Date" },
      { key: "note", label: "Credit Note" },
      { key: "party", label: "Customer" },
      { key: "amount", label: "Amount", align: "right" },
      { key: "status", label: "Status" },
    ]);
    rows = data.map((r) => ({ date: fmtDate(r.return_date), note: r.credit_note_number, party: r.customer_name, amount: money(r.total_credit_amount), status: r.status }));
    const total = data.reduce((s, r) => s + parseFloat(String(r.total_credit_amount || "0")), 0);
    sections = [summaryCard("Total Returns", money(total), true), summaryCard("Entries", String(data.length))];
  } else if (type === "purchase-returns") {
    title = "Purchase Returns Daybook";
    const data = daybooksService.listPurchaseReturnsDaybook(filters as any) as any[];
    columns = buildColumns([
      { key: "date", label: "Date" },
      { key: "note", label: "Debit Note" },
      { key: "party", label: "Supplier" },
      { key: "amount", label: "Amount", align: "right" },
      { key: "status", label: "Status" },
    ]);
    rows = data.map((r) => ({ date: fmtDate(r.return_date), note: r.debit_note_number, party: r.supplier_name, amount: money(r.total_debit_amount), status: r.status }));
    const total = data.reduce((s, r) => s + parseFloat(String(r.total_debit_amount || "0")), 0);
    sections = [summaryCard("Total Returns", money(total), true), summaryCard("Entries", String(data.length))];
  } else {
    title = "General Journal";
    const data = daybooksService.listGeneralJournal(filters as any) as any[];
    columns = buildColumns([
      { key: "date", label: "Date" },
      { key: "entryNo", label: "Entry No" },
      { key: "narration", label: "Narration" },
      { key: "debit", label: "Debit", align: "right" },
      { key: "credit", label: "Credit", align: "right" },
      { key: "status", label: "Status" },
    ]);
    rows = data.map((r) => ({ date: fmtDate(r.transaction_date), entryNo: r.journal_entry_number, narration: r.description, debit: money(r.total_debits), credit: money(r.total_credits), status: r.status }));
    const debit = data.reduce((s, r) => s + parseFloat(String(r.total_debits || "0")), 0);
    const credit = data.reduce((s, r) => s + parseFloat(String(r.total_credits || "0")), 0);
    sections = [summaryCard("Total Debits", money(debit), true), summaryCard("Total Credits", money(credit), true), summaryCard("Entries", String(data.length))];
  }

  return {
    docType: "REPORT",
    docKey: "report.dayBook",
    title,
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: dateFrom ? fmtDate(dateFrom) : undefined,
      dateTo: dateTo ? fmtDate(dateTo) : undefined,
      filters: {
        Type: filterTextLabel(type),
        ...(filters.status ? { Status: filterTextLabel(filters.status) } : {}),
        ...(filters.search ? { Search: filters.search } : {}),
      },
    }),
    sections,
    table: { columns, rows },
    settings: { currency: "PKR" },
  };
}

export async function mapOutstandingCustomers(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const asOfDate = params.asOfDate ? new Date(String(params.asOfDate)) : new Date();
  const customerId = params.customerId ? Number(params.customerId) : undefined;
  const report = await storage.getOutstandingCustomers(asOfDate, customerId);

  const columns = buildColumns([
    { key: "invoiceNo", label: "Invoice No" },
    { key: "invoiceDate", label: "Date", width: "14%" },
    { key: "customer", label: "Customer" },
    { key: "invoice", label: "Invoice", align: "right" },
    { key: "received", label: "Received", align: "right" },
    { key: "outstanding", label: "Outstanding", align: "right" },
    { key: "days", label: "Days", align: "right" },
    { key: "bucket0", label: "0-30", align: "right" },
    { key: "bucket31", label: "31-60", align: "right" },
    { key: "bucket61", label: "61-90", align: "right" },
    { key: "bucket91", label: "91+", align: "right" },
    { key: "dueDate", label: "Due Date", width: "14%" },
  ]);

  const rows = report.rows.map((r: any) => ({
    invoiceNo: r.invoiceNumber,
    invoiceDate: fmtDate(r.saleDate),
    customer: r.customerName,
    invoice: money(r.invoiceAmount),
    received: money(r.receivedAmount),
    outstanding: money(r.outstandingAmount),
    days: String(r.daysOutstanding ?? ""),
    bucket0: money(r.bucket0To30),
    bucket31: money(r.bucket31To60),
    bucket61: money(r.bucket61To90),
    bucket91: money(r.bucket91Plus),
    dueDate: r.dueDate ? fmtDate(r.dueDate) : "-",
  }));

  return {
    docType: "REPORT",
    docKey: "report.outstandingCustomers",
    title: "Outstanding Customers",
    company: ctx.company,
    meta: baseMeta(ctx, { dateTo: fmtDate(asOfDate) }),
    sections: [
      summaryCard("Total Outstanding", money(report.totals.outstandingAmount), true),
      summaryCard("Invoice Total", money(report.totals.invoiceAmount)),
      summaryCard("Received Total", money(report.totals.receivedAmount)),
    ],
    table: { columns, rows },
    settings: { currency: "PKR" },
  };
}

export async function mapOutstandingSuppliers(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const asOfDate = params.asOfDate ? new Date(String(params.asOfDate)) : new Date();
  const supplierId = params.supplierId ? Number(params.supplierId) : undefined;
  const report = await storage.getOutstandingSuppliers(asOfDate, supplierId);

  const columns = buildColumns([
    { key: "billNo", label: "Bill No" },
    { key: "billDate", label: "Date", width: "14%" },
    { key: "supplier", label: "Supplier" },
    { key: "bill", label: "Bill", align: "right" },
    { key: "paid", label: "Paid", align: "right" },
    { key: "outstanding", label: "Outstanding", align: "right" },
    { key: "days", label: "Days", align: "right" },
    { key: "bucket0", label: "0-30", align: "right" },
    { key: "bucket31", label: "31-60", align: "right" },
    { key: "bucket61", label: "61-90", align: "right" },
    { key: "bucket91", label: "91+", align: "right" },
    { key: "dueDate", label: "Due Date", width: "14%" },
  ]);

  const rows = report.rows.map((r: any) => ({
    billNo: r.invoiceNumber,
    billDate: fmtDate(r.purchaseDate),
    supplier: r.supplierName,
    bill: money(r.billAmount),
    paid: money(r.paidAmount),
    outstanding: money(r.outstandingAmount),
    days: String(r.daysOutstanding ?? ""),
    bucket0: money(r.bucket0To30),
    bucket31: money(r.bucket31To60),
    bucket61: money(r.bucket61To90),
    bucket91: money(r.bucket91Plus),
    dueDate: r.dueDate ? fmtDate(r.dueDate) : "-",
  }));

  return {
    docType: "REPORT",
    docKey: "report.outstandingSuppliers",
    title: "Outstanding Suppliers",
    company: ctx.company,
    meta: baseMeta(ctx, { dateTo: fmtDate(asOfDate) }),
    sections: [
      summaryCard("Total Outstanding", money(report.totals.outstandingAmount), true),
      summaryCard("Bill Total", money(report.totals.billAmount)),
      summaryCard("Paid Total", money(report.totals.paidAmount)),
    ],
    table: { columns, rows },
    settings: { currency: "PKR" },
  };
}

export async function mapIncomeStatement(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const fromDate = params.fromDate ? new Date(String(params.fromDate)) : new Date(0);
  const toDate = params.toDate ? new Date(String(params.toDate)) : new Date(9999, 11, 31);
  const report = await storage.getIncomeStatement(fromDate, toDate);

  const columns = buildColumns([
    { key: "label", label: "Description" },
    { key: "amount", label: "Amount", align: "right", width: "25%" },
  ]);

  const rows: Array<Record<string, any>> = [
    { label: "Revenue", amount: money(report.revenue) },
    { label: "Cost of Sales", amount: money(report.costOfSales) },
    { label: "Gross Profit", amount: money(report.grossProfit) },
    { label: "Operating Expenses", amount: money(report.operatingExpenses) },
    { label: "Net Profit", amount: money(report.netProfit) },
  ];

  return {
    docType: "STATEMENT",
    docKey: "statement.incomeStatement",
    title: "Income Statement",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: fmtDate(fromDate),
      dateTo: fmtDate(toDate),
    }),
    sections: [
      summaryCard("Net Profit", money(report.netProfit), true),
    ],
    table: { columns, rows },
    settings: { currency: "PKR" },
  };
}

export async function mapProfitLoss(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const fromDate = params.startDate ? new Date(String(params.startDate)) : undefined;
  const toDate = params.endDate ? new Date(String(params.endDate)) : undefined;
  const report = await storage.getProfitLoss(fromDate, toDate);

  return {
    docType: "STATEMENT",
    docKey: "statement.profitLoss",
    title: "Profit & Loss",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: report.period?.fromDate ? fmtDate(report.period.fromDate) : undefined,
      dateTo: report.period?.toDate ? fmtDate(report.period.toDate) : undefined,
    }),
    sections: [
      summaryCard("Revenue", money(report.revenue), true),
      summaryCard("Cost of Sales", money(report.costOfSales)),
      summaryCard("Gross Profit", money(report.grossProfit), true),
      summaryCard("Operating Expenses", money(report.operatingExpenses)),
      summaryCard("Net Profit", money(report.netProfit), true),
    ],
    settings: { currency: "PKR" },
  };
}

export async function mapCapital(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const fromDate = params.fromDate ? new Date(String(params.fromDate)) : new Date(0);
  const toDate = params.toDate ? new Date(String(params.toDate)) : new Date(9999, 11, 31);
  const report = await storage.getCapitalStatement(fromDate, toDate);

  const rows = [
    { label: "Opening Capital", amount: report.openingCapital },
    { label: "Additions", amount: report.additionalCapital },
    { label: "Drawings", amount: report.drawings },
    { label: "Net Profit", amount: report.netProfit },
    { label: "Closing Capital", amount: report.closingCapital },
  ];

  return {
    docType: "STATEMENT",
    docKey: "statement.capital",
    title: "Capital Statement",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: fmtDate(fromDate),
      dateTo: fmtDate(toDate),
    }),
    table: {
      columns: buildColumns([
        { key: "label", label: "Description" },
        { key: "amount", label: "Amount", align: "right" },
      ]),
      rows: rows.map((r) => ({ label: r.label, amount: money(r.amount) })),
    },
    settings: { currency: "PKR" },
  };
}

export async function mapSalary(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  const fromDate = params.fromDate ? new Date(String(params.fromDate)) : new Date(0);
  const toDate = params.toDate ? new Date(String(params.toDate)) : new Date(9999, 11, 31);
  const report = await storage.getSalaryAccount(fromDate, toDate);

  const columns = buildColumns([
    { key: "employee", label: "Employee" },
    { key: "month", label: "Month", align: "center" },
    { key: "basic", label: "Basic", align: "right" },
    { key: "allowances", label: "Allowances", align: "right" },
    { key: "deductions", label: "Deductions", align: "right" },
    { key: "net", label: "Net Salary", align: "right" },
    { key: "paid", label: "Paid", align: "right" },
    { key: "balance", label: "Balance", align: "right" },
  ]);

  const rows = report.rows.map((r: any) => ({
    employee: r.employee,
    month: r.salaryMonth,
    basic: money(r.basicSalary),
    allowances: money(r.allowances),
    deductions: money(r.deductions),
    net: money(r.netSalary),
    paid: money(r.paidAmount),
    balance: money(r.balanceAmount),
  }));

  return {
    docType: "REPORT",
    docKey: "report.salary",
    title: "Salary Account",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: fmtDate(fromDate),
      dateTo: fmtDate(toDate),
    }),
    sections: [
      summaryCard("Net Salary", money(report.totals.netSalary), true),
      summaryCard("Paid", money(report.totals.paidAmount)),
      summaryCard("Balance", money(report.totals.balanceAmount)),
    ],
    table: {
      columns,
      rows,
    },
    settings: { currency: "PKR" },
  };
}

import { format } from "date-fns";
import { storage } from "../../../storage";
import type { PrintableDocumentPayload, PrintableSection, PrintableTableColumn } from "@shared/print";

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

  const tableRows = items.map((it, index) => {
    const product = productMap.get(it.productId);
    return {
      sr: String(index + 1),
      item: product ? `${product.name} (${product.unit})` : `#${it.productId}`,
      qty: num(it.quantity),
      rate: money(it.pricePerUnit),
      amount: money(it.totalPrice),
    };
  });

  const charges = [
    { label: "Loading", value: sale.loadingCharges },
    { label: "Weighing", value: sale.weighingCharges },
    { label: "Other", value: sale.otherCharges },
  ];

  const sections = [
    summaryCard("Customer", customer?.name || "-"),
    summaryCard("Invoice Date", fmtDate(sale.saleDate)),
    summaryCard("Subtotal", money(sale.subtotal), true),
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
      rows: tableRows,
      totalsRow: {
        sr: "",
        item: "Totals",
        qty: "",
        rate: "",
        amount: money(sale.subtotal),
      },
    },
    notes: [
      ...charges.filter((c) => Number(c.value || 0) !== 0).map((c) => `${c.label}: ${money(c.value)}`),
      sale.notes ? `Notes: ${sale.notes}` : "",
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

  const charges = purchase.charges || [];

  const sections = [
    summaryCard("Supplier", supplier?.name || "-"),
    summaryCard("Invoice Date", fmtDate(purchase.purchaseDate)),
    summaryCard("Subtotal", money(purchase.subtotal), true),
    summaryCard("Total", money(purchase.totalAmount), true),
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
      rows: tableRows,
      totalsRow: {
        sr: "",
        item: "Totals",
        bags: num(purchase.totalBags),
        weight: num(purchase.totalNetWeightKg),
        rate: "",
        amount: money(purchase.subtotal),
      },
    },
    notes: [
      ...charges.map((c) => `${c.type}: ${money(c.amount)}`),
      purchase.notes ? `Notes: ${purchase.notes}` : "",
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

  const columns = buildColumns([
    { key: "date", label: useUrdu ? "تاریخ" : "Date", width: "12%" },
    { key: "narration", label: useUrdu ? "تفصیل" : "NARATION" },
    { key: "debit", label: useUrdu ? "ڈیبٹ" : "Debit", align: "right", width: "12%" },
    { key: "credit", label: useUrdu ? "کریڈٹ" : "Credit", align: "right", width: "12%" },
    { key: "balance", label: useUrdu ? "بقایا" : "Balance", align: "right", width: "12%" },
  ]);

  const openingLabel = useUrdu ? "ابتدائی بقایا" : "Opening Balance";
  const openingRow = {
    date: startDate ? fmtDate(startDate) : "",
    narration: openingLabel,
    voucher: "",
    debit: "",
    credit: "",
    balance: money(report.openingBalance),
  };

  const rows = [
    openingRow,
    ...report.rows.map((e) => {
      return {
        date: fmtDate(e.entryDate),
        narration: e.narration,
        debit: parseFloat(e.debit || "0") > 0 ? money(e.debit) : "-",
        credit: parseFloat(e.credit || "0") > 0 ? money(e.credit) : "-",
        balance: money(e.runningBalance),
      };
    }),
  ];

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
      summaryCard("Opening", money(report.openingBalance)),
      summaryCard("Debit", money(report.totals.debit), true),
      summaryCard("Credit", money(report.totals.credit), true),
      summaryCard("Closing", money(report.totals.closingBalance), true),
    ],
    table: {
      columns,
      rows,
      totalsRow: {
        date: "",
        narration: useUrdu ? "کل" : "Totals",
        debit: money(report.totals.debit),
        credit: money(report.totals.credit),
        balance: money(report.totals.closingBalance),
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
    { key: "itemCode", label: "Item Code" },
    { key: "itemName", label: "Item Name" },
    { key: "category", label: "Category" },
    { key: "unit", label: "Unit", align: "center" },
    { key: "openingQty", label: "Opening Qty", align: "right" },
    { key: "openingValue", label: "Opening Value", align: "right" },
    { key: "inQty", label: "In Qty", align: "right" },
    { key: "inValue", label: "In Value", align: "right" },
    { key: "outQty", label: "Out Qty", align: "right" },
    { key: "outValue", label: "Out Value", align: "right" },
    { key: "closingQty", label: "Closing Qty", align: "right" },
    { key: "closingValue", label: "Closing Value", align: "right" },
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
        Product: params.productId ? String(params.productId) : "All",
        Category: params.category || "All",
        Unit: params.unit || "All",
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
    { key: "discount", label: "Discount", align: "right" },
    { key: "tax", label: "Tax", align: "right" },
    { key: "other", label: "Other", align: "right" },
    { key: "total", label: "Total", align: "right" },
    { key: "paid", label: "Paid", align: "right" },
    { key: "balance", label: "Balance", align: "right" },
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
        Supplier: params.supplierId ? String(params.supplierId) : "All",
        Product: params.productId ? String(params.productId) : "All",
        Status: params.paymentStatus || "All",
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
        Customer: params.customerId ? String(params.customerId) : "All",
        Product: params.productId ? String(params.productId) : "All",
        Status: params.paymentStatus || "All",
      },
    }),
    sections: [
      summaryCard("Total", money(report.totals.total), true),
      summaryCard("Received", money(report.totals.received)),
      summaryCard("Balance", money(report.totals.balance)),
    ],
    table: {
      columns,
      rows,
      totalsRow: {
        invoice: "",
        date: "",
        customer: "Totals",
        subtotal: money(report.totals.subtotal),
        discount: money(report.totals.discount),
        tax: money(report.totals.tax),
        other: money(report.totals.otherCharges),
        total: money(report.totals.total),
        received: money(report.totals.received),
        balance: money(report.totals.balance),
      },
    },
    settings: { currency: "PKR" },
  };
}

export async function mapPeriodPurchases(params: Record<string, any>, ctx: PrintContext): Promise<PrintableDocumentPayload> {
  if (!params.fromDate || !params.toDate) {
    throw new Error("fromDate and toDate are required");
  }
  const fromDate = new Date(String(params.fromDate));
  const toDate = new Date(String(params.toDate));
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
        GroupBy: groupBy,
        Supplier: supplierId ? String(supplierId) : "All",
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
  if (!params.fromDate || !params.toDate) {
    throw new Error("fromDate and toDate are required");
  }
  const fromDate = new Date(String(params.fromDate));
  const toDate = new Date(String(params.toDate));
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
        GroupBy: groupBy,
        Customer: customerId ? String(customerId) : "All",
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
  if (!params.fromDate || !params.toDate) {
    throw new Error("fromDate and toDate are required");
  }
  const fromDate = new Date(String(params.fromDate));
  const toDate = new Date(String(params.toDate));
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
  const fromDate = params.fromDate ? new Date(String(params.fromDate)) : new Date();
  const toDate = params.toDate ? new Date(String(params.toDate)) : fromDate;
  const report = await storage.getDayBook(fromDate, toDate);

  const columns = buildColumns([
    { key: "date", label: "Date", width: "14%" },
    { key: "voucherType", label: "Voucher Type", width: "14%" },
    { key: "voucherNo", label: "Voucher No", width: "16%" },
    { key: "account", label: "Account" },
    { key: "narration", label: "Narration" },
    { key: "debit", label: "Debit", align: "right", width: "12%" },
    { key: "credit", label: "Credit", align: "right", width: "12%" },
  ]);

  const rows = report.rows.map((r: any) => ({
    date: fmtDate(r.date),
    voucherType: r.voucherType || "-",
    voucherNo: r.voucherNo || "-",
    account: r.accountName || "-",
    narration: r.narration || "",
    debit: parseFloat(r.debit || "0") > 0 ? money(r.debit) : "-",
    credit: parseFloat(r.credit || "0") > 0 ? money(r.credit) : "-",
  }));

  return {
    docType: "REPORT",
    docKey: "report.dayBook",
    title: "Day Book",
    company: ctx.company,
    meta: baseMeta(ctx, {
      dateFrom: fmtDate(fromDate),
      dateTo: fmtDate(toDate),
    }),
    sections: [
      summaryCard("Total Debit", money(report.totals.debit), true),
      summaryCard("Total Credit", money(report.totals.credit), true),
    ],
    table: {
      columns,
      rows,
      totalsRow: {
        date: "",
        voucherType: "",
        voucherNo: "",
        account: "Totals",
        narration: "",
        debit: money(report.totals.debit),
        credit: money(report.totals.credit),
      },
    },
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
  if (!params.fromDate || !params.toDate) {
    throw new Error("fromDate and toDate are required");
  }
  const fromDate = new Date(String(params.fromDate));
  const toDate = new Date(String(params.toDate));
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
  if (!params.fromDate || !params.toDate) {
    throw new Error("fromDate and toDate are required");
  }
  const fromDate = new Date(String(params.fromDate));
  const toDate = new Date(String(params.toDate));
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
  if (!params.fromDate || !params.toDate) {
    throw new Error("fromDate and toDate are required");
  }
  const fromDate = new Date(String(params.fromDate));
  const toDate = new Date(String(params.toDate));
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

/**
 * Report audit harness.
 *
 * Seeds a throwaway database with a known set of transactions, then runs every
 * report against it and cross-checks the numbers against independently derived
 * expectations. Run with:
 *
 *   cd server && npx tsx ../script/audit-reports.ts
 *
 * DATABASE_URL is set by the runner script so the live .local/data.db is never
 * touched.
 */
import { storage } from "../server/models/storage";
import { db, sqlite } from "../server/models/db";
import * as daybooks from "../server/services/daybooks.service";
import * as ledgerService from "../server/services/ledger.service";
import * as cashService from "../server/services/cash-in-hand.service";

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

const failures: string[] = [];
const notes: string[] = [];

function check(label: string, actual: number, expected: number, tol = 0.01) {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures.push(`${label}: actual=${round2(actual)} expected=${round2(expected)} diff=${round2(actual - expected)}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  actual=${round2(actual)} expected=${round2(expected)}`);
  return ok;
}

function note(msg: string) {
  notes.push(msg);
  console.log(`NOTE  ${msg}`);
}

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0, 0);

async function seed() {
  console.log("--- seeding ---");
  // Wipe transactional data so the audit runs against a known state.
  const wipe = [
    "ledger_entries", "cash_transactions", "cash_book", "cash_receipts", "cash_payments",
    "sale_items", "sales", "purchase_items", "purchase_charges", "purchases",
    "receipt_voucher_lines", "receipt_vouchers", "journal_voucher_entries", "journal_vouchers",
    "contra_voucher_lines", "contra_vouchers", "expense_entries", "processing",
    "sales_daybook", "purchases_daybook", "sales_returns_daybook", "purchase_returns_daybook",
    "general_journal", "invoice_allocations", "tax_ledgers", "payrolls",
  ];
  for (const t of wipe) {
    try { sqlite.prepare(`DELETE FROM ${t}`).run(); } catch (e) { /* table may not exist */ }
  }
  sqlite.prepare("UPDATE accounts SET current_balance='0', opening_balance='0'").run();
  sqlite.prepare("UPDATE products SET current_stock='0', avg_purchase_price='0'").run();
  sqlite.prepare("DELETE FROM sequences").run();

  const supplier = await storage.createAccount({
    name: "AUDIT Supplier A", type: "supplier", openingBalance: "0", isActive: true,
  } as any);
  const customer = await storage.createAccount({
    name: "AUDIT Customer A", type: "customer", openingBalance: "0", isActive: true,
  } as any);

  let wheat = (await storage.getProducts()).find((p) => p.name === "AUDIT Wheat");
  if (!wheat) {
    wheat = await storage.createProduct({
      name: "AUDIT Wheat", productType: "raw", unit: "kg", currentStock: "0",
      avgPurchasePrice: "0", salePrice: "60", reorderLevel: "0", isActive: true,
    } as any);
  }

  // Purchase: 1000 kg @ 50/kg = 50,000 with 500 add charge and 200 less charge.
  const purchase = await storage.createPurchase(
    {
      supplierId: supplier.id, purchaseDate: D(2025, 1, 10), paymentMode: "credit",
      paidAmount: "0", notes: "audit purchase 1",
    } as any,
    [{
      productId: wheat.id, serialNo: 1, marka: "A", bags: "20", fillingPerBagKg: "50",
      looseKgs: "0", grossWeightKg: "1010", lessKg: "5", bardanaKatKg: "5",
      netWeightKg: "1000", rateUnit: "kg", rate: "50",
    }] as any,
    [
      { type: "freight", mode: "add", amount: "500" },
      { type: "market_fee", mode: "less", amount: "200" },
    ] as any,
  );

  // Sale: 400 kg @ 80/kg, half paid in cash.
  const sale = await storage.createSale(
    {
      customerId: customer.id, saleDate: D(2025, 2, 5), paymentMode: "cash",
      paidAmount: "10000", loadingCharges: "300", weighingCharges: "100",
      otherCharges: "0", rentCharges: "0", discountAmount: "0", notes: "audit sale 1",
    } as any,
    [{ productId: wheat.id, quantity: "400", unit: "kg", pricePerUnit: "80" }] as any,
  );

  const allAccounts = await storage.getAccounts();
  const cashAccount = allAccounts.find((a) => a.name === "Cash in Hand")
    ?? (await storage.createAccount({ name: "Cash in Hand", type: "asset", openingBalance: "0", isActive: true } as any));
  let expenseAccount = allAccounts.find((a) => String(a.type).toLowerCase() === "expense" && a.name === "AUDIT Utilities");
  if (!expenseAccount) {
    expenseAccount = await storage.createAccount({ name: "AUDIT Utilities", type: "expense", openingBalance: "0", isActive: true } as any);
  }

  const expense = await storage.createExpense({
    description: "AUDIT electricity", amount: "1500", expenseDate: D(2025, 2, 12),
    expenseAccountId: expenseAccount.id, payFromAccountId: cashAccount.id,
  } as any);

  return { supplier, customer, wheat, purchase, sale, expense, cashAccount, expenseAccount };
}

async function main() {
  const ctx = await seed();
  const from = D(2025, 1, 1);
  const to = D(2025, 12, 31);

  console.log("\n--- raw source data ---");
  const rawSale: any = sqlite.prepare("SELECT * FROM sales WHERE id=?").get(ctx.sale.id);
  const rawPurchase: any = sqlite.prepare("SELECT * FROM purchases WHERE id=?").get(ctx.purchase.id);
  console.log("sale", { subtotal: rawSale.subtotal, tax: rawSale.tax_amount, total: rawSale.total_amount, paid: rawSale.paid_amount });
  console.log("purchase", { subtotal: rawPurchase.subtotal, add: rawPurchase.charges_add, less: rawPurchase.charges_less, total: rawPurchase.total_amount, paid: rawPurchase.paid_amount });
  const prod: any = sqlite.prepare("SELECT * FROM products WHERE id=?").get(ctx.wheat.id);
  console.log("product", { stock: prod.current_stock, avg: prod.avg_purchase_price });

  console.log("\n=== 1. STOCK REPORT ===");
  const stock = await storage.getStockReport({ fromDate: from, toDate: to });
  const stockRow = stock.rows.find((r: any) => r.productId === ctx.wheat.id)!;
  console.log(stockRow);
  // net kg = (bags 20 * filling 50) - lessKg 5 - bardanaKatKg 5 = 990 (see normalizePurchaseItem)
  check("stock.inQty == purchased net kg", num(stockRow.inQty), 990);
  check("stock.outQty == sold kg", num(stockRow.outQty), 400);
  check("stock.closingQty == products.currentStock", num(stockRow.closingQty), num(prod.current_stock));

  // valuation must be internally consistent: closing = opening + in - out and
  // avgCost = closingValue / closingQty (periodic weighted average).
  check("stock closingValue == opening+in-out",
    num(stockRow.closingValue),
    num(stockRow.openingValue) + num(stockRow.inValue) - num(stockRow.outValue));
  check("stock avgCost == closingValue/closingQty",
    num(stockRow.avgCost), num(stockRow.closingValue) / num(stockRow.closingQty));

  const stockNoDates = await storage.getStockReport({});
  const stockRowND = stockNoDates.rows.find((r: any) => r.productId === ctx.wheat.id)!;
  check("stock (no date filter) closingQty == currentStock", num(stockRowND.closingQty), num(prod.current_stock));
  check("stock validation.stockMatchesLedger is asserted", (stockNoDates.validation as any).stockMatchesLedger === true ? 1 : 0, 1);
  check("stock validation not evaluated on bounded window", (stock.validation as any).stockMatchesLedger === null ? 1 : 0, 1);

  const stockEmpty = await storage.getStockReport({ fromDate: D(2030, 1, 1), toDate: D(2030, 12, 31) });
  const seRow = stockEmpty.rows.find((r: any) => r.productId === ctx.wheat.id)!;
  check("stock empty-range inQty", num(seRow.inQty), 0);
  check("stock empty-range openingQty == closing", num(seRow.openingQty), num(prod.current_stock));

  console.log("\n=== 2. PURCHASE REPORT ===");
  const purchaseRep = await storage.getPurchaseReport({ fromDate: from, toDate: to });
  console.log(purchaseRep.totals);
  check("purchase total == raw total", num(purchaseRep.totals.total), num(rawPurchase.total_amount));
  check("purchase subtotal+add-less+tax == total",
    num(purchaseRep.totals.subtotal) + num(purchaseRep.totals.otherCharges) - num(purchaseRep.totals.discount) + num(purchaseRep.totals.tax),
    num(purchaseRep.totals.total));
  const purchaseBySupplier = await storage.getPurchaseReport({ fromDate: from, toDate: to, supplierId: ctx.supplier.id });
  check("purchase supplier filter keeps row", purchaseBySupplier.rows.length, 1);
  const purchaseOther = await storage.getPurchaseReport({ fromDate: from, toDate: to, supplierId: ctx.customer.id });
  check("purchase wrong-supplier filter empty", purchaseOther.rows.length, 0);
  const purchaseCombo = await storage.getPurchaseReport({ fromDate: from, toDate: to, supplierId: ctx.supplier.id, productId: ctx.wheat.id, paymentStatus: "unpaid" });
  check("purchase combined AND filter", purchaseCombo.rows.length, 1);
  // every row's own status must be exactly what the corresponding filter selects
  for (const st of ["paid", "partial", "unpaid"] as const) {
    const filtered = await storage.getPurchaseReport({ fromDate: from, toDate: to, paymentStatus: st });
    const expected = purchaseRep.rows.filter((r: any) => r.status === st).length;
    check(`purchase status filter '${st}' matches row status`, filtered.rows.length, expected);
  }
  check("purchase balance == total - paid", num(purchaseRep.totals.total) - num(purchaseRep.totals.paid), num(purchaseRep.totals.balance));

  console.log("\n=== 3/4. BARDANA + LESS ===");
  const bardana = await storage.getBardanaReport({ fromDate: from, toDate: to });
  const less = await storage.getLessReport({ fromDate: from, toDate: to });
  console.log("bardana", JSON.stringify(bardana).slice(0, 400));
  console.log("less", JSON.stringify(less).slice(0, 400));
  const rawDeduct: any = sqlite
    .prepare(
      `SELECT COALESCE(SUM(CAST(bardana_kat_kg AS REAL)),0) bardana,
              COALESCE(SUM(CAST(less_kg AS REAL)),0) less,
              COALESCE(SUM(CAST(bags AS REAL)),0) bags
         FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
        WHERE p.deleted_at IS NULL AND pi.deleted_at IS NULL`,
    )
    .get();
  check("bardana totalKg == raw sum(bardana_kat_kg)", num(bardana.totals.totalKg), num(rawDeduct.bardana));
  check("less totalKg == raw sum(less_kg)", num(less.totals.totalKg), num(rawDeduct.less));
  check("bardana totalBags == raw sum(bags)", num(bardana.totals.totalBags), num(rawDeduct.bags));
  check("bardana avgPerBag == totalKg/totalBags",
    num(bardana.totals.avgPerBag), num(bardana.totals.totalKg) / num(bardana.totals.totalBags));
  check("less avgPerBag == totalKg/totalBags",
    num(less.totals.avgPerBag), num(less.totals.totalKg) / num(less.totals.totalBags));
  // purchaseCount must count purchases carrying *this* deduction, not every
  // purchase in range, otherwise both reports show the same number.
  const rawBardanaPurchases: any = sqlite
    .prepare(
      `SELECT COUNT(DISTINCT p.id) c FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
        WHERE p.deleted_at IS NULL AND pi.deleted_at IS NULL AND CAST(pi.bardana_kat_kg AS REAL) > 0`,
    )
    .get();
  check("bardana purchaseCount counts only purchases with bardana",
    bardana.totals.purchaseCount, Number(rawBardanaPurchases.c));
  const bardanaBySupplier = await storage.getBardanaReport({ fromDate: from, toDate: to, supplierId: ctx.supplier.id });
  check("bardana supplier filter keeps totals", num(bardanaBySupplier.totals.totalKg), num(bardana.totals.totalKg));
  const bardanaOther = await storage.getBardanaReport({ fromDate: from, toDate: to, supplierId: ctx.customer.id });
  check("bardana wrong-supplier filter empties", num(bardanaOther.totals.totalKg), 0);
  check("bardana wrong-supplier avgPerBag safe (no div by zero)", num(bardanaOther.totals.avgPerBag), 0);
  const bardanaEmpty = await storage.getBardanaReport({ fromDate: D(2030, 1, 1), toDate: D(2030, 12, 31) });
  check("bardana empty range totals zero", num(bardanaEmpty.totals.totalKg), 0);
  check("bardana empty range purchaseCount zero", bardanaEmpty.totals.purchaseCount, 0);
  // Unfiltered must agree with the wide-window run — a left join would let
  // orphan purchase_items leak in only when no date filter is supplied.
  const bardanaNoFilter = await storage.getBardanaReport({});
  check("bardana unfiltered == wide-window", num(bardanaNoFilter.totals.totalKg), num(bardana.totals.totalKg));

  console.log("\n=== 5. SALES REPORT ===");
  const salesRep = await storage.getSalesReport({ fromDate: from, toDate: to });
  console.log(salesRep.totals);
  check("sales total == raw total", num(salesRep.totals.total), num(rawSale.total_amount));
  check("sales subtotal+charges-discount+tax == total",
    num(salesRep.totals.subtotal) + num(salesRep.totals.otherCharges) - num(salesRep.totals.discount) + num(salesRep.totals.tax),
    num(salesRep.totals.total));
  check("sales received == raw paid", num(salesRep.totals.received), num(rawSale.paid_amount));
  check("sales balance == total - received",
    num(salesRep.totals.balance), num(salesRep.totals.total) - num(salesRep.totals.received));
  const salesByCustomer = await storage.getSalesReport({ fromDate: from, toDate: to, customerId: ctx.customer.id });
  check("sales customer filter keeps row", salesByCustomer.rows.length, 1);
  const salesWrongCustomer = await storage.getSalesReport({ fromDate: from, toDate: to, customerId: ctx.supplier.id });
  check("sales wrong-customer filter empty", salesWrongCustomer.rows.length, 0);
  const salesCombo = await storage.getSalesReport({
    fromDate: from, toDate: to, customerId: ctx.customer.id, productId: ctx.wheat.id, paymentStatus: "partial",
  });
  check("sales combined AND filter", salesCombo.rows.length, 1);
  const salesWrongProduct = await storage.getSalesReport({ fromDate: from, toDate: to, productId: 999999 });
  check("sales unknown-product filter empty", salesWrongProduct.rows.length, 0);
  check("sales unknown-product totals zero", num(salesWrongProduct.totals.total), 0);
  // every row's own status must be exactly what the corresponding filter selects
  for (const st of ["paid", "partial", "unpaid"] as const) {
    const filtered = await storage.getSalesReport({ fromDate: from, toDate: to, paymentStatus: st });
    const expected = salesRep.rows.filter((r: any) => r.status === st).length;
    check(`sales status filter '${st}' matches row status`, filtered.rows.length, expected);
  }
  const salesEmptyRange = await storage.getSalesReport({ fromDate: D(2030, 1, 1), toDate: D(2030, 12, 31) });
  check("sales empty range returns no rows", salesEmptyRange.rows.length, 0);
  check("sales empty range totals zero", num(salesEmptyRange.totals.total), 0);

  console.log("\n=== 6/7. PERIOD PURCHASES / SALES ===");
  const pp = await storage.getPeriodPurchases(from, to, undefined, "month");
  const ps = await storage.getPeriodSales(from, to, undefined, "month");
  check("period purchases total == purchase report total", num(pp.totals.totalAmount), num(purchaseRep.totals.total));
  check("period sales total == sales report total", num(ps.totals.totalAmount), num(salesRep.totals.total));
  check("period purchases invoiceCount == purchase rows", pp.totals.invoiceCount, purchaseRep.rows.length);
  check("period sales invoiceCount == sales rows", ps.totals.invoiceCount, salesRep.rows.length);
  check("period purchases balance == total - paid",
    num(pp.totals.balanceAmount), num(pp.totals.totalAmount) - num(pp.totals.paidAmount));
  // grouping must not change the totals, only how they are bucketed
  for (const g of ["day", "week", "month", "year"] as const) {
    const gpp = await storage.getPeriodPurchases(from, to, undefined, g);
    const gps = await storage.getPeriodSales(from, to, undefined, g);
    check(`period purchases total stable across groupBy '${g}'`, num(gpp.totals.totalAmount), num(pp.totals.totalAmount));
    check(`period sales total stable across groupBy '${g}'`, num(gps.totals.totalAmount), num(ps.totals.totalAmount));
  }
  // the day-grouped label must be the *local* purchase date, not a UTC-shifted one
  const ppDay = await storage.getPeriodPurchases(from, to, undefined, "day");
  // purchases.purchase_date is stored in unix *seconds*; take the already-decoded
  // Date off the purchase report rather than re-parsing the raw column.
  const expectedDayKey = (() => {
    const d = new Date(purchaseRep.rows[0].purchaseDate as any);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  check("period purchases day key == local purchase date",
    ppDay.rows.some((r: any) => r.period === expectedDayKey) ? 1 : 0, 1);
  const ppEmpty = await storage.getPeriodPurchases(D(2030, 1, 1), D(2030, 12, 31), undefined, "month");
  check("period purchases empty range no rows", ppEmpty.rows.length, 0);
  check("period purchases empty range totals zero", num(ppEmpty.totals.totalAmount), 0);
  const ppSupplier = await storage.getPeriodPurchases(from, to, ctx.customer.id, "month");
  check("period purchases wrong-supplier filter empty", ppSupplier.rows.length, 0);

  console.log("\n=== 8. GROSS PROFIT ===");
  const gp = await storage.getGrossProfit(from, to);
  console.log(gp);
  check("gross profit == netSales - COGS", num(gp.grossProfit), num(gp.netSales) - num(gp.costOfGoodsSold));
  check("gross profit rows sum to netSales",
    gp.rows.reduce((s: number, r: any) => s + num(r.netSales), 0), num(gp.netSales));
  check("gross profit rows sum to COGS",
    gp.rows.reduce((s: number, r: any) => s + num(r.costOfGoodsSold), 0), num(gp.costOfGoodsSold));
  check("gross margin == profit/netSales*100",
    num(gp.grossMarginPercent), Math.round((num(gp.grossProfit) / num(gp.netSales)) * 10000) / 100);
  // an empty period must report zeros, not silently fall back to ledger balances
  const gpEmpty = await storage.getGrossProfit(D(2030, 1, 1), D(2030, 12, 31));
  check("gross profit empty range netSales zero", num(gpEmpty.netSales), 0);
  check("gross profit empty range margin zero", num(gpEmpty.grossMarginPercent), 0);

  console.log("\n=== 21/22. PROFIT & LOSS / INCOME STATEMENT ===");
  const pl = await storage.getProfitLoss(from, to);
  const is = await storage.getIncomeStatement(from, to);
  console.log(pl);
  check("P&L revenue == GrossProfit netSales", num(pl.revenue), num(gp.netSales));
  check("P&L COGS == GrossProfit COGS", num(pl.costOfSales), num(gp.costOfGoodsSold));
  check("P&L netProfit == IncomeStatement netProfit", num(pl.netProfit), num(is.netProfit));
  // 1500 seeded expense + purchase charge accounts (freight 500 add - market fee 200 less = 300),
  // which ensurePurchaseChargeAccount deliberately books to expense-type accounts.
  check("P&L opex == expense + purchase charges", num(pl.operatingExpenses), 1800);

  console.log("\n=== 20. TRIAL BALANCE ===");
  const tb = await storage.getTrialBalance(to);
  console.log(tb.totals, tb.validation);
  check("trial balance debit == credit", num(tb.totals.debit), num(tb.totals.credit));

  console.log("\n=== 19. LEDGER ===");
  for (const acc of [ctx.customer, ctx.supplier]) {
    const led: any = await ledgerService.getLedgerReport({ accountId: acc.id, startDate: from, endDate: to });
    const closing = num(led.totals?.closingBalance);
    console.log(acc.name, "closing", closing, Object.keys(led));
    const tbRow: any = tb.rows.find((r: any) => r.account.id === acc.id);
    const tbNet = num(tbRow?.debit) - num(tbRow?.credit);
    check(`ledger closing matches trial balance for ${acc.name}`, Math.abs(closing), Math.abs(tbNet));
  }

  console.log("\n=== 16/17. OUTSTANDING ===");
  const oc = await storage.getOutstandingCustomers(to);
  const os = await storage.getOutstandingSuppliers(to);
  console.log("customers", oc.totals);
  console.log("suppliers", os.totals);
  const tbCustomer: any = tb.rows.find((r: any) => r.account.id === ctx.customer.id);
  const tbSupplier: any = tb.rows.find((r: any) => r.account.id === ctx.supplier.id);
  check("outstanding customers == customer ledger debit balance",
    num(oc.totals.outstandingAmount), num(tbCustomer?.debit) - num(tbCustomer?.credit));
  check("outstanding suppliers == supplier ledger credit balance",
    num(os.totals.outstandingAmount), num(tbSupplier?.credit) - num(tbSupplier?.debit));

  console.log("\n=== 9. GENERAL DAY BOOK ===");
  for (const d of [D(2025, 1, 10), D(2025, 2, 5), D(2025, 2, 12)]) {
    const dbk = await storage.getDayBook(d);
    console.log(d.toDateString(), "opening", dbk.openingBalance, "totals", dbk.totals, "rows", dbk.rows.length);
  }

  console.log("\n=== 12/18. CASH DAY BOOK / CASH LEDGER / CASH IN HAND ===");
  const cashAcc = await storage.getOrCreateCashAccount();
  const cashSummary = await storage.getCashSummary();
  console.log("cash account", cashAcc.id, cashAcc.name, "summary", cashSummary);
  const cashLedger: any = await ledgerService.getLedgerReport({ accountId: cashAcc.id, startDate: from, endDate: to });
  const cashLedgerClosing = num(cashLedger.totals?.closingBalance);
  console.log("cash ledger closing", cashLedgerClosing);
  check("cash ledger closing == cash summary closing", cashLedgerClosing, cashSummary.closing);

  const dayBookFeb5 = await storage.getDayBook(D(2025, 2, 5));
  check("general day book receipt on sale day == cash received", num(dayBookFeb5.totals.receipt), num(rawSale.paid_amount));

  console.log("\n=== 23. BALANCE SHEET ===");
  const bs = await storage.getBalanceSheet(to);
  console.log(JSON.stringify(bs, null, 2));
  check("balance sheet assets == liabilities+equity", num(bs.totals.assets), num(bs.totals.liabilitiesAndEquity));

  console.log("\n=== 24. CAPITAL ===");
  const cap = await storage.getCapitalStatement(from, to);
  console.log(cap);
  check("capital netProfit == P&L netProfit", num(cap.netProfit), num(pl.netProfit));

  console.log("\n=== 25. SALARY ===");
  const sal = await storage.getSalaryAccount(from, to);
  console.log(sal.totals, "rows", sal.rows.length);

  console.log("\n=== 10-15. SPECIALISED DAY BOOKS ===");
  for (const [name, fn] of Object.entries({
    sales: () => daybooks.listSalesDaybook({ fromDate: from, toDate: to } as any),
    purchases: () => daybooks.listPurchasesDaybook({ fromDate: from, toDate: to } as any),
    cash: () => daybooks.listCashBook({ fromDate: from, toDate: to } as any),
    salesReturns: () => daybooks.listSalesReturnsDaybook({ fromDate: from, toDate: to } as any),
    purchaseReturns: () => daybooks.listPurchaseReturnsDaybook({ fromDate: from, toDate: to } as any),
    generalJournal: () => daybooks.listGeneralJournal({ fromDate: from, toDate: to } as any),
  })) {
    try {
      const res: any = await (fn as any)();
      console.log(name, "->", JSON.stringify(res).slice(0, 500));
    } catch (e: any) {
      console.log(name, "ERROR", e.message);
    }
  }

  console.log("\n================ SUMMARY ================");
  console.log(`failures: ${failures.length}`);
  for (const f of failures) console.log("  FAIL " + f);
  for (const n of notes) console.log("  NOTE " + n);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

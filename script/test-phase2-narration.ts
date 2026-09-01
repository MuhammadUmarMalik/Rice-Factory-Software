import { strict as assert } from "node:assert";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function assertSafeNarration(value: unknown, label: string) {
  const text = String(value ?? "");
  assert.ok(text.trim(), `${label} must not be blank`);
  assert.doesNotMatch(text, /\b(?:undefined|null)\b/i, `${label} contains a null-like placeholder`);
  assert.doesNotMatch(text, /—\s*—|\|\s*\|/, `${label} contains an empty separator`);
}

async function main() {
  const tempDir = mkdtempSync(join(tmpdir(), "mill-manager-phase2-narration-"));
  const tempDb = join(tempDir, "data.db");
  copyFileSync(resolve(".local/data.db"), tempDb);
  process.env.DATABASE_URL = tempDb;

  const [{ sqlite }, { storage }, cashService, daybooksService, printService, pdfEngine] = await Promise.all([
    import("../server/models/db"),
    import("../server/models/storage"),
    import("../server/services/cash-in-hand.service"),
    import("../server/services/daybooks.service"),
    import("../server/services/print.service"),
    import("../server/services/print/pdf/engine"),
  ]);

  try {
    const sale = sqlite.prepare(`
      SELECT s.id, s.invoice_number, s.customer_id, a.name AS customer_name
      FROM sales s JOIN accounts a ON a.id = s.customer_id
      ORDER BY s.id LIMIT 1
    `).get() as { id: number; invoice_number: string; customer_id: number; customer_name: string } | undefined;
    assert.ok(sale, "Cash receipt narration test requires a sale");
    const today = new Date();
    const balanceBefore = await cashService.getBalance(1);
    const manualDescription = "  Counter receipt for transport deposit  ";
    const manual = await cashService.createReceipt({
      receiptDate: today,
      receivedFrom: "Walk-in Party",
      amount: "10",
      description: manualDescription,
      cashAccountId: 1,
    } as any);
    const generated = await cashService.createReceipt({
      receiptDate: today,
      receivedFrom: "Walk-in Party",
      amount: "11",
      description: "   ",
      cashAccountId: 1,
    } as any);
    const linked = await cashService.createReceipt({
      receiptDate: today,
      receivedFrom: "Ignored caller label",
      amount: "12",
      description: "",
      referenceType: "sale",
      referenceId: sale.id,
      cashAccountId: 1,
    } as any);

    assert.equal(manual.description, manualDescription, "Manual cash receipt description must be preserved exactly");
    assert.equal(generated.description, `Cash received from Walk-in Party — Ref #${generated.voucherNo}`);
    assert.equal(linked.description, `Cash received from ${sale.customer_name} against Invoice #${sale.invoice_number}`);
    for (const receipt of [manual, generated, linked]) assertSafeNarration(receipt.description, `cash receipt ${receipt.voucherNo}`);

    const balanceAfter = await cashService.getBalance(1);
    assert.equal(balanceAfter.currentBalance, balanceBefore.currentBalance + 33, "Narration must not alter cash receipt balances");
    const ledger = await cashService.getLedger({ cashAccountId: 1 });
    for (const receipt of [manual, generated, linked]) {
      const row = ledger.find((entry: any) => entry.type === "receipt" && entry.voucherNo === receipt.voucherNo);
      assert.ok(row, `Cash Ledger should contain ${receipt.voucherNo}`);
      assert.equal(row.description, receipt.description);
      assertSafeNarration(row.description, `cash receipt ledger ${receipt.voucherNo}`);
    }
    const receiptBook = await cashService.getReceipts({ cashAccountId: 1 });
    assert.ok(receiptBook.some((row: any) => row.id === generated.id && row.description === generated.description), "Cash receipt book should show generated narration");

    const preview = await printService.renderPrintPreview(
      { docKey: "voucher.cashModuleReceipt", params: { receiptId: generated.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(preview.payload.notes, generated.description);
    assert.ok(preview.html.includes(String(generated.description)), "Cash receipt print preview should show narration");
    const manualPreview = await printService.renderPrintPreview(
      { docKey: "voucher.cashModuleReceipt", params: { receiptId: manual.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(manualPreview.payload.notes, manualDescription);
    const pdf = await printService.renderPrintPdf(
      { docKey: "voucher.cashModuleReceipt", params: { receiptId: linked.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(pdf.length > 1_000);
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");

    console.log("Cash receipt narration integration tests passed.");

    const purchase = sqlite.prepare(`
      SELECT p.id, p.invoice_number, p.supplier_id, a.name AS supplier_name
      FROM purchases p JOIN accounts a ON a.id = p.supplier_id
      ORDER BY p.id LIMIT 1
    `).get() as { id: number; invoice_number: string; supplier_id: number; supplier_name: string } | undefined;
    assert.ok(purchase, "Cash payment narration test requires a purchase");
    const paymentBalanceBefore = await cashService.getBalance(1);
    const manualPaymentDescription = "  Cash released for urgent unloading  ";
    const manualPayment = await cashService.createPayment({
      paymentDate: today,
      paidTo: "Walk-in Supplier",
      amount: "8",
      description: manualPaymentDescription,
      cashAccountId: 1,
    } as any);
    const generatedPayment = await cashService.createPayment({
      paymentDate: today,
      paidTo: "Walk-in Supplier",
      amount: "9",
      description: " ",
      cashAccountId: 1,
    } as any);
    const linkedPayment = await cashService.createPayment({
      paymentDate: today,
      paidTo: "Ignored caller label",
      amount: "10",
      description: "",
      referenceType: "purchase",
      referenceId: purchase.id,
      cashAccountId: 1,
    } as any);

    assert.equal(manualPayment.description, manualPaymentDescription, "Manual cash payment description must be preserved exactly");
    assert.equal(generatedPayment.description, `Cash paid to Walk-in Supplier — Ref #${generatedPayment.voucherNo}`);
    assert.equal(linkedPayment.description, `Cash paid to ${purchase.supplier_name} against Invoice #${purchase.invoice_number}`);
    for (const payment of [manualPayment, generatedPayment, linkedPayment]) assertSafeNarration(payment.description, `cash payment ${payment.voucherNo}`);

    const paymentBalanceAfter = await cashService.getBalance(1);
    assert.equal(paymentBalanceAfter.currentBalance, paymentBalanceBefore.currentBalance - 27, "Narration must not alter cash payment balances");
    const paymentLedger = await cashService.getLedger({ cashAccountId: 1 });
    for (const payment of [manualPayment, generatedPayment, linkedPayment]) {
      const row = paymentLedger.find((entry: any) => entry.type === "payment" && entry.voucherNo === payment.voucherNo);
      assert.ok(row, `Cash Ledger should contain ${payment.voucherNo}`);
      assert.equal(row.description, payment.description);
      assertSafeNarration(row.description, `cash payment ledger ${payment.voucherNo}`);
    }
    const paymentBook = await cashService.getPayments({ cashAccountId: 1 });
    assert.ok(paymentBook.some((row: any) => row.id === generatedPayment.id && row.description === generatedPayment.description), "Cash payment book should show generated narration");

    const paymentPreview = await printService.renderPrintPreview(
      { docKey: "voucher.cashModulePayment", params: { paymentId: generatedPayment.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(paymentPreview.payload.notes, generatedPayment.description);
    assert.ok(paymentPreview.html.includes(String(generatedPayment.description)), "Cash payment print preview should show narration");
    const manualPaymentPreview = await printService.renderPrintPreview(
      { docKey: "voucher.cashModulePayment", params: { paymentId: manualPayment.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(manualPaymentPreview.payload.notes, manualPaymentDescription);
    const paymentPdf = await printService.renderPrintPdf(
      { docKey: "voucher.cashModulePayment", params: { paymentId: linkedPayment.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(paymentPdf.length > 1_000);
    assert.equal(paymentPdf.subarray(0, 4).toString(), "%PDF");

    console.log("Cash payment narration integration tests passed.");

    let expenseAccount = sqlite.prepare("SELECT id, name FROM accounts WHERE LOWER(type) = 'expense' ORDER BY id LIMIT 1").get() as { id: number; name: string } | undefined;
    if (!expenseAccount) {
      expenseAccount = sqlite.prepare("INSERT INTO accounts (name, type) VALUES ('Narration Test Expense', 'expense') RETURNING id, name").get() as { id: number; name: string };
    }
    const payFromAccount = sqlite.prepare("SELECT id, name FROM accounts WHERE id != ? AND LOWER(type) IN ('asset', 'bank') ORDER BY id LIMIT 1").get(expenseAccount.id) as { id: number; name: string } | undefined;
    assert.ok(payFromAccount, "Expense narration test requires an asset or bank account");
    const stockBeforeExpenses = Number((sqlite.prepare("SELECT COALESCE(SUM(CAST(current_stock AS REAL)), 0) AS total FROM products").get() as { total: number }).total);
    const manualExpenseDescription = "  Generator diesel for night shift  ";
    const generatedExpense = await storage.createExpense({
      expenseAccountId: expenseAccount.id,
      payFromAccountId: payFromAccount.id,
      amount: "14",
      expenseDate: today,
      description: " ",
    } as any);
    const manualExpense = await storage.createExpense({
      expenseAccountId: expenseAccount.id,
      payFromAccountId: payFromAccount.id,
      amount: "6",
      expenseDate: today,
      description: manualExpenseDescription,
    } as any);
    const purposeExpense = await storage.createExpense({
      expenseAccountId: expenseAccount.id,
      payFromAccountId: payFromAccount.id,
      amount: "4",
      expenseDate: today,
      description: "",
      purpose: "Boiler maintenance",
    } as any);
    const expectedExpense = `Expense — ${expenseAccount.name} — Voucher #${generatedExpense.voucherNo}`;
    assert.equal(generatedExpense.description, expectedExpense);
    assert.equal(manualExpense.description, manualExpenseDescription, "Manual expense description must be preserved exactly");
    assert.equal(purposeExpense.description, `Expense — ${expenseAccount.name} — Voucher #${purposeExpense.voucherNo} — Boiler maintenance`);

    for (const expense of [generatedExpense, manualExpense, purposeExpense]) {
      assertSafeNarration(expense.description, `expense ${expense.voucherNo}`);
      const postings = sqlite.prepare("SELECT transaction_type, amount, description FROM ledger_entries WHERE expense_entry_id = ?").all(expense.id) as Array<{ transaction_type: string; amount: string; description: string }>;
      assert.equal(postings.length, 2, "Expense should retain two ledger postings");
      assert.equal(
        postings.filter((row) => row.transaction_type === "debit").reduce((sum, row) => sum + Number(row.amount), 0),
        postings.filter((row) => row.transaction_type === "credit").reduce((sum, row) => sum + Number(row.amount), 0),
        "Expense postings must remain balanced",
      );
      postings.forEach((row) => assert.equal(row.description, expense.description));
      const ledgerReport = await storage.getLedgerReport({ accountId: expenseAccount.id });
      const ledgerRows = ledgerReport.rows.filter((row: any) => row.referenceType === "expense" && row.referenceId === expense.id);
      assert.ok(ledgerRows.length, `Ledger should contain ${expense.voucherNo}`);
      assert.ok(ledgerRows.every((row: any) => row.narration === String(expense.description).trim()));
    }

    const expenseDayBook = await storage.getDayBook(today);
    for (const expense of [generatedExpense, manualExpense, purposeExpense]) {
      const row = expenseDayBook.rows.find((entry: any) => entry.referenceType === "expense" && entry.referenceId === expense.id);
      assert.ok(row, `Day Book should contain ${expense.voucherNo}`);
      assert.ok(row.mode.includes(String(expense.description).trim().toUpperCase()));
    }
    const expensePreview = await printService.renderPrintPreview(
      { docKey: "voucher.expense", params: { expenseId: generatedExpense.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(expensePreview.payload.notes, expectedExpense);
    assert.ok(expensePreview.html.includes(expectedExpense));
    const manualExpensePreview = await printService.renderPrintPreview(
      { docKey: "voucher.expense", params: { expenseId: manualExpense.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(manualExpensePreview.payload.notes, manualExpenseDescription);
    const expenseDayBookPreview = await printService.renderPrintPreview(
      { docKey: "report.dayBook", params: { date: today.toISOString() } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(expenseDayBookPreview.html.includes(expectedExpense.toUpperCase()));
    const expensePdf = await printService.renderPrintPdf(
      { docKey: "voucher.expense", params: { expenseId: generatedExpense.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(expensePdf.length > 1_000);
    assert.equal(expensePdf.subarray(0, 4).toString(), "%PDF");
    const stockAfterExpenses = Number((sqlite.prepare("SELECT COALESCE(SUM(CAST(current_stock AS REAL)), 0) AS total FROM products").get() as { total: number }).total);
    assert.equal(stockAfterExpenses, stockBeforeExpenses, "Expense narration must not alter stock");

    console.log("Expense narration integration tests passed.");

    const ledgerCountBeforeSalesReturns = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM ledger_entries").get() as { count: number }).count);
    const stockBeforeSalesReturns = Number((sqlite.prepare("SELECT COALESCE(SUM(CAST(current_stock AS REAL)), 0) AS total FROM products").get() as { total: number }).total);
    const returnSeed = `${Date.now()}`;
    const salesReturnBase = {
      returnDate: today,
      originalInvoiceReference: sale.invoice_number,
      customerId: sale.id,
      customerName: sale.customer_name,
      quantityReturned: "1",
      returnAmount: "20",
      taxAdjustment: "0",
      totalCreditAmount: "20",
      status: "Pending",
    };
    const manualSalesReturnText = "  Customer rejected torn packing  ";
    const manualSalesReturn = daybooksService.createSalesReturnsDaybook({
      ...salesReturnBase,
      creditNoteNumber: `SR-${returnSeed}-1`,
      description: manualSalesReturnText,
      reason: "Ignored reason",
      notes: "Ignored notes",
    });
    const reasonSalesReturn = daybooksService.createSalesReturnsDaybook({
      ...salesReturnBase,
      creditNoteNumber: `SR-${returnSeed}-2`,
      description: "",
      reason: "Damaged bags",
      notes: "Ignored notes",
    });
    const notesSalesReturn = daybooksService.createSalesReturnsDaybook({
      ...salesReturnBase,
      creditNoteNumber: `SR-${returnSeed}-3`,
      description: " ",
      reason: "",
      notes: "Return authorized by manager",
    });
    const generatedSalesReturn = daybooksService.createSalesReturnsDaybook({
      ...salesReturnBase,
      creditNoteNumber: `SR-${returnSeed}-4`,
      description: "",
      reason: " ",
      notes: "",
    });
    assert.equal(manualSalesReturn.description, manualSalesReturnText);
    assert.equal(reasonSalesReturn.description, "Damaged bags");
    assert.equal(notesSalesReturn.description, "Return authorized by manager");
    const expectedSalesReturn = `Sales return from ${sale.customer_name} — Return #${generatedSalesReturn.credit_note_number} — Invoice #${sale.invoice_number}`;
    assert.equal(generatedSalesReturn.description, expectedSalesReturn);
    for (const row of [manualSalesReturn, reasonSalesReturn, notesSalesReturn, generatedSalesReturn]) {
      assertSafeNarration(row.description, `sales return ${row.credit_note_number}`);
    }
    const listedSalesReturns = daybooksService
      .listSalesReturnsDaybook({})
      .filter((row: any) => String(row.credit_note_number).includes(returnSeed));
    assert.equal(listedSalesReturns.length, 4, "Sales Returns Day Book should contain all test returns");
    const salesReturnPreview = await printService.renderPrintPreview(
      { docKey: "report.dayBook", params: { daybookType: "sales-returns", search: returnSeed } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(salesReturnPreview.html.includes(expectedSalesReturn));
    assert.ok(salesReturnPreview.html.includes("Narration"));
    assert.ok(salesReturnPreview.html.includes("Details"));
    const salesReturnPdf = await printService.renderPrintPdf(
      { docKey: "report.dayBook", params: { daybookType: "sales-returns", search: returnSeed } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(salesReturnPdf.length > 1_000);
    assert.equal(salesReturnPdf.subarray(0, 4).toString(), "%PDF");
    const ledgerCountAfterSalesReturns = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM ledger_entries").get() as { count: number }).count);
    const stockAfterSalesReturns = Number((sqlite.prepare("SELECT COALESCE(SUM(CAST(current_stock AS REAL)), 0) AS total FROM products").get() as { total: number }).total);
    assert.equal(ledgerCountAfterSalesReturns, ledgerCountBeforeSalesReturns, "Sales returns must remain outside the core Ledger");
    assert.equal(stockAfterSalesReturns, stockBeforeSalesReturns, "Sales return narration must not change stock architecture");

    console.log("Sales return narration integration tests passed.");

    const ledgerCountBeforePurchaseReturns = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM ledger_entries").get() as { count: number }).count);
    const stockBeforePurchaseReturns = Number((sqlite.prepare("SELECT COALESCE(SUM(CAST(current_stock AS REAL)), 0) AS total FROM products").get() as { total: number }).total);
    const purchaseReturnBase = {
      returnDate: today,
      originalPurchaseReference: purchase.invoice_number,
      purchaseId: purchase.id,
      supplierId: purchase.supplier_id,
      supplierName: purchase.supplier_name,
      quantityReturned: "1",
      returnAmount: "18",
      taxAdjustment: "0",
      totalDebitAmount: "18",
      status: "Pending",
    };
    const manualPurchaseReturnText = "  Supplier accepted moisture rejection  ";
    const manualPurchaseReturn = daybooksService.createPurchaseReturnsDaybook({
      ...purchaseReturnBase,
      debitNoteNumber: `PR-${returnSeed}-1`,
      description: manualPurchaseReturnText,
      reason: "Ignored reason",
      notes: "Ignored notes",
    });
    const reasonPurchaseReturn = daybooksService.createPurchaseReturnsDaybook({
      ...purchaseReturnBase,
      debitNoteNumber: `PR-${returnSeed}-2`,
      description: "",
      reason: "Moisture above limit",
      notes: "Ignored notes",
    });
    const notesPurchaseReturn = daybooksService.createPurchaseReturnsDaybook({
      ...purchaseReturnBase,
      debitNoteNumber: `PR-${returnSeed}-3`,
      description: " ",
      reason: "",
      notes: "Return approved after inspection",
    });
    const generatedPurchaseReturn = daybooksService.createPurchaseReturnsDaybook({
      ...purchaseReturnBase,
      debitNoteNumber: `PR-${returnSeed}-4`,
      description: "",
      reason: " ",
      notes: "",
    });
    assert.equal(manualPurchaseReturn.description, manualPurchaseReturnText);
    assert.equal(reasonPurchaseReturn.description, "Moisture above limit");
    assert.equal(notesPurchaseReturn.description, "Return approved after inspection");
    const expectedPurchaseReturn = `Purchase return to ${purchase.supplier_name} — Return #${generatedPurchaseReturn.debit_note_number} — Invoice #${purchase.invoice_number}`;
    assert.equal(generatedPurchaseReturn.description, expectedPurchaseReturn);
    for (const row of [manualPurchaseReturn, reasonPurchaseReturn, notesPurchaseReturn, generatedPurchaseReturn]) {
      assertSafeNarration(row.description, `purchase return ${row.debit_note_number}`);
    }
    const listedPurchaseReturns = daybooksService
      .listPurchaseReturnsDaybook({})
      .filter((row: any) => String(row.debit_note_number).includes(returnSeed));
    assert.equal(listedPurchaseReturns.length, 4, "Purchase Returns Day Book should contain all test returns");
    const purchaseReturnPreview = await printService.renderPrintPreview(
      { docKey: "report.dayBook", params: { daybookType: "purchase-returns", search: returnSeed } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(purchaseReturnPreview.html.includes(expectedPurchaseReturn));
    assert.ok(purchaseReturnPreview.html.includes("Narration"));
    assert.ok(purchaseReturnPreview.html.includes("Details"));
    const purchaseReturnPdf = await printService.renderPrintPdf(
      { docKey: "report.dayBook", params: { daybookType: "purchase-returns", search: returnSeed } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(purchaseReturnPdf.length > 1_000);
    assert.equal(purchaseReturnPdf.subarray(0, 4).toString(), "%PDF");
    const ledgerCountAfterPurchaseReturns = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM ledger_entries").get() as { count: number }).count);
    const stockAfterPurchaseReturns = Number((sqlite.prepare("SELECT COALESCE(SUM(CAST(current_stock AS REAL)), 0) AS total FROM products").get() as { total: number }).total);
    assert.equal(ledgerCountAfterPurchaseReturns, ledgerCountBeforePurchaseReturns, "Purchase returns must remain outside the core Ledger");
    assert.equal(stockAfterPurchaseReturns, stockBeforePurchaseReturns, "Purchase return narration must not change stock architecture");

    console.log("Purchase return narration integration tests passed.");

    const sourceProduct = sqlite.prepare("SELECT id, name, current_stock FROM products WHERE CAST(current_stock AS REAL) >= 2 ORDER BY id LIMIT 1").get() as { id: number; name: string; current_stock: string } | undefined;
    assert.ok(sourceProduct, "Processing narration test requires a product with at least two units of stock");
    const outputProduct = (sqlite.prepare("SELECT id, name, current_stock FROM products WHERE id != ? ORDER BY id LIMIT 1").get(sourceProduct.id)
      || sourceProduct) as { id: number; name: string; current_stock: string };
    const ledgerCountBeforeProcessing = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM ledger_entries").get() as { count: number }).count);
    const sourceStockBefore = Number(sourceProduct.current_stock);
    const outputStockBefore = Number(outputProduct.current_stock);
    const generatedProcessing = await storage.createProcessing({
      sourceProductId: sourceProduct.id,
      sourceQuantity: "1",
      outputProductId: outputProduct.id,
      outputQuantity: "0.8",
      wastageQuantity: "0.2",
      status: "pending",
      notes: " ",
      startDate: today,
    } as any);
    const manualProcessingNotes = "  Priority milling batch for export sample  ";
    const manualProcessing = await storage.createProcessing({
      sourceProductId: sourceProduct.id,
      sourceQuantity: "1",
      outputProductId: outputProduct.id,
      outputQuantity: "0.75",
      wastageQuantity: "0.25",
      status: "pending",
      notes: manualProcessingNotes,
      startDate: today,
    } as any);
    const expectedProcessing = `Stock processing — ${sourceProduct.name} Qty: 1 to ${outputProduct.name} Qty: 0.8 — Batch #${generatedProcessing.batchNumber}`;
    assert.equal(generatedProcessing.notes, expectedProcessing);
    assert.equal(manualProcessing.notes, manualProcessingNotes, "Manual processing notes must be preserved exactly");
    assertSafeNarration(generatedProcessing.notes, `processing ${generatedProcessing.batchNumber}`);
    assertSafeNarration(manualProcessing.notes, `processing ${manualProcessing.batchNumber}`);
    const processingList = await storage.getProcessingBatches();
    assert.ok(processingList.some((batch: any) => batch.id === generatedProcessing.id && batch.notes === expectedProcessing));
    const sourceStockAfter = Number((sqlite.prepare("SELECT current_stock FROM products WHERE id = ?").get(sourceProduct.id) as { current_stock: string }).current_stock);
    assert.equal(sourceStockAfter, sourceStockBefore - 2, "Processing narration must not alter source-stock subtraction");
    if (outputProduct.id !== sourceProduct.id) {
      const outputStockAfter = Number((sqlite.prepare("SELECT current_stock FROM products WHERE id = ?").get(outputProduct.id) as { current_stock: string }).current_stock);
      assert.equal(outputStockAfter, outputStockBefore, "Pending processing must not add output stock");
    }
    const ledgerCountAfterProcessing = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM ledger_entries").get() as { count: number }).count);
    assert.equal(ledgerCountAfterProcessing, ledgerCountBeforeProcessing, "Processing must retain its existing non-Ledger architecture");
    const processingPreview = await printService.renderPrintPreview(
      { docKey: "voucher.processing", params: { processingId: generatedProcessing.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(processingPreview.payload.notes, expectedProcessing);
    assert.ok(processingPreview.html.includes(expectedProcessing));
    const manualProcessingPreview = await printService.renderPrintPreview(
      { docKey: "voucher.processing", params: { processingId: manualProcessing.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(manualProcessingPreview.payload.notes, manualProcessingNotes);
    const processingPdf = await printService.renderPrintPdf(
      { docKey: "voucher.processing", params: { processingId: generatedProcessing.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(processingPdf.length > 1_000);
    assert.equal(processingPdf.subarray(0, 4).toString(), "%PDF");

    console.log("Processing narration integration tests passed.");

    // Historical records are displayed safely without mutating the source database.
    sqlite.prepare("UPDATE cash_receipts SET description = NULL WHERE id = ?").run(manual.id);
    sqlite.prepare("UPDATE cash_payments SET description = NULL WHERE id = ?").run(manualPayment.id);
    sqlite.prepare("UPDATE expense_entries SET description = NULL WHERE id = ?").run(manualExpense.id);
    sqlite.prepare("UPDATE ledger_entries SET description = '' WHERE expense_entry_id = ?").run(manualExpense.id);
    sqlite.prepare("UPDATE sales_returns_daybook SET description = NULL, reason = NULL, notes = NULL WHERE id = ?").run(generatedSalesReturn.id);
    sqlite.prepare("UPDATE purchase_returns_daybook SET description = NULL, reason = NULL, notes = NULL WHERE id = ?").run(generatedPurchaseReturn.id);
    sqlite.prepare("UPDATE processing SET notes = NULL WHERE id = ?").run(manualProcessing.id);

    const historicalReceiptPreview = await printService.renderPrintPreview(
      { docKey: "voucher.cashModuleReceipt", params: { receiptId: manual.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    const historicalPaymentPreview = await printService.renderPrintPreview(
      { docKey: "voucher.cashModulePayment", params: { paymentId: manualPayment.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    const historicalExpensePreview = await printService.renderPrintPreview(
      { docKey: "voucher.expense", params: { expenseId: manualExpense.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    const historicalProcessingPreview = await printService.renderPrintPreview(
      { docKey: "voucher.processing", params: { processingId: manualProcessing.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(historicalReceiptPreview.payload.notes, "-");
    assert.equal(historicalPaymentPreview.payload.notes, "-");
    assert.equal(historicalExpensePreview.payload.notes, "-");
    assert.equal(historicalProcessingPreview.payload.notes, "-");

    const historicalExpenseLedger = await storage.getLedgerReport({ accountId: expenseAccount.id });
    const historicalExpenseRows = historicalExpenseLedger.rows.filter((row: any) => row.referenceType === "expense" && row.referenceId === manualExpense.id);
    assert.ok(historicalExpenseRows.length && historicalExpenseRows.every((row: any) => row.narration === "-"));
    const historicalDayBook = await storage.getDayBook(today);
    const historicalExpenseDayBook = historicalDayBook.rows.find((row: any) => row.referenceType === "expense" && row.referenceId === manualExpense.id);
    assert.equal(historicalExpenseDayBook?.mode, "-");
    const historicalCashLedger = await cashService.getLedger({ cashAccountId: 1 });
    assert.equal(historicalCashLedger.find((row: any) => row.voucherNo === manual.voucherNo)?.description, "-");
    assert.equal(historicalCashLedger.find((row: any) => row.voucherNo === manualPayment.voucherNo)?.description, "-");

    const coreReceipt = await storage.createReceiptVoucher({ voucherType: "CR", voucherDate: today, narration: "" } as any, [{
      accountId: sale.customer_id,
      debit: "0",
      credit: "1",
      narration: "",
    }]);
    sqlite.prepare("UPDATE receipt_vouchers SET narration = NULL WHERE id = ?").run(coreReceipt.id);
    sqlite.prepare("UPDATE receipt_voucher_lines SET narration = NULL WHERE voucher_id = ?").run(coreReceipt.id);
    const historicalCoreReceiptPreview = await printService.renderPrintPreview(
      { docKey: "voucher.cashReceipt", params: { voucherId: coreReceipt.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(historicalCoreReceiptPreview.payload.notes, "-");
    assert.ok(historicalCoreReceiptPreview.payload.table?.rows.every((row: any) => row.narration === "-"));

    const coreJournal = await storage.createJournalVoucher({ voucherDate: today, narration: "", status: "draft" } as any, [
      { accountId: expenseAccount.id, entryType: "DEBIT", amount: "1" },
      { accountId: payFromAccount.id, entryType: "CREDIT", amount: "1" },
    ]);
    sqlite.prepare("UPDATE journal_vouchers SET narration = NULL WHERE id = ?").run(coreJournal.id);
    const historicalJournalPreview = await printService.renderPrintPreview(
      { docKey: "voucher.journal", params: { voucherId: coreJournal.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(historicalJournalPreview.payload.notes, "-");

    const historicalCashBook = daybooksService.createCashBook({
      transactionDate: today,
      transactionType: "Receipt",
      accountType: "Cash",
      referenceNumber: `HIST-${returnSeed}`,
      partyName: "Historical Party",
      description: "",
      notes: "",
      amount: "1",
    });
    const cashDayBookPreview = await printService.renderPrintPreview(
      { docKey: "report.dayBook", params: { daybookType: "cash", search: `HIST-${returnSeed}` } },
      { role: "admin", userLabel: "Narration test" },
    );
    const cashColumns = cashDayBookPreview.payload.table?.columns.map((column: any) => column.label) || [];
    assert.ok(cashColumns.includes("Narration") && cashColumns.includes("Details"));
    const historicalCashPrintRow = cashDayBookPreview.payload.table?.rows.find((row: any) => row.party === historicalCashBook.party_name);
    assert.equal(historicalCashPrintRow?.narration, "-");

    const historicalSalesReturnPreview = await printService.renderPrintPreview(
      { docKey: "report.dayBook", params: { daybookType: "sales-returns" } },
      { role: "admin", userLabel: "Narration test" },
    );
    const historicalSalesReturnRow = historicalSalesReturnPreview.payload.table?.rows.find((row: any) => row.note === generatedSalesReturn.credit_note_number);
    assert.equal(historicalSalesReturnRow?.narration, "-");
    const historicalPurchaseReturnPreview = await printService.renderPrintPreview(
      { docKey: "report.dayBook", params: { daybookType: "purchase-returns" } },
      { role: "admin", userLabel: "Narration test" },
    );
    const historicalPurchaseReturnRow = historicalPurchaseReturnPreview.payload.table?.rows.find((row: any) => row.note === generatedPurchaseReturn.debit_note_number);
    assert.equal(historicalPurchaseReturnRow?.narration, "-");

    const historicalPdf = await printService.renderPrintPdf(
      { docKey: "voucher.expense", params: { expenseId: manualExpense.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(historicalPdf.length > 1_000);
    assert.equal(historicalPdf.subarray(0, 4).toString(), "%PDF");

    console.log("Historical blank narration display tests passed.");
  } finally {
    await pdfEngine.closePdfBrowser();
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

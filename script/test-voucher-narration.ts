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
  const tempDir = mkdtempSync(join(tmpdir(), "mill-manager-voucher-narration-"));
  const tempDb = join(tempDir, "data.db");
  copyFileSync(resolve(".local/data.db"), tempDb);
  process.env.DATABASE_URL = tempDb;

  const [{ storage }, { sqlite }, printService, pdfEngine, cashService] = await Promise.all([
    import("../server/models/storage"),
    import("../server/models/db"),
    import("../server/services/print.service"),
    import("../server/services/print/pdf/engine"),
    import("../server/services/cash-in-hand.service"),
  ]);

  try {
    const sale = sqlite.prepare(`
      SELECT s.id, s.invoice_number, s.customer_id, a.name AS customer_name,
             s.paid_amount, s.total_amount
      FROM sales s
      JOIN accounts a ON a.id = s.customer_id
      ORDER BY s.id LIMIT 1
    `).get() as {
      id: number;
      invoice_number: string;
      customer_id: number;
      customer_name: string;
      paid_amount: string;
      total_amount: string;
    } | undefined;
    assert.ok(sale, "Receipt narration test requires a sale");

    const today = new Date();
    const manualHeader = "  Advance collected at front desk  ";
    const generated = await storage.createReceiptVoucher({
      voucherType: "CR",
      voucherDate: today,
      narration: "   ",
    } as any, [{
      accountId: sale.customer_id,
      credit: "25",
      debit: "0",
      narration: "",
      saleId: sale.id,
    }]);
    const manual = await storage.createReceiptVoucher({
      voucherType: "CR",
      voucherDate: today,
      narration: manualHeader,
    } as any, [{
      accountId: sale.customer_id,
      credit: "15",
      debit: "0",
      narration: "line text must not replace the header",
      saleId: sale.id,
    }]);
    const lineManual = "  Cheque received against dispatch  ";
    const manualFromLine = await storage.createReceiptVoucher({
      voucherType: "CR",
      voucherDate: today,
      narration: "",
    } as any, [{
      accountId: sale.customer_id,
      credit: "10",
      debit: "0",
      narration: lineManual,
      saleId: sale.id,
    }]);

    const expected = `Payment received from ${sale.customer_name} against Invoice #${sale.invoice_number} — Voucher #${generated.voucherNumber}`;
    assert.equal(generated.narration, expected, "Receipt fallback should use customer, invoice, and voucher data");
    assert.equal(manual.narration, manualHeader, "Receipt header narration must be preserved exactly");
    assert.equal(manualFromLine.narration, lineManual, "Receipt line narration must be used when the header is blank");

    for (const voucher of [generated, manual, manualFromLine]) {
      assert.equal(voucher.totalDebit, voucher.totalCredit, "Receipt must remain balanced");
      assertSafeNarration(voucher.narration, `receipt ${voucher.voucherNumber}`);
      const storedLines = sqlite.prepare(`
        SELECT account_id, narration, debit, credit
        FROM receipt_voucher_lines WHERE voucher_id = ? ORDER BY id
      `).all(voucher.id) as Array<{ account_id: number; narration: string; debit: string; credit: string }>;
      assert.equal(storedLines.length, 2, "Receipt should have one party and one settlement line");
      storedLines.forEach((line) => assertSafeNarration(line.narration, `receipt line ${voucher.voucherNumber}`));
      const debit = storedLines.reduce((sum, line) => sum + Number(line.debit), 0);
      const credit = storedLines.reduce((sum, line) => sum + Number(line.credit), 0);
      assert.equal(debit, credit, "Receipt line postings must remain balanced");
    }

    const generatedDetails = await storage.getReceiptVoucher(generated.id);
    assert.ok(generatedDetails);
    const settlementAccountId = generatedDetails.settlementAccountId;
    assert.ok(settlementAccountId, "Receipt must retain its structural settlement account ID");
    await storage.updateReceiptVoucher(generated.id, { narration: expected } as any, generatedDetails.lines as any);
    const updatedLines = sqlite.prepare("SELECT account_id FROM receipt_voucher_lines WHERE voucher_id = ?").all(generated.id) as Array<{ account_id: number }>;
    assert.equal(updatedLines.length, 2, "Update must structurally exclude the submitted settlement line");
    assert.equal(updatedLines.filter((line) => line.account_id === settlementAccountId).length, 1, "Update must create exactly one settlement line");

    const ledger = await storage.getLedgerReport({ accountId: sale.customer_id });
    for (const voucher of [generated, manual, manualFromLine]) {
      const rows = ledger.rows.filter((row: any) => row.referenceType === "receipt_voucher" && row.referenceId === voucher.id);
      assert.ok(rows.length, `Ledger should contain receipt ${voucher.voucherNumber}`);
      rows.forEach((row: any) => assertSafeNarration(row.narration, `receipt ledger ${voucher.voucherNumber}`));
      assert.ok(rows.some((row: any) => row.narration.includes(String(voucher.narration).trim())), "Ledger should show receipt narration");
    }

    const dayBook = await storage.getDayBook(today);
    for (const voucher of [generated, manual, manualFromLine]) {
      const row = dayBook.rows.find((entry: any) => entry.referenceType === "receipt_voucher" && entry.referenceId === voucher.id);
      assert.ok(row, `Day Book should contain receipt ${voucher.voucherNumber}`);
      assertSafeNarration(row.mode, `receipt day book ${voucher.voucherNumber}`);
      assert.ok(row.mode.includes(String(voucher.narration).trim().toUpperCase()), "Day Book should show receipt narration");
    }

    const preview = await printService.renderPrintPreview(
      { docKey: "voucher.cashReceipt", params: { voucherId: generated.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(preview.payload.notes, expected);
    assert.ok(preview.html.includes(expected), "Receipt print preview should show generated narration");
    const manualPreview = await printService.renderPrintPreview(
      { docKey: "voucher.cashReceipt", params: { voucherId: manual.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(manualPreview.payload.notes, manualHeader);
    assert.ok(manualPreview.html.includes(manualHeader.trim()), "Receipt print preview should show manual narration");
    const dayBookPreview = await printService.renderPrintPreview(
      { docKey: "report.dayBook", params: { date: today.toISOString() } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(dayBookPreview.html.includes(expected.toUpperCase()), "Day Book print preview should show receipt narration");
    const ledgerPreview = await printService.renderPrintPreview(
      { docKey: "report.ledger", params: { accountId: sale.customer_id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(ledgerPreview.html.includes(expected), "Ledger print preview should show receipt narration");
    const pdf = await printService.renderPrintPdf(
      { docKey: "voucher.cashReceipt", params: { voucherId: generated.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(pdf.length > 1_000, "Receipt PDF should be generated");
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF", "Receipt PDF should be valid");

    const updatedSale = sqlite.prepare("SELECT paid_amount, total_amount FROM sales WHERE id = ?").get(sale.id) as { paid_amount: string; total_amount: string };
    const expectedPaid = Math.min(Number(sale.paid_amount) + 50, Number(sale.total_amount));
    assert.equal(Number(updatedSale.paid_amount), expectedPaid, "Receipt narration must not alter sale allocation calculations");

    console.log("Receipt voucher narration integration tests passed.");

    const purchase = sqlite.prepare(`
      SELECT p.id, p.invoice_number, p.supplier_id, a.name AS supplier_name,
             p.paid_amount, p.total_amount
      FROM purchases p
      JOIN accounts a ON a.id = p.supplier_id
      ORDER BY p.id LIMIT 1
    `).get() as {
      id: number;
      invoice_number: string;
      supplier_id: number;
      supplier_name: string;
      paid_amount: string;
      total_amount: string;
    } | undefined;
    assert.ok(purchase, "Payment narration test requires a purchase");

    const manualPaymentHeader = "  Supplier cheque released by finance  ";
    const generatedPayment = await storage.createReceiptVoucher({
      voucherType: "CP",
      voucherDate: today,
      narration: "",
    } as any, [{
      accountId: purchase.supplier_id,
      debit: "25",
      credit: "0",
      narration: " ",
      purchaseId: purchase.id,
    }]);
    const manualPayment = await storage.createReceiptVoucher({
      voucherType: "CP",
      voucherDate: today,
      narration: manualPaymentHeader,
    } as any, [{
      accountId: purchase.supplier_id,
      debit: "15",
      credit: "0",
      narration: "line text must not replace the payment header",
      purchaseId: purchase.id,
    }]);
    const paymentLineNarration = "  Urgent supplier settlement approved  ";
    const paymentFromLine = await storage.createReceiptVoucher({
      voucherType: "CP",
      voucherDate: today,
      narration: "   ",
    } as any, [{
      accountId: purchase.supplier_id,
      debit: "10",
      credit: "0",
      narration: paymentLineNarration,
      purchaseId: purchase.id,
    }]);

    const expectedPayment = `Payment made to ${purchase.supplier_name} against Invoice #${purchase.invoice_number} — Voucher #${generatedPayment.voucherNumber}`;
    assert.equal(generatedPayment.narration, expectedPayment, "Payment fallback should use supplier, invoice, and voucher data");
    assert.equal(manualPayment.narration, manualPaymentHeader, "Payment header narration must be preserved exactly");
    assert.equal(paymentFromLine.narration, paymentLineNarration, "Payment line narration must be used when the header is blank");

    for (const voucher of [generatedPayment, manualPayment, paymentFromLine]) {
      assert.equal(voucher.totalDebit, voucher.totalCredit, "Payment must remain balanced");
      assertSafeNarration(voucher.narration, `payment ${voucher.voucherNumber}`);
      const storedLines = sqlite.prepare(`
        SELECT account_id, narration, debit, credit
        FROM receipt_voucher_lines WHERE voucher_id = ? ORDER BY id
      `).all(voucher.id) as Array<{ account_id: number; narration: string; debit: string; credit: string }>;
      assert.equal(storedLines.length, 2, "Payment should have one party and one settlement line");
      storedLines.forEach((line) => assertSafeNarration(line.narration, `payment line ${voucher.voucherNumber}`));
      assert.equal(
        storedLines.reduce((sum, line) => sum + Number(line.debit), 0),
        storedLines.reduce((sum, line) => sum + Number(line.credit), 0),
        "Payment line postings must remain balanced",
      );
    }

    const generatedPaymentDetails = await storage.getReceiptVoucher(generatedPayment.id);
    assert.ok(generatedPaymentDetails?.settlementAccountId);
    await storage.updateReceiptVoucher(
      generatedPayment.id,
      { narration: expectedPayment } as any,
      generatedPaymentDetails.lines as any,
    );
    const updatedPaymentLines = sqlite.prepare("SELECT account_id FROM receipt_voucher_lines WHERE voucher_id = ?").all(generatedPayment.id) as Array<{ account_id: number }>;
    assert.equal(updatedPaymentLines.length, 2, "Payment update must structurally exclude the submitted settlement line");
    assert.equal(
      updatedPaymentLines.filter((line) => line.account_id === generatedPaymentDetails.settlementAccountId).length,
      1,
      "Payment update must create exactly one settlement line",
    );

    const supplierLedger = await storage.getLedgerReport({ accountId: purchase.supplier_id });
    for (const voucher of [generatedPayment, manualPayment, paymentFromLine]) {
      const rows = supplierLedger.rows.filter((row: any) => row.referenceType === "receipt_voucher" && row.referenceId === voucher.id);
      assert.ok(rows.length, `Ledger should contain payment ${voucher.voucherNumber}`);
      rows.forEach((row: any) => assertSafeNarration(row.narration, `payment ledger ${voucher.voucherNumber}`));
      assert.ok(rows.some((row: any) => row.narration.includes(String(voucher.narration).trim())), "Ledger should show payment narration");
    }

    const paymentDayBook = await storage.getDayBook(today);
    for (const voucher of [generatedPayment, manualPayment, paymentFromLine]) {
      const row = paymentDayBook.rows.find((entry: any) => entry.referenceType === "receipt_voucher" && entry.referenceId === voucher.id);
      assert.ok(row, `Day Book should contain payment ${voucher.voucherNumber}`);
      assertSafeNarration(row.mode, `payment day book ${voucher.voucherNumber}`);
      assert.ok(row.mode.includes(String(voucher.narration).trim().toUpperCase()), "Day Book should show payment narration");
    }

    const paymentPreview = await printService.renderPrintPreview(
      { docKey: "voucher.cashPayment", params: { voucherId: generatedPayment.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(paymentPreview.payload.notes, expectedPayment);
    assert.ok(paymentPreview.html.includes(expectedPayment), "Payment print preview should show generated narration");
    const manualPaymentPreview = await printService.renderPrintPreview(
      { docKey: "voucher.cashPayment", params: { voucherId: manualPayment.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(manualPaymentPreview.payload.notes, manualPaymentHeader);
    assert.ok(manualPaymentPreview.html.includes(manualPaymentHeader.trim()), "Payment print preview should show manual narration");
    const paymentDayBookPreview = await printService.renderPrintPreview(
      { docKey: "report.dayBook", params: { date: today.toISOString() } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(paymentDayBookPreview.html.includes(expectedPayment.toUpperCase()), "Day Book print preview should show payment narration");
    const supplierLedgerPreview = await printService.renderPrintPreview(
      { docKey: "report.ledger", params: { accountId: purchase.supplier_id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(supplierLedgerPreview.html.includes(expectedPayment), "Ledger print preview should show payment narration");
    const paymentPdf = await printService.renderPrintPdf(
      { docKey: "voucher.cashPayment", params: { voucherId: generatedPayment.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(paymentPdf.length > 1_000, "Payment PDF should be generated");
    assert.equal(paymentPdf.subarray(0, 4).toString(), "%PDF", "Payment PDF should be valid");

    const updatedPurchase = sqlite.prepare("SELECT paid_amount, total_amount FROM purchases WHERE id = ?").get(purchase.id) as { paid_amount: string; total_amount: string };
    const expectedPurchasePaid = Math.min(Number(purchase.paid_amount) + 50, Number(purchase.total_amount));
    assert.equal(Number(updatedPurchase.paid_amount), expectedPurchasePaid, "Payment narration must not alter purchase allocation calculations");

    console.log("Payment voucher narration integration tests passed.");

    const journalAccounts = sqlite.prepare(`
      SELECT id, name FROM accounts
      WHERE LOWER(COALESCE(type, '')) NOT IN ('employee', 'cash', 'bank')
        AND LOWER(name) NOT LIKE '%cash%'
      ORDER BY id LIMIT 2
    `).all() as Array<{ id: number; name: string }>;
    assert.equal(journalAccounts.length, 2, "Journal narration test requires two non-cash accounts");
    const [debitAccount, creditAccount] = journalAccounts;
    const stockBeforeJournals = Number((sqlite.prepare("SELECT COALESCE(SUM(CAST(current_stock AS REAL)), 0) AS total FROM products").get() as { total: number }).total);
    const generatedJournal = await storage.createJournalVoucher({
      voucherDate: today,
      narration: "   ",
      status: "approved",
    } as any, [
      { accountId: debitAccount.id, entryType: "DEBIT", amount: "37" },
      { accountId: creditAccount.id, entryType: "CREDIT", amount: "37" },
    ]);
    const manualJournalNarration = "  Month-end accrual approved by controller  ";
    const manualJournal = await storage.createJournalVoucher({
      voucherDate: today,
      narration: manualJournalNarration,
      status: "approved",
    } as any, [
      { accountId: debitAccount.id, entryType: "DEBIT", amount: "23" },
      { accountId: creditAccount.id, entryType: "CREDIT", amount: "23" },
    ]);
    const expectedJournal = `Journal Voucher #${generatedJournal.voucherNo} — ${debitAccount.name} to ${creditAccount.name}`;
    assert.equal(generatedJournal.narration, expectedJournal, "Journal fallback should identify debit and credit accounts");
    assert.equal(manualJournal.narration, manualJournalNarration, "Manual journal narration must be preserved exactly");
    assert.equal(generatedJournal.totalAmount, "37", "Narration must not change journal totals");
    assert.equal(manualJournal.totalAmount, "23", "Manual narration must not change journal totals");

    for (const voucher of [generatedJournal, manualJournal]) {
      assertSafeNarration(voucher.narration, `journal ${voucher.voucherNo}`);
      const entries = sqlite.prepare(`
        SELECT jve.entry_type, jve.amount, le.description
        FROM journal_voucher_entries jve
        LEFT JOIN ledger_entries le
          ON le.journal_voucher_id = jve.journal_voucher_id
         AND le.account_id = jve.account_id
         AND UPPER(le.transaction_type) = jve.entry_type
        WHERE jve.journal_voucher_id = ?
      `).all(voucher.id) as Array<{ entry_type: string; amount: string; description: string }>;
      assert.equal(entries.length, 2, "Journal should contain one debit and one credit");
      const debit = entries.filter((entry) => entry.entry_type === "DEBIT").reduce((sum, entry) => sum + Number(entry.amount), 0);
      const credit = entries.filter((entry) => entry.entry_type === "CREDIT").reduce((sum, entry) => sum + Number(entry.amount), 0);
      assert.equal(debit, credit, "Journal postings must remain balanced");
      entries.forEach((entry) => {
        assertSafeNarration(entry.description, `journal ledger description ${voucher.voucherNo}`);
        assert.equal(entry.description, voucher.narration, "New journal ledger descriptions should use resolved narration");
      });

      for (const account of [debitAccount, creditAccount]) {
        const report = await storage.getLedgerReport({ accountId: account.id });
        const rows = report.rows.filter((row: any) => row.referenceType === "journal_voucher" && row.referenceId === voucher.id);
        assert.ok(rows.length, `Ledger should contain journal ${voucher.voucherNo}`);
        rows.forEach((row: any) => assertSafeNarration(row.narration, `journal ledger ${voucher.voucherNo}`));
        assert.ok(rows.some((row: any) => row.narration.includes(String(voucher.narration).trim())), "Ledger should show journal narration");
      }
    }

    const journalDayBook = await storage.getDayBook(today);
    for (const voucher of [generatedJournal, manualJournal]) {
      const row = journalDayBook.rows.find((entry: any) => entry.referenceType === "journal_voucher" && entry.referenceId === voucher.id);
      assert.ok(row, `Day Book should contain journal ${voucher.voucherNo}`);
      assertSafeNarration(row.mode, `journal day book ${voucher.voucherNo}`);
      assert.ok(row.mode.includes(String(voucher.narration).trim().toUpperCase()), "Day Book should show journal narration");
    }

    const journalPreview = await printService.renderPrintPreview(
      { docKey: "voucher.journal", params: { voucherId: generatedJournal.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(journalPreview.payload.notes, expectedJournal);
    assert.ok(journalPreview.html.includes(expectedJournal), "Journal print preview should show generated narration");
    const manualJournalPreview = await printService.renderPrintPreview(
      { docKey: "voucher.journal", params: { voucherId: manualJournal.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(manualJournalPreview.payload.notes, manualJournalNarration);
    assert.ok(manualJournalPreview.html.includes(manualJournalNarration.trim()), "Journal print preview should show manual narration");
    const journalDayBookPreview = await printService.renderPrintPreview(
      { docKey: "report.dayBook", params: { date: today.toISOString() } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(journalDayBookPreview.html.includes(expectedJournal.toUpperCase()), "Day Book print preview should show journal narration");
    const journalLedgerPreview = await printService.renderPrintPreview(
      { docKey: "report.ledger", params: { accountId: debitAccount.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(journalLedgerPreview.html.includes(expectedJournal), "Ledger print preview should show journal narration");
    const journalPdf = await printService.renderPrintPdf(
      { docKey: "voucher.journal", params: { voucherId: generatedJournal.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(journalPdf.length > 1_000, "Journal PDF should be generated");
    assert.equal(journalPdf.subarray(0, 4).toString(), "%PDF", "Journal PDF should be valid");

    const stockAfterJournals = Number((sqlite.prepare("SELECT COALESCE(SUM(CAST(current_stock AS REAL)), 0) AS total FROM products").get() as { total: number }).total);
    assert.equal(stockAfterJournals, stockBeforeJournals, "Journal narration must not affect stock");

    console.log("Core journal voucher narration integration tests passed.");

    const cashBalanceBefore = await cashService.getBalance(1);
    const generatedCashJournal = await cashService.createJournalVoucher({
      voucherDate: today.toISOString(),
      narration: "   ",
      items: [
        { accountHead: "Cash", debitAmount: "41", creditAmount: "0", narration: "" },
        { accountHead: "Customer Advances", debitAmount: "0", creditAmount: "41", narration: " " },
      ],
    });
    const manualCashNarration = "  Petty cash replenishment authorized  ";
    const manualCashJournal = await cashService.createJournalVoucher({
      voucherDate: today.toISOString(),
      narration: manualCashNarration,
      items: [
        { accountHead: "Office Expense", debitAmount: "19", creditAmount: "0", narration: "" },
        { accountHead: "Cash", debitAmount: "0", creditAmount: "19", narration: "cash counter line" },
      ],
    });
    const itemCashNarration = "  Cash received for sundry adjustment  ";
    const itemCashJournal = await cashService.createJournalVoucher({
      voucherDate: today.toISOString(),
      narration: "",
      items: [
        { accountHead: "Cash", debitAmount: "7", creditAmount: "0", narration: itemCashNarration },
        { accountHead: "Sundry Account", debitAmount: "0", creditAmount: "7", narration: "" },
      ],
    });

    const generatedCashDetails = await cashService.getJournalVoucherById(generatedCashJournal.id);
    const manualCashDetails = await cashService.getJournalVoucherById(manualCashJournal.id);
    const itemCashDetails = await cashService.getJournalVoucherById(itemCashJournal.id);
    assert.ok(generatedCashDetails && manualCashDetails && itemCashDetails);
    const expectedCashJournal = `Cash Journal Voucher #${generatedCashJournal.voucherNo} — Cash to Customer Advances`;
    assert.equal(generatedCashDetails.voucher.narration, expectedCashJournal, "Cash journal fallback should use account flow");
    assert.equal(manualCashDetails.voucher.narration, manualCashNarration, "Cash journal header narration must be preserved exactly");
    assert.equal(itemCashDetails.voucher.narration, itemCashNarration, "Cash journal item narration must be used when header is blank");

    for (const details of [generatedCashDetails, manualCashDetails, itemCashDetails]) {
      const { voucher, items } = details;
      assert.equal(voucher.totalDebit, voucher.totalCredit, "Cash journal must remain balanced");
      assertSafeNarration(voucher.narration, `cash journal ${voucher.voucherNo}`);
      assert.equal(items.length, 2, "Cash journal should retain both items");
      items.forEach((item: any) => assertSafeNarration(item.narration, `cash journal item ${voucher.voucherNo}`));
      assert.equal(
        items.reduce((sum: number, item: any) => sum + Number(item.debitAmount), 0),
        items.reduce((sum: number, item: any) => sum + Number(item.creditAmount), 0),
        "Cash journal item totals must remain balanced",
      );
      const child = sqlite.prepare(`
        SELECT description, received_from AS party, amount, 'receipt' AS kind
        FROM cash_receipts WHERE reference_type = 'journal' AND reference_id = ?
        UNION ALL
        SELECT description, paid_to AS party, amount, 'payment' AS kind
        FROM cash_payments WHERE reference_type = 'journal' AND reference_id = ?
      `).all(voucher.id, voucher.id) as Array<{ description: string; party: string; amount: string; kind: string }>;
      assert.equal(child.length, 1, "Each tested cash journal should create one cash child record");
      assert.equal(child[0].description, voucher.narration, "Cash child description should use meaningful voucher context");
      assert.equal(child[0].party, voucher.narration, "Cash child party context should use meaningful voucher narration");
      assert.doesNotMatch(child[0].description, /^JV\s/i, "Cash child description must not use the generic JV prefix");
      assertSafeNarration(child[0].description, `cash child ${voucher.voucherNo}`);
    }

    const cashJournalBook = await cashService.getJournalVouchers();
    for (const details of [generatedCashDetails, manualCashDetails, itemCashDetails]) {
      const row = cashJournalBook.find((voucher: any) => voucher.id === details.voucher.id);
      assert.ok(row, `Cash Journal Day Book should contain ${details.voucher.voucherNo}`);
      assert.equal(row.narration, details.voucher.narration, "Cash Journal Day Book should show resolved narration");
      assertSafeNarration(row.narration, `cash journal day book ${details.voucher.voucherNo}`);
    }

    const cashLedger = await cashService.getLedger({ cashAccountId: 1 });
    for (const details of [generatedCashDetails, manualCashDetails, itemCashDetails]) {
      const rows = cashLedger.filter((row: any) => row.referenceType === "journal" && row.referenceId === details.voucher.id);
      assert.equal(rows.length, 1, `Cash Ledger should contain ${details.voucher.voucherNo}`);
      assert.equal(rows[0].description, details.voucher.narration, "Cash Ledger should show resolved narration");
      assertSafeNarration(rows[0].description, `cash ledger ${details.voucher.voucherNo}`);
    }

    const cashJournalPreview = await printService.renderPrintPreview(
      { docKey: "voucher.cashJournal", params: { voucherId: generatedCashJournal.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(cashJournalPreview.payload.notes, expectedCashJournal);
    assert.ok(cashJournalPreview.html.includes(expectedCashJournal), "Cash journal print preview should show generated narration");
    const manualCashJournalPreview = await printService.renderPrintPreview(
      { docKey: "voucher.cashJournal", params: { voucherId: manualCashJournal.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(manualCashJournalPreview.payload.notes, manualCashNarration);
    assert.ok(manualCashJournalPreview.html.includes(manualCashNarration.trim()), "Cash journal print preview should show manual narration");
    const cashJournalPdf = await printService.renderPrintPdf(
      { docKey: "voucher.cashJournal", params: { voucherId: generatedCashJournal.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(cashJournalPdf.length > 1_000, "Cash journal PDF should be generated");
    assert.equal(cashJournalPdf.subarray(0, 4).toString(), "%PDF", "Cash journal PDF should be valid");

    const cashBalanceAfter = await cashService.getBalance(1);
    assert.equal(
      cashBalanceAfter.currentBalance,
      cashBalanceBefore.currentBalance + 41 - 19 + 7,
      "Cash journal narration must not alter cash accounting",
    );

    console.log("Cash journal voucher narration integration tests passed.");
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

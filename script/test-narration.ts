import { strict as assert } from "node:assert";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  buildPurchaseNarration,
  buildSaleNarration,
  joinNarration,
} from "../server/utils/narration";

function assertSafeNarration(value: unknown, label: string) {
  const text = String(value ?? "");
  assert.ok(text.trim(), `${label} must not be blank`);
  assert.doesNotMatch(text, /\b(?:undefined|null)\b/i, `${label} contains a null-like placeholder`);
  assert.doesNotMatch(text, /—\s*—|\|\s*\|/, `${label} contains an empty separator`);
}

type IntegrationContext = {
  storage: any;
  sqlite: any;
  daybooks: any;
  printService: any;
  pdfEngine: any;
};

let integrationContext: IntegrationContext | undefined;
let integrationTempDir = "";

async function getIntegrationContext(): Promise<IntegrationContext> {
  if (integrationContext) return integrationContext;
  integrationTempDir = mkdtempSync(join(tmpdir(), "mill-manager-narration-"));
  const tempDb = join(integrationTempDir, "data.db");
  copyFileSync(resolve(".local/data.db"), tempDb);
  process.env.DATABASE_URL = tempDb;
  const [{ storage }, { sqlite }, daybooks, printService, pdfEngine] = await Promise.all([
    import("../server/models/storage"),
    import("../server/models/db"),
    import("../server/services/daybooks.service"),
    import("../server/services/print.service"),
    import("../server/services/print/pdf/engine"),
  ]);
  integrationContext = { storage, sqlite, daybooks, printService, pdfEngine };
  return integrationContext;
}

async function closeIntegrationContext() {
  if (!integrationContext) return;
  await integrationContext.pdfEngine.closePdfBrowser();
  integrationContext.sqlite.close();
  integrationContext = undefined;
  rmSync(integrationTempDir, { recursive: true, force: true });
}

async function runSalesIntegration() {
  const { storage, sqlite, daybooks, printService, pdfEngine } = await getIntegrationContext();

    const customer = sqlite.prepare("SELECT id, name FROM accounts WHERE type = 'customer' ORDER BY id LIMIT 1").get() as { id: number; name: string } | undefined;
    const product = sqlite.prepare("SELECT id, current_stock FROM products WHERE CAST(current_stock AS REAL) >= 2 ORDER BY id LIMIT 1").get() as { id: number; current_stock: string } | undefined;
    assert.ok(customer, "Sales narration test requires a customer account");
    assert.ok(product, "Sales narration test requires a product with at least 2kg stock");

    const taxType = sqlite.prepare("INSERT INTO tax_types (name, direction) VALUES ('Narration Test Sales Tax', 'sales') RETURNING id").get() as { id: number };
    sqlite.prepare("INSERT INTO tax_rates (tax_type_id, rate_percent, effective_from, is_active) VALUES (?, '5', ?, 1)").run(taxType.id, Math.floor(Date.now() / 1000) - 86_400);

    // Give the isolated test product a cost so both COGS and Inventory lines are exercised.
    sqlite.prepare("UPDATE products SET avg_purchase_price = '10' WHERE id = ?").run(product.id);
    const stockBefore = Number(product.current_stock);
    const today = new Date();
    const manualNarration = "  Priority dispatch for export order  ";
    const manualNarrationDisplay = manualNarration.trim();
    const commonSale = {
      customerId: customer.id,
      saleDate: today,
      paymentMode: "credit",
      paidAmount: "0",
      loadingCharges: "0",
      weighingCharges: "0",
      otherCharges: "0",
      rentCharges: "0",
      discountAmount: "0",
      taxTypeId: taxType.id,
    };
    const item = { productId: product.id, quantity: "1", unit: "kg" as const, pricePerUnit: "100" };

    const generatedSale = await storage.createSale({ ...commonSale, notes: "   " } as any, [item]);
    const manualSale = await storage.createSale({ ...commonSale, notes: manualNarration } as any, [item]);
    const expectedGenerated = `Sale to ${customer.name} — Invoice #${generatedSale.invoiceNumber}`;

    assert.equal(generatedSale.notes, expectedGenerated, "Blank sale notes should receive the backend fallback");
    assert.equal(manualSale.notes, manualNarration, "Manual sale notes must be preserved exactly");
    assert.equal(generatedSale.totalAmount, "105", "Sales narration changes must not alter sale totals");
    assert.equal(manualSale.totalAmount, "105", "Manual sales narration must not alter sale totals");
    assertSafeNarration(generatedSale.notes, "generated sale narration");
    assertSafeNarration(manualSale.notes, "manual sale narration");

    for (const sale of [generatedSale, manualSale]) {
      const ledger = await storage.getLedgerReport({ accountId: customer.id });
      const rows = ledger.rows.filter((row) => row.referenceType === "sale" && row.referenceId === sale.id);
      assert.ok(rows.length > 0, `Ledger should contain sale ${sale.invoiceNumber}`);
      for (const row of rows) {
        assertSafeNarration(row.narration, `ledger narration for ${sale.invoiceNumber}`);
        assert.ok(row.narration.startsWith(String(sale.notes).trim()), "Ledger narration should start with the preserved/generated sale narration");
      }

      const postings = sqlite.prepare(`
        SELECT transaction_type, amount, description
        FROM ledger_entries
        WHERE sale_id = ?
      `).all(sale.id) as Array<{ transaction_type: "debit" | "credit"; amount: string; description: string }>;
      const debit = postings.filter((p) => p.transaction_type === "debit").reduce((sum, p) => sum + Number(p.amount), 0);
      const credit = postings.filter((p) => p.transaction_type === "credit").reduce((sum, p) => sum + Number(p.amount), 0);
      assert.equal(debit, credit, `Sale ${sale.invoiceNumber} ledger postings must remain balanced`);

      const accountIds = sqlite.prepare("SELECT DISTINCT account_id FROM ledger_entries WHERE sale_id = ?").all(sale.id) as Array<{ account_id: number }>;
      const allNarrations: string[] = [];
      for (const { account_id: accountId } of accountIds) {
        const accountLedger = await storage.getLedgerReport({ accountId });
        allNarrations.push(
          ...accountLedger.rows
            .filter((row) => row.referenceType === "sale" && row.referenceId === sale.id)
            .map((row) => row.narration),
        );
      }
      assert.ok(allNarrations.some((text) => text.includes("Revenue")), "Sale Ledger should identify Revenue lines");
      assert.ok(allNarrations.some((text) => text.includes("Tax:")), "Sale Ledger should identify Tax lines");
      assert.ok(allNarrations.some((text) => text.includes("COGS")), "Sale Ledger should identify COGS lines");
      assert.ok(allNarrations.some((text) => text.includes("Inventory")), "Sale Ledger should identify Inventory lines");
      allNarrations.forEach((text) => assertSafeNarration(text, `all-account ledger narration for ${sale.invoiceNumber}`));
    }

    const stockAfter = Number((sqlite.prepare("SELECT current_stock FROM products WHERE id = ?").get(product.id) as { current_stock: string }).current_stock);
    assert.equal(stockAfter, stockBefore - 2, "Sales narration changes must not alter stock calculations");

    const daybookRows = daybooks.listSalesDaybook({} as any) as any[];
    for (const sale of [generatedSale, manualSale]) {
      const row = daybookRows.find((entry) => entry.sale_id === sale.id);
      assert.ok(row, `Sales Day Book should contain ${sale.invoiceNumber}`);
      assert.equal(row.description, sale.notes, "Sales Day Book should show the preserved/generated narration");
      assertSafeNarration(row.description, `day book narration for ${sale.invoiceNumber}`);
    }

    const invoicePreview = await printService.renderPrintPreview(
      { docKey: "invoice.sales", params: { saleId: generatedSale.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(invoicePreview.payload.notes, expectedGenerated);
    assert.ok(invoicePreview.html.includes(expectedGenerated), "Sales print preview should contain generated narration");

    const manualPreview = await printService.renderPrintPreview(
      { docKey: "invoice.sales", params: { saleId: manualSale.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.equal(manualPreview.payload.notes, manualNarration);
    assert.ok(manualPreview.html.includes(manualNarrationDisplay), "Sales print preview should contain manual narration");

    const dayBookPreview = await printService.renderPrintPreview(
      { docKey: "report.dayBook", params: { daybookType: "sales" } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(dayBookPreview.html.includes(expectedGenerated), "Sales Day Book print preview should contain generated narration");
    assert.ok(dayBookPreview.html.includes(manualNarrationDisplay), "Sales Day Book print preview should contain manual narration");

    const ledgerPreview = await printService.renderPrintPreview(
      { docKey: "report.ledger", params: { accountId: customer.id, scope: "sales" } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(ledgerPreview.html.includes(expectedGenerated), "Ledger print preview should contain generated narration");
    assert.ok(ledgerPreview.html.includes(manualNarrationDisplay), "Ledger print preview should contain manual narration");

    const pdf = await printService.renderPrintPdf(
      { docKey: "invoice.sales", params: { saleId: generatedSale.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(pdf.length > 1_000, "Sales PDF should be generated");
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF", "Sales PDF should have a valid PDF signature");
    await pdfEngine.closePdfBrowser();
}

async function runPurchasesIntegration() {
  const { storage, sqlite, daybooks, printService, pdfEngine } = await getIntegrationContext();

    const supplier = sqlite.prepare("SELECT id, name FROM accounts WHERE type = 'supplier' ORDER BY id LIMIT 1").get() as { id: number; name: string } | undefined;
    const product = sqlite.prepare("SELECT id, current_stock, avg_purchase_price FROM products ORDER BY id LIMIT 1").get() as { id: number; current_stock: string; avg_purchase_price: string } | undefined;
    assert.ok(supplier, "Purchase narration test requires a supplier account");
    assert.ok(product, "Purchase narration test requires a product");

    const taxType = sqlite.prepare("INSERT INTO tax_types (name, direction) VALUES ('Narration Test GST', 'purchases') RETURNING id").get() as { id: number };
    sqlite.prepare("INSERT INTO tax_rates (tax_type_id, rate_percent, effective_from, is_active) VALUES (?, '5', ?, 1)").run(taxType.id, Math.floor(Date.now() / 1000) - 86_400);

    const stockBefore = Number(product.current_stock);
    const valueBefore = stockBefore * Number(product.avg_purchase_price);
    const today = new Date();
    const manualNarration = "  Quality lot reserved for milling  ";
    const manualNarrationDisplay = manualNarration.trim();
    const commonPurchase = {
      supplierId: supplier.id,
      purchaseDate: today,
      paymentMode: "credit",
      paidAmount: "0",
      brokerCommissionPercent: "0",
      taxTypeId: taxType.id,
    };
    const item = {
      productId: product.id,
      bags: "1",
      fillingPerBagKg: "40",
      looseKgs: "0",
      lessKg: "0",
      bardanaKatKg: "0",
      rate: "10",
      rateUnit: "kg" as const,
    };
    const charges = [{ type: "freight" as const, mode: "add" as const, amount: "25" }];

    const generatedPurchase = await storage.createPurchase({ ...commonPurchase, notes: "" } as any, [item], charges, 40);
    const manualPurchase = await storage.createPurchase({ ...commonPurchase, notes: manualNarration } as any, [item], charges, 40);
    const expectedGenerated = `Purchase from ${supplier.name} — Invoice #${generatedPurchase.invoiceNumber}`;

    assert.equal(generatedPurchase.notes, expectedGenerated, "Blank purchase notes should receive the backend fallback");
    assert.equal(manualPurchase.notes, manualNarration, "Manual purchase notes must be preserved exactly");
    assert.equal(generatedPurchase.totalAmount, "446.25", "Purchase narration changes must not alter purchase totals");
    assert.equal(manualPurchase.totalAmount, "446.25", "Manual purchase narration must not alter purchase totals");
    assertSafeNarration(generatedPurchase.notes, "generated purchase narration");
    assertSafeNarration(manualPurchase.notes, "manual purchase narration");

    for (const purchase of [generatedPurchase, manualPurchase]) {
      const postings = sqlite.prepare(`
        SELECT account_id, transaction_type, amount
        FROM ledger_entries
        WHERE purchase_id = ?
      `).all(purchase.id) as Array<{ account_id: number; transaction_type: "debit" | "credit"; amount: string }>;
      const debit = postings.filter((p) => p.transaction_type === "debit").reduce((sum, p) => sum + Number(p.amount), 0);
      const credit = postings.filter((p) => p.transaction_type === "credit").reduce((sum, p) => sum + Number(p.amount), 0);
      assert.equal(debit, credit, `Purchase ${purchase.invoiceNumber} ledger postings must remain balanced`);

      const allNarrations: string[] = [];
      for (const accountId of new Set(postings.map((posting) => posting.account_id))) {
        const ledger = await storage.getLedgerReport({ accountId });
        allNarrations.push(
          ...ledger.rows
            .filter((row) => row.referenceType === "purchase" && row.referenceId === purchase.id)
            .map((row) => row.narration),
        );
      }
      assert.ok(allNarrations.length > 0, `Ledger should contain purchase ${purchase.invoiceNumber}`);
      assert.ok(allNarrations.every((text) => text.startsWith(String(purchase.notes).trim())), "Ledger narration should start with the preserved/generated purchase narration");
      assert.ok(allNarrations.some((text) => text.includes("Inventory")), "Purchase Ledger should identify Inventory lines");
      assert.ok(allNarrations.some((text) => text.includes("Supplier Payable")), "Purchase Ledger should identify Supplier Payable lines");
      assert.ok(allNarrations.some((text) => text.includes("Tax:")), "Purchase Ledger should identify Tax lines");
      assert.ok(allNarrations.some((text) => text.includes("FREIGHT")), "Purchase Ledger should identify Charge lines");
      allNarrations.forEach((text) => assertSafeNarration(text, `ledger narration for ${purchase.invoiceNumber}`));
    }

    const stockAfterRow = sqlite.prepare("SELECT current_stock, avg_purchase_price FROM products WHERE id = ?").get(product.id) as { current_stock: string; avg_purchase_price: string };
    const stockAfter = Number(stockAfterRow.current_stock);
    assert.equal(stockAfter, stockBefore + 80, "Purchase narration changes must not alter stock quantity calculations");
    const expectedAverage = (valueBefore + 800) / (stockBefore + 80);
    assert.ok(Math.abs(Number(stockAfterRow.avg_purchase_price) - expectedAverage) < 0.000001, "Purchase narration changes must not alter weighted-average cost");

    const daybookRows = daybooks.listPurchasesDaybook({} as any) as any[];
    for (const purchase of [generatedPurchase, manualPurchase]) {
      const row = daybookRows.find((entry) => entry.purchase_id === purchase.id);
      assert.ok(row, `Purchases Day Book should contain ${purchase.invoiceNumber}`);
      assert.equal(row.description, purchase.notes, "Purchases Day Book should show the preserved/generated narration");
      assertSafeNarration(row.description, `day book narration for ${purchase.invoiceNumber}`);
    }

    const invoicePreview = await printService.renderPrintPreview(
      { docKey: "invoice.purchase", params: { purchaseId: generatedPurchase.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(String(invoicePreview.payload.notes).includes(expectedGenerated));
    assert.ok(invoicePreview.html.includes(expectedGenerated), "Purchase print preview should contain generated narration");

    const manualPreview = await printService.renderPrintPreview(
      { docKey: "invoice.purchase", params: { purchaseId: manualPurchase.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(String(manualPreview.payload.notes).includes(manualNarration));
    assert.ok(manualPreview.html.includes(manualNarrationDisplay), "Purchase print preview should contain manual narration");

    const dayBookPreview = await printService.renderPrintPreview(
      { docKey: "report.dayBook", params: { daybookType: "purchases" } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(dayBookPreview.html.includes(expectedGenerated), "Purchases Day Book print preview should contain generated narration");
    assert.ok(dayBookPreview.html.includes(manualNarrationDisplay), "Purchases Day Book print preview should contain manual narration");

    const ledgerPreview = await printService.renderPrintPreview(
      { docKey: "report.ledger", params: { accountId: supplier.id, scope: "purchases" } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(ledgerPreview.html.includes(expectedGenerated), "Purchase Ledger print preview should contain generated narration");
    assert.ok(ledgerPreview.html.includes(manualNarrationDisplay), "Purchase Ledger print preview should contain manual narration");

    const pdf = await printService.renderPrintPdf(
      { docKey: "invoice.purchase", params: { purchaseId: generatedPurchase.id } },
      { role: "admin", userLabel: "Narration test" },
    );
    assert.ok(pdf.length > 1_000, "Purchase PDF should be generated");
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF", "Purchase PDF should have a valid PDF signature");
    await pdfEngine.closePdfBrowser();
}

async function main() {
  assert.equal(joinNarration(["Sale", null, "", undefined, "Invoice #1"]), "Sale — Invoice #1");
  assert.equal(buildSaleNarration({ notes: "Manual", customerName: "Ignored", invoiceNumber: "1" }), "Manual");
  assert.equal(buildSaleNarration({ customerName: "Ali", invoiceNumber: "SAL-1" }), "Sale to Ali — Invoice #SAL-1");
  assert.equal(buildPurchaseNarration({ notes: "Manual", supplierName: "Ignored", invoiceNumber: "1" }), "Manual");
  assert.equal(buildPurchaseNarration({ supplierName: "Ahmed", invoiceNumber: "PUR-1" }), "Purchase from Ahmed — Invoice #PUR-1");

  try {
    await runSalesIntegration();
    await runPurchasesIntegration();
    console.log("Sales and purchase narration integration tests passed.");
  } finally {
    await closeIntegrationContext();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * Sale persistence, extracted from the "// Sales" / "// Sale Items" sections of
 * storage.ts. Posting helpers come from ./ledger.model and the period guard
 * from ../services/posting-guard.service (previously `this.assertPostingAllowed`).
 */
import { db, sqlite } from "./db";
import { eq, and, asc, desc, sql, gte, lte, lt, isNull, inArray, or } from "drizzle-orm";
import {
  accounts, products, sales, saleItems,
  ledgerEntries, cashTransactions, taxLedgers, taxTypes, invoiceAllocations, auditLogs,
  type InsertLedgerEntry,
  type Sale, type InsertSale, type SaleItem, type InsertSaleItem,
} from "../db/schema";
import { parseAmount, roundMoney } from "../utils/parse";
import { assertPostingAllowed } from "../services/posting-guard.service";
import { recomputeAccountBalances } from "./accounts.model";
import { updateProductStockOn } from "./products.model";
import {
  buildLedgerReferenceWhere,
  calculateTaxAmount,
  deleteDaybookProjection,
  ensureSalesChargeAccount,
  ensureSystemAccount,
  getLedgerReferenceColumns,
  postBalancedLedgerEntries,
  postLedgerEntry,
} from "./ledger.model";
import type { SaleItemInput } from "../repositories/types";

import { nextDocumentSequence } from "./sequences.model";
import { toValidDate } from "../services/posting-guard.service";
import { buildSaleNarration as buildSaleNarrationText } from "../utils/narration";

type DbClient = typeof db;

/** Sale lines may be entered in mounds/quintals/tons; stock moves in kg. */
function toSaleQuantityKg(quantity: string | number, unit: string | null | undefined): number {
  const qty = parseAmount(quantity);
  const factor = unit === "mound" ? 40 : unit === "quintal" ? 100 : unit === "ton" ? 1000 : unit === "kg" ? 1 : 0;
  if (qty <= 0 || factor === 0) throw new Error(`Unsupported or invalid sale quantity unit: ${unit ?? ""}`);
  return qty * factor;
}

export async function getSales(): Promise<Sale[]> {
  return db.select().from(sales).orderBy(desc(sales.saleDate)).all();
}

export async function getSale(id: number): Promise<Sale | undefined> {
  const [sale] = db.select().from(sales).where(eq(sales.id, id)).all();
  return sale;
}

export async function getNextSaleInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const nextNum = nextDocumentSequence("sales", "invoice_number");
  return `SAL-${year}-${String(nextNum).padStart(4, "0")}`;
}

export async function getNextGatePassNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const nextNum = nextDocumentSequence("sales", "gate_pass_number");
  return `GP-${year}-${String(nextNum).padStart(4, "0")}`;
}

export async function createSale(sale: InsertSale, items: SaleItemInput[]): Promise<Sale> {
  return db.transaction((tx) => {
    const year = new Date().getFullYear();
    const nextInvoice = nextDocumentSequence("sales", "invoice_number");
    const invoiceNumber = `SAL-${year}-${String(nextInvoice).padStart(4, "0")}`;

    const nextGp = nextDocumentSequence("sales", "gate_pass_number");
    const gatePassNumber = `GP-${year}-${String(nextGp).padStart(4, "0")}`;

    const client = tx as unknown as DbClient;
    const postingDate = sale.saleDate ? new Date(sale.saleDate as any) : new Date();
    assertPostingAllowed(client, postingDate, "sale");

    let subtotal = 0;
    const normalizedItems = items.map((item) => {
      const qty = parseAmount(item.quantity);
      const price = parseAmount(item.pricePerUnit);
      const quantityKg = toSaleQuantityKg(qty, item.unit);
      const total = roundMoney(qty * price);
      subtotal = roundMoney(subtotal + total);
      return {
        ...item,
        quantity: qty.toString(),
        quantityKg: quantityKg.toString(),
        pricePerUnit: price.toString(),
        totalPrice: total.toString(),
      };
    });

    // Validate stock first
    for (const item of normalizedItems) {
      const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
      const currentStock = parseAmount(product?.currentStock || "0");
      const qty = parseAmount(item.quantityKg);
      if (currentStock < qty) {
        throw new Error(`Insufficient stock for product ${product?.name || item.productId}. Available: ${currentStock}, Required: ${qty}`);
      }
    }

    const loadingCharge = parseAmount(sale.loadingCharges || "0");
    const weighingCharge = parseAmount(sale.weighingCharges || "0");
    const otherCharge = parseAmount(sale.otherCharges || "0");
    const rentCharge = parseAmount((sale as any).rentCharges || "0");
    const discountAmount = parseAmount((sale as any).discountAmount || "0");
    const charges = roundMoney(loadingCharge + weighingCharge + otherCharge + rentCharge);
    if (discountAmount > subtotal + charges) throw new Error("Discount cannot exceed the invoice value");
    const taxAmount = roundMoney(calculateTaxAmount(client, (sale as any).taxTypeId, roundMoney(subtotal + charges - discountAmount), postingDate, "sales"));
    const totalAmount = roundMoney(Math.max(0, subtotal + charges - discountAmount + taxAmount));
    const requestedPaid = parseAmount((sale as any).paidAmount || "0");
    const paidAmount = roundMoney(Math.min(Math.max(0, requestedPaid), totalAmount));
    const balanceDue = roundMoney(Math.max(totalAmount - paidAmount, 0));
    const [customer] = client
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, sale.customerId))
      .limit(1)
      .all();
    const narration = buildSaleNarrationText({
      notes: sale.notes,
      customerName: customer?.name,
      invoiceNumber,
    });

    const newSale = tx.insert(sales).values({
      ...sale,
      notes: narration,
      invoiceNumber,
      gatePassNumber,
      subtotal: subtotal.toString(),
      totalAmount: totalAmount.toString(),
      paidAmount: paidAmount.toString(),
      balanceDue: balanceDue.toString(),
      taxAmount: taxAmount.toString(),
      taxTypeId: (sale as any).taxTypeId ?? null,
    }).returning().get();

    for (const item of normalizedItems) {
      tx.insert(saleItems).values({
        ...item,
        saleId: newSale.id,
      }).run();
      updateProductStockOn(client, item.productId, item.quantityKg, "subtract");
    }

    // Double-entry: split sale into base/tax/charge lines so ledgers show each impact.
    const ledgerLines: Omit<InsertLedgerEntry, "balance">[] = [];
    const revenueAccount = ensureSystemAccount(client, "Sales Revenue", "income");
    const saleBaseLabel = `SALE ${invoiceNumber}`;
    const pushLine = (line: Omit<InsertLedgerEntry, "balance">) => ledgerLines.push(line);

    const baseRevenue = Math.max(subtotal - discountAmount, 0);
    if (baseRevenue > 0) {
      const amount = baseRevenue.toString();
      pushLine({
        accountId: sale.customerId,
        transactionType: "debit",
        amount,
        description: saleBaseLabel,
        ...getLedgerReferenceColumns("sale", newSale.id),
        entryDate: postingDate,
      });
      pushLine({
        accountId: revenueAccount.id,
        transactionType: "credit",
        amount,
        description: saleBaseLabel,
        ...getLedgerReferenceColumns("sale", newSale.id),
        entryDate: postingDate,
      });
    }

    const chargeLines = [
      { label: "LOADING", amount: loadingCharge },
      { label: "WEIGHING", amount: weighingCharge },
      { label: "OTHER", amount: otherCharge },
      { label: "RENT", amount: rentCharge },
    ];
    for (const line of chargeLines) {
      if (line.amount === 0) continue;
      const entryType = line.amount > 0 ? "credit" : "debit";
      const amount = Math.abs(line.amount).toString();
      const chargeAccount = ensureSalesChargeAccount(client, line.label as "LOADING" | "WEIGHING" | "OTHER" | "RENT");
      pushLine({
        accountId: chargeAccount.id,
        transactionType: entryType,
        amount,
        description: line.label,
        ...getLedgerReferenceColumns("sale", newSale.id),
        entryDate: postingDate,
      });
      pushLine({
        accountId: sale.customerId,
        transactionType: entryType === "credit" ? "debit" : "credit",
        amount,
        description: line.label,
        ...getLedgerReferenceColumns("sale", newSale.id),
        entryDate: postingDate,
      });
    }

    if (taxAmount > 0) {
      const taxTypeId = (sale as any).taxTypeId as number | undefined;
      let taxAccountId: number;
      if (taxTypeId) {
        const [tt] = tx.select().from(taxTypes).where(eq(taxTypes.id, taxTypeId)).all();
        const taxAcct = tt?.outputAccountId ? tx.select().from(accounts).where(eq(accounts.id, tt.outputAccountId)).all()[0] : undefined;
        taxAccountId = taxAcct?.id ?? ensureSystemAccount(client, "Tax Output", "liability").id;
      } else {
        taxAccountId = ensureSystemAccount(client, "Tax Output", "liability").id;
      }
      const taxLabel = "TAX";
      pushLine({
        accountId: taxAccountId,
        transactionType: "credit",
        amount: taxAmount.toString(),
        description: taxLabel,
        ...getLedgerReferenceColumns("sale", newSale.id),
        entryDate: postingDate,
      });
      pushLine({
        accountId: sale.customerId,
        transactionType: "debit",
        amount: taxAmount.toString(),
        description: taxLabel,
        ...getLedgerReferenceColumns("sale", newSale.id),
        entryDate: postingDate,
      });
      tx.insert(taxLedgers).values({
        taxTypeId: taxTypeId ?? null,
        saleId: newSale.id,
        taxBase: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        postingDate,
        createdAt: new Date(),
      } as any).run();
    }

    if ((sale.paymentMode ?? "cash") === "cash" && paidAmount > 0) {
      const cashAccount = ensureSystemAccount(client, "Cash in Hand", "asset");
      pushLine({ accountId: cashAccount.id, transactionType: "debit", amount: paidAmount.toString(), description: `RECEIPT ${invoiceNumber}`, ...getLedgerReferenceColumns("sale", newSale.id), entryDate: postingDate });
      pushLine({ accountId: sale.customerId, transactionType: "credit", amount: paidAmount.toString(), description: `RECEIPT ${invoiceNumber}`, ...getLedgerReferenceColumns("sale", newSale.id), entryDate: postingDate });
    }
    postBalancedLedgerEntries(client, ledgerLines, `sale ${invoiceNumber}`);

    // COGS: use current avgPurchasePrice * qty
    const inventoryAccount = ensureSystemAccount(client, "Inventory", "asset");
    const cogsAccount = ensureSystemAccount(client, "Cost of Goods Sold", "cogs");
    let totalCogs = 0;
    for (const item of normalizedItems) {
      const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
      const avgCost = parseAmount(product?.avgPurchasePrice || "0");
      const qty = parseAmount(item.quantityKg);
      const lineCost = avgCost * qty;
      totalCogs += lineCost;
    }
    if (totalCogs > 0) {
      postLedgerEntry(client, {
        accountId: cogsAccount.id,
        transactionType: "debit",
        amount: totalCogs.toString(),
        description: `COGS ${invoiceNumber}`,
        ...getLedgerReferenceColumns("sale", newSale.id),
        entryDate: postingDate,
      });
      postLedgerEntry(client, {
        accountId: inventoryAccount.id,
        transactionType: "credit",
        amount: totalCogs.toString(),
        description: `Inventory Relief ${invoiceNumber}`,
        ...getLedgerReferenceColumns("sale", newSale.id),
        entryDate: postingDate,
      });
    }

      return newSale;
    });
  }

export async function updateSale(id: number, sale: Partial<InsertSale>, items: SaleItemInput[]): Promise<Sale | undefined> {
    const existing = await getSale(id);
    if (!existing) return undefined;
    const existingItems = await getSaleItems(id);

    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const postingDate = toValidDate(sale.saleDate ?? existing.saleDate);
      assertPostingAllowed(client, postingDate, "sale");

        // Remove previous ledger entries instead of posting reversals.
        const priorEntries = tx
          .select()
          .from(ledgerEntries)
          .where(buildLedgerReferenceWhere("sale", id) as any)
          .all();
        const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
        tx.delete(ledgerEntries)
          .where(buildLedgerReferenceWhere("sale", id) as any)
          .run();
        recomputeAccountBalances(client, affectedAccountIds);

      // Rollback previous stock impact
      for (const item of existingItems) {
        const quantityKg = parseAmount((item as any).quantityKg) || toSaleQuantityKg(item.quantity, item.unit);
        updateProductStockOn(client, item.productId, quantityKg.toString(), "add");
      }

      let subtotal = 0;
      const normalizedItems = items.map((item) => {
        const qty = parseAmount(item.quantity);
        const price = parseAmount(item.pricePerUnit);
        const quantityKg = toSaleQuantityKg(qty, item.unit);
        const total = roundMoney(qty * price);
        subtotal = roundMoney(subtotal + total);
        return {
          ...item,
          quantity: qty.toString(),
          quantityKg: quantityKg.toString(),
          pricePerUnit: price.toString(),
          totalPrice: total.toString(),
        };
      });

      // Validate stock after rollback
      for (const item of normalizedItems) {
        const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
        const currentStock = parseAmount(product?.currentStock || "0");
        const qty = parseAmount(item.quantityKg);
        if (currentStock < qty) {
          throw new Error(`Insufficient stock for product ${product?.name || item.productId}. Available: ${currentStock}, Required: ${qty}`);
        }
      }

      const loadingCharge = parseAmount(sale.loadingCharges ?? existing.loadingCharges ?? "0");
      const weighingCharge = parseAmount(sale.weighingCharges ?? existing.weighingCharges ?? "0");
      const otherCharge = parseAmount(sale.otherCharges ?? existing.otherCharges ?? "0");
      const rentCharge = parseAmount((sale as any).rentCharges ?? (existing as any).rentCharges ?? "0");
      const discountAmount = parseAmount((sale as any).discountAmount ?? (existing as any).discountAmount ?? "0");
      const charges = roundMoney(loadingCharge + weighingCharge + otherCharge + rentCharge);
      if (discountAmount > subtotal + charges) throw new Error("Discount cannot exceed the invoice value");
      const effectiveTaxTypeId = (sale as any).taxTypeId ?? existing.taxTypeId;
      const taxAmount = roundMoney(calculateTaxAmount(client, effectiveTaxTypeId, roundMoney(subtotal + charges - discountAmount), postingDate, "sales"));
      const totalAmount = roundMoney(Math.max(0, subtotal + charges - discountAmount + taxAmount));
      const requestedPaid = parseAmount(sale.paidAmount ?? existing.paidAmount ?? 0);
      const paidAmount = roundMoney(Math.min(Math.max(0, requestedPaid), totalAmount));
      const balanceDue = roundMoney(Math.max(totalAmount - paidAmount, 0));

      const updatedSale = tx.update(sales).set({
        ...sale,
        subtotal: subtotal.toString(),
        totalAmount: totalAmount.toString(),
        taxAmount: taxAmount.toString(),
        taxTypeId: (sale as any).taxTypeId ?? existing.taxTypeId ?? null,
        paidAmount: paidAmount.toString(),
        balanceDue: balanceDue.toString(),
      }).where(eq(sales.id, id)).returning().get();

      tx.delete(saleItems).where(eq(saleItems.saleId, id)).run();
      for (const item of normalizedItems) {
        tx.insert(saleItems).values({
          ...item,
          saleId: id,
        }).run();
        updateProductStockOn(client, item.productId, item.quantityKg, "subtract");
      }

      tx.delete(taxLedgers).where(eq(taxLedgers.saleId, id)).run();

      const customerId = sale.customerId ?? existing.customerId;
      const ledgerLines: Omit<InsertLedgerEntry, "balance">[] = [];
      const revenueAccount = ensureSystemAccount(client, "Sales Revenue", "income");
      const saleBaseLabel = `SALE ${existing.invoiceNumber}`;
      const pushLine = (line: Omit<InsertLedgerEntry, "balance">) => ledgerLines.push(line);

      const baseRevenue = Math.max(subtotal - discountAmount, 0);
      if (baseRevenue > 0) {
        const amount = baseRevenue.toString();
        pushLine({
          accountId: customerId,
          transactionType: "debit",
          amount,
          description: saleBaseLabel,
          ...getLedgerReferenceColumns("sale", id),
          entryDate: postingDate,
        });
        pushLine({
          accountId: revenueAccount.id,
          transactionType: "credit",
          amount,
          description: saleBaseLabel,
          ...getLedgerReferenceColumns("sale", id),
          entryDate: postingDate,
        });
      }

      const chargeLines = [
        { label: "LOADING", amount: loadingCharge },
        { label: "WEIGHING", amount: weighingCharge },
        { label: "OTHER", amount: otherCharge },
        { label: "RENT", amount: rentCharge },
      ];
      for (const line of chargeLines) {
        if (line.amount === 0) continue;
        const entryType = line.amount > 0 ? "credit" : "debit";
        const amount = Math.abs(line.amount).toString();
        pushLine({
          accountId: ensureSalesChargeAccount(client, line.label as "LOADING" | "WEIGHING" | "OTHER" | "RENT").id,
          transactionType: entryType,
          amount,
          description: line.label,
          ...getLedgerReferenceColumns("sale", id),
          entryDate: postingDate,
        });
        pushLine({
          accountId: customerId,
          transactionType: entryType === "credit" ? "debit" : "credit",
          amount,
          description: line.label,
          ...getLedgerReferenceColumns("sale", id),
          entryDate: postingDate,
        });
      }

      if (taxAmount > 0) {
        const taxTypeId = (sale as any).taxTypeId ?? existing.taxTypeId;
        let taxAccountId: number;
        if (taxTypeId) {
          const [tt] = tx.select().from(taxTypes).where(eq(taxTypes.id, taxTypeId as any)).all();
          const taxAcct = tt?.outputAccountId ? tx.select().from(accounts).where(eq(accounts.id, tt.outputAccountId)).all()[0] : undefined;
          taxAccountId = taxAcct?.id ?? ensureSystemAccount(client, "Tax Output", "liability").id;
        } else {
          taxAccountId = ensureSystemAccount(client, "Tax Output", "liability").id;
        }
        const taxLabel = "TAX";
        pushLine({
          accountId: taxAccountId,
          transactionType: "credit",
          amount: taxAmount.toString(),
          description: taxLabel,
          ...getLedgerReferenceColumns("sale", id),
          entryDate: postingDate,
        });
        pushLine({
          accountId: customerId,
          transactionType: "debit",
          amount: taxAmount.toString(),
          description: taxLabel,
          ...getLedgerReferenceColumns("sale", id),
          entryDate: postingDate,
        });
        tx.insert(taxLedgers).values({
          taxTypeId: taxTypeId ?? null,
          saleId: id,
          taxBase: subtotal.toString(),
          taxAmount: taxAmount.toString(),
          postingDate,
          createdAt: new Date(),
        } as any).run();
      }

      if ((sale.paymentMode ?? existing.paymentMode ?? "cash") === "cash" && paidAmount > 0) {
        const cashAccount = ensureSystemAccount(client, "Cash in Hand", "asset");
        pushLine({ accountId: cashAccount.id, transactionType: "debit", amount: paidAmount.toString(), description: `RECEIPT ${existing.invoiceNumber}`, ...getLedgerReferenceColumns("sale", id), entryDate: postingDate });
        pushLine({ accountId: customerId, transactionType: "credit", amount: paidAmount.toString(), description: `RECEIPT ${existing.invoiceNumber}`, ...getLedgerReferenceColumns("sale", id), entryDate: postingDate });
      }
      postBalancedLedgerEntries(client, ledgerLines, `sale ${existing.invoiceNumber}`);

      const inventoryAccount = ensureSystemAccount(client, "Inventory", "asset");
      const cogsAccount = ensureSystemAccount(client, "Cost of Goods Sold", "cogs");
      const totalCogs = normalizedItems.reduce((total, item) => {
        const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
        return total + parseAmount(product?.avgPurchasePrice || "0") * parseAmount(item.quantityKg);
      }, 0);
      if (totalCogs > 0) {
        postBalancedLedgerEntries(client, [
          { accountId: cogsAccount.id, transactionType: "debit", amount: totalCogs.toString(), description: `COGS ${existing.invoiceNumber}`, ...getLedgerReferenceColumns("sale", id), entryDate: postingDate },
          { accountId: inventoryAccount.id, transactionType: "credit", amount: totalCogs.toString(), description: `Inventory Relief ${existing.invoiceNumber}`, ...getLedgerReferenceColumns("sale", id), entryDate: postingDate },
        ], `sale COGS ${existing.invoiceNumber}`);
      }

      return updatedSale;
    });
  }

export async function deleteSale(id: number): Promise<boolean> {
    const existing = await getSale(id);
    if (!existing) return false;
    const paidAmount = parseAmount(existing.paidAmount || "0");
    if (paidAmount > 0) {
      throw new Error("Cannot delete a sale that has recorded payments");
    }
    const items = await getSaleItems(id);

      return db.transaction((tx) => {
        const client = tx as unknown as DbClient;
        const postingDate = toValidDate(existing.saleDate);
        assertPostingAllowed(client, postingDate, "sale");

        const priorEntries = tx
          .select()
          .from(ledgerEntries)
          .where(buildLedgerReferenceWhere("sale", id) as any)
          .all();
        const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));

        for (const item of items) {
          const quantityKg = parseAmount((item as any).quantityKg) || toSaleQuantityKg(item.quantity, item.unit);
          updateProductStockOn(client, item.productId, quantityKg.toString(), "add");
        }

        tx.delete(ledgerEntries).where(buildLedgerReferenceWhere("sale", id) as any).run();
        recomputeAccountBalances(client, affectedAccountIds);
        tx.delete(taxLedgers).where(eq(taxLedgers.saleId, id)).run();
        tx.delete(saleItems).where(eq(saleItems.saleId, id)).run();
        // The Sales Daybook row is a projection of this invoice and holds an
        // FK to it — drop it in the same transaction, otherwise the delete
        // fails on the constraint and the daybook keeps reporting a sale that
        // no longer exists.
        deleteDaybookProjection("sales_daybook", "sale_id", id);
      tx.delete(sales).where(eq(sales.id, id)).run();

      return true;
    });
  }

// Sale Items
export async function getSaleItems(saleId: number): Promise<SaleItem[]> {
  return db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all();
}

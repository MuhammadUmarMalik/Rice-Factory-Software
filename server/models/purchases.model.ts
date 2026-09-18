/**
 * Purchase persistence, extracted from the "// Purchases" / "// Purchase Items"
 * sections of storage.ts. Posting helpers come from ./ledger.model and the
 * period guard from ../services/posting-guard.service (previously
 * `this.assertPostingAllowed`).
 */
import { db, sqlite } from "./db";
import { eq, and, asc, desc, sql, gte, lte, lt, isNull, inArray, or } from "drizzle-orm";
import {
  accounts, products, purchases, purchaseItems, purchaseCharges,
  ledgerEntries, cashTransactions, taxLedgers, taxTypes, invoiceAllocations, auditLogs,
  type InsertLedgerEntry,
  type Purchase, type InsertPurchase,
  type PurchaseItem, type InsertPurchaseItem,
  type PurchaseCharge, type InsertPurchaseCharge,
} from "../db/schema";
import { parseAmount, roundMoney } from "../utils/parse";
import { assertPostingAllowed } from "../services/posting-guard.service";
import { recomputeAccountBalances } from "./accounts.model";
import { updateProductStockOn } from "./products.model";
import {
  buildLedgerReferenceWhere,
  calculateTaxAmount,
  deleteDaybookProjection,
  ensurePurchaseChargeAccount,
  ensureSystemAccount,
  getLedgerReferenceColumns,
  postBalancedLedgerEntries,
  postLedgerEntry,
} from "./ledger.model";
import type { PurchaseItemInput, PurchaseChargeInput } from "../repositories/types";

import { nextDocumentSequence } from "./sequences.model";
import { toValidDate } from "../services/posting-guard.service";
import { buildPurchaseNarration as buildPurchaseNarrationText } from "../utils/narration";

type DbClient = typeof db;

export async function getPurchases(): Promise<Purchase[]> {
  return db.select().from(purchases).where(isNull(purchases.deletedAt)).orderBy(desc(purchases.id)).all(); // Use ID for stability
}

export async function getPurchase(id: number): Promise<Purchase | undefined> {
  const [purchase] = db.select().from(purchases).where(and(eq(purchases.id, id), isNull(purchases.deletedAt))).all();
  return purchase;
}

export async function getPurchaseWithDetails(id: number): Promise<(Purchase & { items: PurchaseItem[]; charges: PurchaseCharge[] }) | undefined> {
  const purchase = await getPurchase(id);
  if (!purchase) return undefined;
  const [items, charges] = await Promise.all([
    getPurchaseItems(id),
    getPurchaseCharges(id),
  ]);
  return { ...purchase, items, charges };
}

export async function getNextPurchaseInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const nextNum = nextDocumentSequence("purchases", "invoice_number");
  return `PUR-${year}-${String(nextNum).padStart(4, "0")}`;
}

function computeNextBillNumber(client: DbClient, year: number): string {
  const nextNum = nextDocumentSequence("purchases", "bill_no");
  return `BILL-${year}-${String(nextNum).padStart(5, "0")}`;
}

export async function getNextPurchaseBillNumber(): Promise<string> {
  const year = new Date().getFullYear();
  return computeNextBillNumber(db, year);
}

function normalizePurchaseItem(item: PurchaseItemInput, moundBaseKg = 40) {
  const serialNo = item.serialNo ?? null;
  const bags = parseAmount(item.bags);
  const filling = parseAmount(item.fillingPerBagKg);
  const looseKgs = parseAmount(item.looseKgs || 0);
  const lessKg = parseAmount(item.lessKg || 0);
  const bardanaKatKg = parseAmount(item.bardanaKatKg || 0);
  const rate = parseAmount(item.rate);
  const grossWeightKg = (bags * filling) + looseKgs;
  const netWeightKg = Math.max(grossWeightKg - lessKg - bardanaKatKg, 0);
  const moundQty = netWeightKg / moundBaseKg;
  const moundWhole = Math.floor(moundQty);
  const moundRemainderKg = Math.max(netWeightKg - (moundWhole * moundBaseKg), 0);

  const unit = item.rateUnit;
  let billingQty = netWeightKg;
  if (unit === "mound") billingQty = netWeightKg / moundBaseKg;
  if (unit === "bag") billingQty = bags;
  if (unit === "quintal") billingQty = netWeightKg / 100;
  if (unit === "ton") billingQty = netWeightKg / 1000;

  const amount = rate * billingQty;

  return {
    ...item,
    serialNo: serialNo ?? undefined,
    marka: item.marka || null,
    bags: bags.toString(),
    fillingPerBagKg: filling.toString(),
    looseKgs: looseKgs.toString(),
    grossWeightKg: grossWeightKg.toString(),
    lessKg: lessKg.toString(),
    bardanaKatKg: bardanaKatKg.toString(),
    netWeightKg: netWeightKg.toString(),
    moundQty: moundQty.toString(),
    moundRemainderKg: moundRemainderKg.toString(),
    rate: rate.toString(),
    amount: amount.toString(),
  };
}

function sumCharges(charges: PurchaseChargeInput[]) {
  let add = 0;
  let less = 0;
  for (const c of charges) {
    const amt = parseAmount(c.amount);
    if (c.mode === "less") less += amt; else add += amt;
  }
  return { add, less };
}

export async function createPurchase(purchase: InsertPurchase, items: PurchaseItemInput[], charges: PurchaseChargeInput[], moundBaseKg = 40): Promise<Purchase> {
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const postingDate = purchase.purchaseDate ? new Date(purchase.purchaseDate as any) : new Date();
    assertPostingAllowed(client, postingDate, "purchase");

    const year = new Date().getFullYear();
    const nextNum = nextDocumentSequence("purchases", "invoice_number");
    const invoiceNumber = `PUR-${year}-${String(nextNum).padStart(4, "0")}`;
    const billYear = purchase.purchaseDate ? new Date(purchase.purchaseDate).getFullYear() : year;
    const billNo = purchase.billNo && purchase.billNo.trim() !== "" ? purchase.billNo : computeNextBillNumber(tx as unknown as DbClient, billYear);

    let subtotal = 0;
    let totalBags = 0;
    let totalGrossWeightKg = 0;
    let totalNetWeightKg = 0;

    const normalizedItems = items.map((item, idx) => {
      const normalized = normalizePurchaseItem({
        serialNo: item.serialNo ?? idx + 1,
        ...item,
      }, moundBaseKg);
      subtotal = roundMoney(subtotal + parseAmount(normalized.amount));
      totalBags += parseAmount(normalized.bags);
      totalGrossWeightKg += parseAmount(normalized.grossWeightKg);
      totalNetWeightKg += parseAmount(normalized.netWeightKg);
      return normalized;
    });

    const totalMoundQty = totalNetWeightKg / moundBaseKg;
    const totalMoundWhole = Math.floor(totalMoundQty);
    const totalMoundRemainderKg = Math.max(totalNetWeightKg - (totalMoundWhole * moundBaseKg), 0);

    const { add: chargesAdd, less: chargesLess } = sumCharges(charges);
    const brokerCommissionPercent = parseAmount(purchase.brokerCommissionPercent || "0");
    const brokerCommission = roundMoney((subtotal * brokerCommissionPercent) / 100);

    const lineSubtotal = roundMoney(subtotal + brokerCommission);
    const taxAmount = roundMoney(calculateTaxAmount(client, (purchase as any).taxTypeId, roundMoney(lineSubtotal + chargesAdd - chargesLess), postingDate, "purchases"));
    const grandAmount = roundMoney(lineSubtotal + chargesAdd - chargesLess + taxAmount);
    if (grandAmount < 0) throw new Error("Purchase total cannot be negative");
    const paidAmount = roundMoney(Math.min(Math.max(0, parseAmount((purchase as any).paidAmount || "0")), grandAmount));
    const balanceDue = roundMoney(grandAmount - paidAmount);
    const [supplier] = client
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, purchase.supplierId))
      .limit(1)
      .all();
    const narration = buildPurchaseNarrationText({
      notes: purchase.notes,
      supplierName: supplier?.name,
      invoiceNumber,
    });
    const newPurchase = tx.insert(purchases).values({
      ...purchase,
      notes: narration,
      invoiceNumber,
      billNo,
      subtotal: lineSubtotal.toString(),
      totalAmount: grandAmount.toString(),
      totalBags: totalBags.toString(),
      totalGrossWeightKg: totalGrossWeightKg.toString(),
      totalNetWeightKg: totalNetWeightKg.toString(),
      totalMoundQty: totalMoundQty.toString(),
      totalMoundRemainderKg: totalMoundRemainderKg.toString(),
      moundBaseKg,
      chargesAdd: chargesAdd.toString(),
      chargesLess: chargesLess.toString(),
      taxAmount: taxAmount.toString(),
      taxTypeId: (purchase as any).taxTypeId ?? null,
      buyerAmount: grandAmount.toString(),
      balanceDue: balanceDue.toString(),
      brokerCommissionAmount: brokerCommission.toString(),
      paidAmount: paidAmount.toString(),
    }).returning().get();

    for (const item of normalizedItems) {
      tx.insert(purchaseItems).values({
        ...item,
        purchaseId: newPurchase.id,
      }).run();

      const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
      if (!product) {
        throw new Error(`Product not found: id ${item.productId}`);
      }
      const currentStock = parseAmount(product.currentStock || "0");
      const currentAvg = parseAmount(product.avgPurchasePrice || "0");
      const qtyKg = parseAmount(item.netWeightKg); // maintain stock in kg
      if (qtyKg <= 0) {
        throw new Error(`Purchase item has invalid quantity (must be positive): product id ${item.productId}`);
      }
      const pricePerKg = parseAmount(item.amount) / qtyKg; // effective rate per kg
      const newStock = currentStock + qtyKg;

      const totalValue = (currentStock * currentAvg) + (qtyKg * pricePerKg);
      const newAvg = newStock > 0 ? totalValue / newStock : 0;

      tx.update(products)
        .set({
          currentStock: newStock.toString(),
          avgPurchasePrice: newAvg.toString(),
        })
        .where(eq(products.id, item.productId))
        .run();
    }

    for (const charge of charges) {
      tx.insert(purchaseCharges).values({
        ...charge,
        purchaseId: newPurchase.id,
        amount: parseAmount(charge.amount).toString(),
      }).run();
    }

    // Double-entry: split purchase into base/tax/charge lines so ledgers show each impact.
    const debitAccountId = purchase.expenseAccountId ?? ensureSystemAccount(client, "Inventory", "asset").id;
    const supplierAccountId = purchase.supplierId;
    const baseAmount = Math.max(subtotal, 0);
    const ledgerLines: Omit<InsertLedgerEntry, "balance">[] = [];
    const purchaseBaseLabel = `PURCHASE ${invoiceNumber}`;

    const pushLine = (line: Omit<InsertLedgerEntry, "balance">) => ledgerLines.push(line);

    if (baseAmount > 0) {
      const amount = baseAmount.toString();
      pushLine({
        accountId: debitAccountId,
        transactionType: "debit",
        amount,
        description: purchaseBaseLabel,
        purchaseId: newPurchase.id,
        entryDate: postingDate,
      });
      pushLine({
        accountId: supplierAccountId,
        transactionType: "credit",
        amount,
        description: purchaseBaseLabel,
        purchaseId: newPurchase.id,
        entryDate: postingDate,
      });
    }

    if (brokerCommission > 0) {
      const amount = brokerCommission.toString();
      const commissionLabel = "BROKER COMMISSION";
      pushLine({
        accountId: debitAccountId,
        transactionType: "debit",
        amount,
        description: commissionLabel,
        purchaseId: newPurchase.id,
        entryDate: postingDate,
      });
      pushLine({
        accountId: supplierAccountId,
        transactionType: "credit",
        amount,
        description: commissionLabel,
        purchaseId: newPurchase.id,
        entryDate: postingDate,
      });
    }

    const chargeLabel = (type: string) => {
      switch (type) {
        case "weight":
          return "WEIGHT ADD";
        case "freight":
          return "FREIGHT";
        case "loading_filling":
          return "LOADING/UNLOADING";
        case "market_fee":
          return "MARKET FEE";
        case "mitha_sukri":
          return "MITHA SUKRI";
        case "phone_analysis":
          return "PHONE/ANALYSIS";
        case "brokerage":
          return "BROKERAGE";
        case "commission":
          return "COMMISSION";
        case "bardana":
          return "BARDANA";
        case "broken_allowance":
          return "BROKEN ALLOWANCE";
        case "accountant_clerk":
          return "ACCOUNTANT / CLERK";
        case "other":
        default:
          return "OTHER";
      }
    };

    for (const charge of charges) {
      const amt = parseAmount(charge.amount);
      if (amt <= 0) continue;
      const entryType = charge.mode === "less" ? "credit" : "debit";
      const label = chargeLabel(charge.type);
      const targetAccountId = charge.accountId ?? ensurePurchaseChargeAccount(client, charge.type).id;
      pushLine({
        accountId: targetAccountId,
        transactionType: entryType,
        amount: amt.toString(),
        description: label,
        purchaseId: newPurchase.id,
        entryDate: postingDate,
      });
      pushLine({
        accountId: supplierAccountId,
        transactionType: entryType === "debit" ? "credit" : "debit",
        amount: amt.toString(),
        description: label,
        purchaseId: newPurchase.id,
        entryDate: postingDate,
      });
    }

    if (taxAmount > 0) {
      const taxTypeId = (purchase as any).taxTypeId as number | undefined;
      let taxAccountId: number;
      if (taxTypeId) {
        const [tt] = tx.select().from(taxTypes).where(eq(taxTypes.id, taxTypeId)).all();
        const taxAcct = tt?.inputAccountId ? tx.select().from(accounts).where(eq(accounts.id, tt.inputAccountId)).all()[0] : undefined;
        taxAccountId = taxAcct?.id ?? ensureSystemAccount(client, "Tax Input", "asset").id;
      } else {
        taxAccountId = ensureSystemAccount(client, "Tax Input", "asset").id;
      }
      const taxLabel = "TAX";
      pushLine({
        accountId: taxAccountId,
        transactionType: "debit",
        amount: taxAmount.toString(),
        description: taxLabel,
        purchaseId: newPurchase.id,
        entryDate: postingDate,
      });
      pushLine({
        accountId: supplierAccountId,
        transactionType: "credit",
        amount: taxAmount.toString(),
        description: taxLabel,
        purchaseId: newPurchase.id,
        entryDate: postingDate,
      });
      tx.insert(taxLedgers).values({
        taxTypeId: taxTypeId ?? null,
        purchaseId: newPurchase.id,
        taxBase: lineSubtotal.toString(),
        taxAmount: taxAmount.toString(),
        postingDate,
        createdAt: new Date(),
      } as any).run();
    }

    if ((purchase.paymentMode ?? "cash") === "cash" && paidAmount > 0) {
      const cashAccount = ensureSystemAccount(client, "Cash in Hand", "asset");
      pushLine({ accountId: supplierAccountId, transactionType: "debit", amount: paidAmount.toString(), description: `PAYMENT ${invoiceNumber}`, ...getLedgerReferenceColumns("purchase", newPurchase.id), entryDate: postingDate });
      pushLine({ accountId: cashAccount.id, transactionType: "credit", amount: paidAmount.toString(), description: `PAYMENT ${invoiceNumber}`, ...getLedgerReferenceColumns("purchase", newPurchase.id), entryDate: postingDate });
    }
    postBalancedLedgerEntries(client, ledgerLines, `purchase ${invoiceNumber}`);

    return newPurchase;
  });
}

export async function getPurchaseItems(purchaseId: number): Promise<PurchaseItem[]> {
  return db.select().from(purchaseItems).where(and(eq(purchaseItems.purchaseId, purchaseId), isNull(purchaseItems.deletedAt))).all();
}

export async function getPurchaseCharges(purchaseId: number): Promise<PurchaseCharge[]> {
  return db.select().from(purchaseCharges).where(eq(purchaseCharges.purchaseId, purchaseId)).all();
}

export async function updatePurchase(id: number, purchase: Partial<InsertPurchase>, items: PurchaseItemInput[], charges: PurchaseChargeInput[], moundBaseKg = 40): Promise<Purchase | undefined> {
  const existing = await getPurchaseWithDetails(id);
  if (!existing) return undefined;

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const postingDate = purchase.purchaseDate
      ? new Date(purchase.purchaseDate as any)
      : existing.purchaseDate
        ? new Date(existing.purchaseDate as any)
        : new Date();
    assertPostingAllowed(client, postingDate, "purchase");

    // Remove previous ledger entries instead of posting reversals.
    const priorEntries = tx
      .select()
      .from(ledgerEntries)
      .where(buildLedgerReferenceWhere("purchase", id) as any)
      .all();
    const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
    tx.delete(ledgerEntries)
      .where(buildLedgerReferenceWhere("purchase", id) as any)
      .run();
    recomputeAccountBalances(client, affectedAccountIds);

    // Reverse the old quantity and cost contribution before applying the replacement.
    for (const item of existing.items) {
      const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
      if (!product) throw new Error(`Product not found: id ${item.productId}`);
      const currentStock = parseAmount(product.currentStock);
      const oldQty = parseAmount(item.netWeightKg);
      const newStock = currentStock - oldQty;
      if (newStock < -0.0001) throw new Error(`Cannot edit purchase because stock has been consumed for ${product.name}`);
      const remainingValue = Math.max(currentStock * parseAmount(product.avgPurchasePrice) - parseAmount(item.amount), 0);
      tx.update(products).set({
        currentStock: Math.max(newStock, 0).toString(),
        avgPurchasePrice: newStock > 0 ? (remainingValue / newStock).toString() : "0",
      }).where(eq(products.id, item.productId)).run();
    }

    // Rebuild new items/totals
    let subtotal = 0;
    let totalBags = 0;
    let totalGrossWeightKg = 0;
    let totalNetWeightKg = 0;

    const normalizedItems = items.map((item, idx) => {
      const normalized = normalizePurchaseItem({
        serialNo: item.serialNo ?? idx + 1,
        ...item,
      }, moundBaseKg);
      subtotal = roundMoney(subtotal + parseAmount(normalized.amount));
      totalBags += parseAmount(normalized.bags);
      totalGrossWeightKg += parseAmount(normalized.grossWeightKg);
      totalNetWeightKg += parseAmount(normalized.netWeightKg);
      return normalized;
    });

    const totalMoundQty = totalNetWeightKg / moundBaseKg;
    const totalMoundWhole = Math.floor(totalMoundQty);
    const totalMoundRemainderKg = Math.max(totalNetWeightKg - (totalMoundWhole * moundBaseKg), 0);

    const { add: chargesAdd, less: chargesLess } = sumCharges(charges);
    const brokerCommissionPercent = parseAmount((purchase as any).brokerCommissionPercent ?? existing.brokerCommissionPercent ?? "0");
    const brokerCommission = roundMoney((subtotal * brokerCommissionPercent) / 100);

    const lineSubtotal = roundMoney(subtotal + brokerCommission);
    const effectiveTaxTypeId = (purchase as any).taxTypeId ?? existing.taxTypeId;
    const taxAmount = roundMoney(calculateTaxAmount(client, effectiveTaxTypeId, roundMoney(lineSubtotal + chargesAdd - chargesLess), postingDate, "purchases"));
    const grandAmount = roundMoney(lineSubtotal + chargesAdd - chargesLess + taxAmount);
    if (grandAmount < 0) throw new Error("Purchase total cannot be negative");
    const paidAmount = roundMoney(Math.min(Math.max(0, parseAmount((purchase as any).paidAmount ?? existing.paidAmount ?? 0)), grandAmount));
    const balanceDue = roundMoney(grandAmount - paidAmount);
    const updatedPurchase = tx.update(purchases).set({
      ...purchase,
      subtotal: lineSubtotal.toString(),
      totalAmount: grandAmount.toString(),
      totalBags: totalBags.toString(),
      totalGrossWeightKg: totalGrossWeightKg.toString(),
      totalNetWeightKg: totalNetWeightKg.toString(),
      totalMoundQty: totalMoundQty.toString(),
      totalMoundRemainderKg: totalMoundRemainderKg.toString(),
      moundBaseKg,
      chargesAdd: chargesAdd.toString(),
      chargesLess: chargesLess.toString(),
      buyerAmount: grandAmount.toString(),
      balanceDue: balanceDue.toString(),
      brokerCommissionAmount: brokerCommission.toString(),
      paidAmount: paidAmount.toString(),
    }).where(eq(purchases.id, id)).returning().get();

    // Replace items
    tx.delete(purchaseItems).where(eq(purchaseItems.purchaseId, id)).run();
    for (const item of normalizedItems) {
      tx.insert(purchaseItems).values({ ...item, purchaseId: id }).run();
      const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
      if (!product) throw new Error(`Product not found: id ${item.productId}`);
      const currentStock = parseAmount(product.currentStock);
      const currentValue = currentStock * parseAmount(product.avgPurchasePrice);
      const qtyKg = parseAmount(item.netWeightKg);
      const newStock = currentStock + qtyKg;
      tx.update(products).set({
        currentStock: newStock.toString(),
        avgPurchasePrice: newStock > 0 ? ((currentValue + parseAmount(item.amount)) / newStock).toString() : "0",
      }).where(eq(products.id, item.productId)).run();
    }

    // Replace charges
    tx.delete(purchaseCharges).where(eq(purchaseCharges.purchaseId, id)).run();
    for (const charge of charges) {
      tx.insert(purchaseCharges).values({
        ...charge,
        purchaseId: id,
        amount: parseAmount(charge.amount).toString(),
      }).run();
    }

    // Post fresh double-entry for updated purchase with split charge lines.
    const debitAccountId = purchase.expenseAccountId ?? existing.expenseAccountId ?? ensureSystemAccount(client, "Inventory", "asset").id;
    const supplierAccountId = purchase.supplierId ?? existing.supplierId;
    const baseAmount = Math.max(subtotal, 0);
    const ledgerLines: Omit<InsertLedgerEntry, "balance">[] = [];
    const purchaseBaseLabel = `PURCHASE ${existing.invoiceNumber}`;

    const pushLine = (line: Omit<InsertLedgerEntry, "balance">) => ledgerLines.push(line);

      if (baseAmount > 0) {
      const amount = baseAmount.toString();
      pushLine({
        accountId: debitAccountId,
        transactionType: "debit",
        amount,
        description: purchaseBaseLabel,
          ...getLedgerReferenceColumns("purchase", id),
        entryDate: postingDate,
      });
      pushLine({
        accountId: supplierAccountId,
        transactionType: "credit",
        amount,
        description: purchaseBaseLabel,
          ...getLedgerReferenceColumns("purchase", id),
        entryDate: postingDate,
      });
    }

      if (brokerCommission > 0) {
      const amount = brokerCommission.toString();
      const commissionLabel = "BROKER COMMISSION";
      pushLine({
        accountId: debitAccountId,
        transactionType: "debit",
        amount,
        description: commissionLabel,
          ...getLedgerReferenceColumns("purchase", id),
        entryDate: postingDate,
      });
      pushLine({
        accountId: supplierAccountId,
        transactionType: "credit",
        amount,
        description: commissionLabel,
          ...getLedgerReferenceColumns("purchase", id),
        entryDate: postingDate,
      });
    }

    const chargeLabel = (type: string) => {
      switch (type) {
        case "weight":
          return "WEIGHT ADD";
        case "freight":
          return "FREIGHT";
        case "loading_filling":
          return "LOADING/UNLOADING";
        case "market_fee":
          return "MARKET FEE";
        case "mitha_sukri":
          return "MITHA SUKRI";
        case "phone_analysis":
          return "PHONE/ANALYSIS";
        case "brokerage":
          return "BROKERAGE";
        case "commission":
          return "COMMISSION";
        case "bardana":
          return "BARDANA";
        case "broken_allowance":
          return "BROKEN ALLOWANCE";
        case "accountant_clerk":
          return "ACCOUNTANT / CLERK";
        case "other":
        default:
          return "OTHER";
      }
    };

    for (const charge of charges) {
      const amt = parseAmount(charge.amount);
      if (amt <= 0) continue;
      const entryType = charge.mode === "less" ? "credit" : "debit";
      const label = chargeLabel(charge.type);
      const targetAccountId = charge.accountId ?? ensurePurchaseChargeAccount(client, charge.type).id;
      pushLine({
        accountId: targetAccountId,
        transactionType: entryType,
        amount: amt.toString(),
        description: label,
        ...getLedgerReferenceColumns("purchase", id),
        entryDate: postingDate,
      });
      pushLine({
        accountId: supplierAccountId,
        transactionType: entryType === "debit" ? "credit" : "debit",
        amount: amt.toString(),
        description: label,
        ...getLedgerReferenceColumns("purchase", id),
        entryDate: postingDate,
      });
    }

    if (taxAmount > 0) {
      const taxTypeId = (purchase as any).taxTypeId ?? existing.taxTypeId;
      let taxAccountId: number;
      if (taxTypeId) {
        const [tt] = tx.select().from(taxTypes).where(eq(taxTypes.id, taxTypeId as any)).all();
        const taxAcct = tt?.inputAccountId ? tx.select().from(accounts).where(eq(accounts.id, tt.inputAccountId)).all()[0] : undefined;
        taxAccountId = taxAcct?.id ?? ensureSystemAccount(client, "Tax Input", "asset").id;
      } else {
        taxAccountId = ensureSystemAccount(client, "Tax Input", "asset").id;
      }
      const taxLabel = "TAX";
      pushLine({
        accountId: taxAccountId,
        transactionType: "debit",
        amount: taxAmount.toString(),
        description: taxLabel,
        ...getLedgerReferenceColumns("purchase", id),
        entryDate: postingDate,
      });
      pushLine({
        accountId: supplierAccountId,
        transactionType: "credit",
        amount: taxAmount.toString(),
        description: taxLabel,
        ...getLedgerReferenceColumns("purchase", id),
        entryDate: postingDate,
      });
    }

    if ((purchase.paymentMode ?? existing.paymentMode ?? "cash") === "cash" && paidAmount > 0) {
      const cashAccount = ensureSystemAccount(client, "Cash in Hand", "asset");
      pushLine({ accountId: supplierAccountId, transactionType: "debit", amount: paidAmount.toString(), description: `PAYMENT ${existing.invoiceNumber}`, ...getLedgerReferenceColumns("purchase", id), entryDate: postingDate });
      pushLine({ accountId: cashAccount.id, transactionType: "credit", amount: paidAmount.toString(), description: `PAYMENT ${existing.invoiceNumber}`, ...getLedgerReferenceColumns("purchase", id), entryDate: postingDate });
    }
    postBalancedLedgerEntries(client, ledgerLines, `purchase ${existing.invoiceNumber}`);

    return updatedPurchase;
  });
}

export async function deletePurchase(id: number, deletedBy?: number, options?: { force?: boolean }): Promise<boolean> {
  const existing = await getPurchaseWithDetails(id);
  if (!existing) return false;
  if (existing.deletedAt) return false;
  const parsedPaidAmount = Number.parseFloat(String(existing.paidAmount ?? "0"));
  const paidAmount = Number.isFinite(parsedPaidAmount) ? parsedPaidAmount : 0;
  if (paidAmount > 0) {
    throw new Error("Cannot delete a purchase that has recorded payments");
  }
  const stockEpsilon = 0.0001;

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const postingDate = toValidDate(existing.purchaseDate as any);
    assertPostingAllowed(client, postingDate, "purchase");

    // Purchase delete must rollback stock. If stock has already been consumed,
    // block deletion with a domain-specific message rather than a generic error.
    for (const item of existing.items.filter((i) => !i.deletedAt)) {
      const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
      const currentStock = parseAmount(product?.currentStock || "0");
      const rollbackQty = parseAmount(item.netWeightKg || "0");
      if (currentStock + stockEpsilon < rollbackQty) {
        throw new Error(
          `Cannot delete purchase because stock has been consumed for product ${product?.name || item.productId}. Available: ${currentStock}, required to rollback: ${rollbackQty}.`,
        );
      }
    }

    // Remove prior ledger entries instead of posting reversals.
    const priorEntries = tx
      .select()
      .from(ledgerEntries)
      .where(buildLedgerReferenceWhere("purchase", id) as any)
      .all();
    const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
    tx.delete(ledgerEntries)
      .where(buildLedgerReferenceWhere("purchase", id) as any)
      .run();
    recomputeAccountBalances(client, affectedAccountIds);

    // Rollback stock impact. The quantity *and* the cost contribution must be
    // withdrawn together: reversing only the quantity (as a bare stock
    // subtract does) left the weighted average that this purchase had moved,
    // so the remaining units kept a valuation this purchase paid for and
    // inventory no longer tied out against the Inventory ledger account.
    for (const item of existing.items.filter((i) => !i.deletedAt)) {
      const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
      if (!product) throw new Error(`Product not found: id ${item.productId}`);
      const currentStock = parseAmount(product.currentStock || "0");
      const rollbackQty = parseAmount(item.netWeightKg || "0");
      const newStock = Math.round((currentStock - rollbackQty) * 1000) / 1000;
      const remainingValue = Math.max(
        currentStock * parseAmount(product.avgPurchasePrice || "0") - parseAmount(item.amount || "0"),
        0,
      );
      tx.update(products)
        .set({
          currentStock: Math.max(newStock, 0).toString(),
          avgPurchasePrice: newStock > 0 ? (remainingValue / newStock).toString() : "0",
        })
        .where(eq(products.id, item.productId))
        .run();
    }

    // Soft delete related rows
    tx.update(purchaseItems).set({ deletedAt: new Date(), deletedBy }).where(eq(purchaseItems.purchaseId, id)).run();
    tx.update(purchases).set({ deletedAt: new Date(), deletedBy }).where(eq(purchases.id, id)).run();
    tx.delete(purchaseCharges).where(eq(purchaseCharges.purchaseId, id)).run();
    tx.delete(taxLedgers).where(eq(taxLedgers.purchaseId, id)).run();

    return true;
  });
}

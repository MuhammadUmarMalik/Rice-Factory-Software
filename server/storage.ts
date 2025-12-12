import { db } from "./db";
import { eq, and, desc, sql, gte, lte, isNull } from "drizzle-orm";
import {
  users, accounts, products, purchases, purchaseItems, purchaseCharges,
  processing, sales, saleItems, ledgerEntries,
  type User, type InsertUser, type Account, type InsertAccount,
  type Product, type InsertProduct, type Purchase, type InsertPurchase,
  type PurchaseItem, type InsertPurchaseItem, type PurchaseCharge, type InsertPurchaseCharge,
  type Processing, type InsertProcessing,
  type Sale, type InsertSale, type SaleItem, type InsertSaleItem,
  type LedgerEntry, type InsertLedgerEntry,
  receiptVouchers, receiptVoucherLines,
  type ReceiptVoucher, type InsertReceiptVoucher,
  type ReceiptVoucherLine, type InsertReceiptVoucherLine,
} from "@shared/schema";

type DbClient = typeof db;
type PurchaseItemInput = Omit<InsertPurchaseItem, "id" | "purchaseId">;
type PurchaseChargeInput = Omit<InsertPurchaseCharge, "id" | "purchaseId">;
type SaleItemInput = Omit<InsertSaleItem, "id" | "saleId" | "totalPrice">;
type ReceiptLineInput = Omit<InsertReceiptVoucherLine, "id" | "voucherId">;

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;

  // Accounts
  getAccounts(type?: string): Promise<Account[]>;
  getAccount(id: number): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: number, account: Partial<InsertAccount>): Promise<Account | undefined>;

  // Products
  getProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;

  // Purchases
  getPurchases(): Promise<Purchase[]>;
  getPurchase(id: number): Promise<Purchase | undefined>;
  getPurchaseWithDetails(id: number): Promise<(Purchase & { items: PurchaseItem[]; charges: PurchaseCharge[] }) | undefined>;
  createPurchase(purchase: InsertPurchase, items: PurchaseItemInput[], charges: PurchaseChargeInput[]): Promise<Purchase>;
  updatePurchase(id: number, purchase: Partial<InsertPurchase>, items: PurchaseItemInput[], charges: PurchaseChargeInput[]): Promise<Purchase | undefined>;
  getNextPurchaseInvoiceNumber(): Promise<string>;

  // Purchase Items
  getPurchaseItems(purchaseId: number): Promise<PurchaseItem[]>;
  getPurchaseCharges(purchaseId: number): Promise<PurchaseCharge[]>;

  // Processing
  getProcessingBatches(): Promise<Processing[]>;
  getProcessingBatch(id: number): Promise<Processing | undefined>;
  createProcessing(batch: InsertProcessing): Promise<Processing>;
  updateProcessing(id: number, batch: Partial<InsertProcessing>): Promise<Processing | undefined>;
  getNextBatchNumber(): Promise<string>;

  // Sales
  getSales(): Promise<Sale[]>;
  getSale(id: number): Promise<Sale | undefined>;
  createSale(sale: InsertSale, items: SaleItemInput[]): Promise<Sale>;
  getNextSaleInvoiceNumber(): Promise<string>;
  getNextGatePassNumber(): Promise<string>;

  // Sale Items
  getSaleItems(saleId: number): Promise<SaleItem[]>;

  // Ledger
  getLedgerEntries(accountId?: number): Promise<LedgerEntry[]>;
  createLedgerEntry(entry: InsertLedgerEntry): Promise<LedgerEntry>;

  // Reports
  getStockReport(): Promise<{ product: Product; totalPurchased: string; totalSold: string; currentStock: string }[]>;
  getTrialBalance(): Promise<{ account: Account; debit: string; credit: string }[]>;
  getProfitLoss(startDate?: Date, endDate?: Date): Promise<{
    totalPurchases: string;
    totalSales: string;
    expenses: string;
    grossProfit: string;
    netProfit: string;
    purchaseCount: number;
    saleCount: number;
  }>;

  // Cash Receipts
  getReceiptVouchers(): Promise<ReceiptVoucher[]>;
  getReceiptVoucher(id: number): Promise<(ReceiptVoucher & { lines: ReceiptVoucherLine[] }) | undefined>;
  createReceiptVoucher(data: InsertReceiptVoucher, lines: ReceiptLineInput[]): Promise<ReceiptVoucher>;
  updateReceiptVoucher(id: number, data: Partial<InsertReceiptVoucher>, lines: ReceiptLineInput[]): Promise<ReceiptVoucher | undefined>;
  deleteReceiptVoucher(id: number): Promise<boolean>;
  getNextReceiptVoucherNumber(voucherType?: string): Promise<string>;
}

function parseAmount(value: string | number | null | undefined): number {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  if (!Number.isFinite(num)) {
    throw new Error("Invalid numeric value");
  }
  return num;
}

function toWords(n: number): string {
  // Simple integer-to-words helper for positive amounts (English, up to billions)
  const belowTwenty = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  const scales = ["","thousand","million","billion"];

  if (n === 0) return "zero";
  const chunk = (num: number): string => {
    let word = "";
    if (num >= 100) {
      word += `${belowTwenty[Math.floor(num / 100)]} hundred`;
      num %= 100;
      if (num) word += " ";
    }
    if (num >= 20) {
      word += tens[Math.floor(num / 10)];
      num %= 10;
      if (num) word += `-${belowTwenty[num]}`;
    } else if (num > 0) {
      word += belowTwenty[num];
    }
    return word;
  };

  const parts: string[] = [];
  let remaining = Math.floor(n);
  let scaleIndex = 0;
  while (remaining > 0) {
    const c = remaining % 1000;
    if (c) {
      const prefix = chunk(c);
      const suffix = scales[scaleIndex];
      parts.unshift(suffix ? `${prefix} ${suffix}` : prefix);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex += 1;
  }
  return parts.join(" ");
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = db.select().from(users).where(eq(users.id, id)).all();
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = db.select().from(users).where(eq(users.username, username)).all();
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.fullName).all();
  }

  // Accounts
  async getAccounts(type?: string): Promise<Account[]> {
    if (type) {
      return db.select().from(accounts)
        .where(eq(accounts.type, type as any))
        .orderBy(accounts.name)
        .all();
    }
    return db.select().from(accounts).orderBy(accounts.name).all();
  }

  async getAccount(id: number): Promise<Account | undefined> {
    const [account] = db.select().from(accounts).where(eq(accounts.id, id)).all();
    return account;
  }

  async createAccount(account: InsertAccount): Promise<Account> {
    const [newAccount] = await db.insert(accounts).values({
      ...account,
      currentBalance: account.openingBalance || "0",
    }).returning();
    return newAccount;
  }

  async updateAccount(id: number, account: Partial<InsertAccount>): Promise<Account | undefined> {
    const [updated] = await db.update(accounts).set(account).where(eq(accounts.id, id)).returning();
    return updated;
  }

  async updateAccountBalance(id: number, amount: string, type: 'add' | 'subtract'): Promise<void> {
    return this.updateAccountBalanceInternal(db, id, amount, type);
  }

  private updateAccountBalanceInternal(client: DbClient, id: number, amount: string, type: "add" | "subtract") {
    const [account] = client.select().from(accounts).where(eq(accounts.id, id)).all();
    const current = parseAmount(account?.currentBalance || "0");
    const amt = parseAmount(amount || "0");
    const newBalance = type === "add" ? current + amt : current - amt;

    client.update(accounts)
      .set({ currentBalance: newBalance.toString() })
      .where(eq(accounts.id, id));
  }

  // Products
  async getProducts(): Promise<Product[]> {
    return db.select().from(products).orderBy(products.name).all();
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = db.select().from(products).where(eq(products.id, id)).all();
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db.update(products).set(product).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id)).run();
    return result.changes > 0;
  }

  async updateProductStock(id: number, quantity: string, type: 'add' | 'subtract'): Promise<void> {
    return this.updateProductStockInternal(db, id, quantity, type);
  }

  private async updateProductStockInternal(client: DbClient, id: number, quantity: string, type: "add" | "subtract") {
    const [product] = client.select().from(products).where(eq(products.id, id)).all();
    const current = parseAmount(product?.currentStock || "0");
    const qty = parseAmount(quantity || "0");
    const newStock = type === "add" ? current + qty : current - qty;

    if (type === "subtract" && newStock < 0) {
      throw new Error(`Insufficient stock for product ${product?.name || id}`);
    }

    await client.update(products)
      .set({ currentStock: newStock.toString() })
      .where(eq(products.id, id));
  }

  // Purchases
  async getPurchases(): Promise<Purchase[]> {
    return db.select().from(purchases).orderBy(desc(purchases.id)).all(); // Use ID for stability
  }

  async getPurchase(id: number): Promise<Purchase | undefined> {
    const [purchase] = db.select().from(purchases).where(eq(purchases.id, id)).all();
    return purchase;
  }

  async getPurchaseWithDetails(id: number): Promise<(Purchase & { items: PurchaseItem[]; charges: PurchaseCharge[] }) | undefined> {
    const purchase = await this.getPurchase(id);
    if (!purchase) return undefined;
    const [items, charges] = await Promise.all([
      this.getPurchaseItems(id),
      this.getPurchaseCharges(id),
    ]);
    return { ...purchase, items, charges };
  }

  async getNextPurchaseInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = db.select().from(purchases)
      .orderBy(desc(purchases.id))
      .limit(1)
      .all();

    const nextNum = last ? parseInt(last.invoiceNumber.split("-").pop() || "0") + 1 : 1;
    return `PUR-${year}-${String(nextNum).padStart(4, "0")}`;
  }

  private normalizePurchaseItem(item: PurchaseItemInput) {
    const serialNo = item.serialNo ?? null;
    const bags = parseAmount(item.bags);
    const filling = parseAmount(item.fillingPerBagKg);
    const looseKgs = parseAmount(item.looseKgs || 0);
    const lessKg = parseAmount(item.lessKg || 0);
    const bardanaKatKg = parseAmount(item.bardanaKatKg || 0);
    const rate = parseAmount(item.rate);
    const grossWeightKg = (bags * filling) + looseKgs;
    const netWeightKg = Math.max(grossWeightKg - lessKg - bardanaKatKg, 0);
    const moundQtyFloat = netWeightKg / 40;
    const moundQty = Math.floor(moundQtyFloat);
    const moundRemainderKg = Math.max(netWeightKg - (moundQty * 40), 0);

    const unit = item.rateUnit;
    let billingQty = netWeightKg;
    if (unit === "mound") billingQty = netWeightKg / 40;
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

  private sumCharges(charges: PurchaseChargeInput[]) {
    let add = 0;
    let less = 0;
    for (const c of charges) {
      const amt = parseAmount(c.amount);
      if (c.mode === "less") less += amt; else add += amt;
    }
    return { add, less };
  }

  async createPurchase(purchase: InsertPurchase, items: PurchaseItemInput[], charges: PurchaseChargeInput[]): Promise<Purchase> {
    return db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const [last] = tx.select().from(purchases).orderBy(desc(purchases.id)).limit(1).all();
      const nextNum = last ? parseInt(last.invoiceNumber.split("-").pop() || "0") + 1 : 1;
      const invoiceNumber = `PUR-${year}-${String(nextNum).padStart(4, "0")}`;

      let subtotal = 0;
      let totalBags = 0;
      let totalGrossWeightKg = 0;
      let totalNetWeightKg = 0;

      const normalizedItems = items.map((item, idx) => {
        const normalized = this.normalizePurchaseItem({
          serialNo: item.serialNo ?? idx + 1,
          ...item,
        });
        subtotal += parseAmount(normalized.amount);
        totalBags += parseAmount(normalized.bags);
        totalGrossWeightKg += parseAmount(normalized.grossWeightKg);
        totalNetWeightKg += parseAmount(normalized.netWeightKg);
        return normalized;
      });

      const totalMoundQtyFloat = totalNetWeightKg / 40;
      const totalMoundQty = Math.floor(totalMoundQtyFloat);
      const totalMoundRemainderKg = Math.max(totalNetWeightKg - (totalMoundQty * 40), 0);

      const { add: chargesAdd, less: chargesLess } = this.sumCharges(charges);
      const brokerCommissionPercent = parseAmount(purchase.brokerCommissionPercent || "0");
      const brokerCommission = (subtotal * brokerCommissionPercent) / 100;

      const lineSubtotal = subtotal + brokerCommission;
      const grandAmount = lineSubtotal + chargesAdd - chargesLess;
      const paidAmount = parseAmount((purchase as any).paidAmount || 0);
      const balanceDue = grandAmount - paidAmount;
      const amountInWords = `${toWords(Math.round(grandAmount))} only`;

      const client = tx as unknown as DbClient;

      const [newPurchase] = await tx.insert(purchases).values({
        ...purchase,
        invoiceNumber,
        subtotal: lineSubtotal.toString(),
        totalAmount: grandAmount.toString(),
        totalBags: totalBags.toString(),
        totalGrossWeightKg: totalGrossWeightKg.toString(),
        totalNetWeightKg: totalNetWeightKg.toString(),
        totalMoundQty: totalMoundQty.toString(),
        totalMoundRemainderKg: totalMoundRemainderKg.toString(),
        chargesAdd: chargesAdd.toString(),
        chargesLess: chargesLess.toString(),
        buyerAmount: grandAmount.toString(),
        balanceDue: balanceDue.toString(),
        brokerCommissionAmount: brokerCommission.toString(),
        paidAmount: paidAmount.toString(),
        amountInWords,
      }).returning();

      for (const item of normalizedItems) {
        await tx.insert(purchaseItems).values({
          ...item,
          purchaseId: newPurchase.id,
        });

        const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
        const currentStock = parseAmount(product?.currentStock || "0");
        const currentAvg = parseAmount(product?.avgPurchasePrice || "0");
        const qtyKg = parseAmount(item.netWeightKg); // maintain stock in kg
        const pricePerKg = parseAmount(item.amount) / Math.max(qtyKg, 1); // effective rate per kg
        const newStock = currentStock + qtyKg;

        const totalValue = (currentStock * currentAvg) + (qtyKg * pricePerKg);
        const newAvg = newStock > 0 ? totalValue / newStock : 0;

        await tx.update(products)
          .set({
            currentStock: newStock.toString(),
            avgPurchasePrice: newAvg.toString(),
          })
          .where(eq(products.id, item.productId));
      }

      for (const charge of charges) {
        await tx.insert(purchaseCharges).values({
          ...charge,
          purchaseId: newPurchase.id,
          amount: parseAmount(charge.amount).toString(),
        });
      }

      await this.updateAccountBalanceInternal(client, purchase.supplierId, grandAmount.toString(), "add");

      await this.createLedgerEntryInternal(client, {
        accountId: purchase.supplierId,
        transactionType: "credit",
        amount: grandAmount.toString(),
        balance: "0",
        description: `Purchase Invoice: ${invoiceNumber}`,
        referenceType: "purchase",
        referenceId: newPurchase.id,
        entryDate: new Date(),
      });

      return newPurchase;
    });
  }

  async getPurchaseItems(purchaseId: number): Promise<PurchaseItem[]> {
    return db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId)).all();
  }

  async getPurchaseCharges(purchaseId: number): Promise<PurchaseCharge[]> {
    return db.select().from(purchaseCharges).where(eq(purchaseCharges.purchaseId, purchaseId)).all();
  }

  async updatePurchase(id: number, purchase: Partial<InsertPurchase>, items: PurchaseItemInput[], charges: PurchaseChargeInput[]): Promise<Purchase | undefined> {
    const existing = await this.getPurchaseWithDetails(id);
    if (!existing) return undefined;

    return db.transaction(async (tx) => {
      const client = tx as unknown as DbClient;

      // Rollback previous stock impact
      for (const item of existing.items) {
        await this.updateProductStockInternal(client, item.productId, item.netWeightKg, "subtract");
      }

      // Rollback supplier balance by old total
      const oldTotal = parseAmount(existing.totalAmount);
      await this.updateAccountBalanceInternal(client, existing.supplierId, oldTotal.toString(), "subtract");

      // Rebuild new items/totals
      let subtotal = 0;
      let totalBags = 0;
      let totalGrossWeightKg = 0;
      let totalNetWeightKg = 0;

      const normalizedItems = items.map((item, idx) => {
        const normalized = this.normalizePurchaseItem({
          serialNo: item.serialNo ?? idx + 1,
          ...item,
        });
        subtotal += parseAmount(normalized.amount);
        totalBags += parseAmount(normalized.bags);
        totalGrossWeightKg += parseAmount(normalized.grossWeightKg);
        totalNetWeightKg += parseAmount(normalized.netWeightKg);
        return normalized;
      });

      const totalMoundQtyFloat = totalNetWeightKg / 40;
      const totalMoundQty = Math.floor(totalMoundQtyFloat);
      const totalMoundRemainderKg = Math.max(totalNetWeightKg - (totalMoundQty * 40), 0);

      const { add: chargesAdd, less: chargesLess } = this.sumCharges(charges);
      const brokerCommissionPercent = parseAmount((purchase as any).brokerCommissionPercent ?? existing.brokerCommissionPercent ?? "0");
      const brokerCommission = (subtotal * brokerCommissionPercent) / 100;

      const lineSubtotal = subtotal + brokerCommission;
      const grandAmount = lineSubtotal + chargesAdd - chargesLess;
      const paidAmount = parseAmount((purchase as any).paidAmount ?? existing.paidAmount ?? 0);
      const balanceDue = grandAmount - paidAmount;
      const amountInWords = `${toWords(Math.round(grandAmount))} only`;

      const [updatedPurchase] = await tx.update(purchases).set({
        ...purchase,
        subtotal: lineSubtotal.toString(),
        totalAmount: grandAmount.toString(),
        totalBags: totalBags.toString(),
        totalGrossWeightKg: totalGrossWeightKg.toString(),
        totalNetWeightKg: totalNetWeightKg.toString(),
        totalMoundQty: totalMoundQty.toString(),
        totalMoundRemainderKg: totalMoundRemainderKg.toString(),
        chargesAdd: chargesAdd.toString(),
        chargesLess: chargesLess.toString(),
        buyerAmount: grandAmount.toString(),
        balanceDue: balanceDue.toString(),
        brokerCommissionAmount: brokerCommission.toString(),
        paidAmount: paidAmount.toString(),
        amountInWords,
      }).where(eq(purchases.id, id)).returning();

      // Replace items
      await tx.delete(purchaseItems).where(eq(purchaseItems.purchaseId, id)).run();
      for (const item of normalizedItems) {
        await tx.insert(purchaseItems).values({ ...item, purchaseId: id });
        await this.updateProductStockInternal(client, item.productId, item.netWeightKg, "add");
      }

      // Replace charges
      await tx.delete(purchaseCharges).where(eq(purchaseCharges.purchaseId, id)).run();
      for (const charge of charges) {
        await tx.insert(purchaseCharges).values({
          ...charge,
          purchaseId: id,
          amount: parseAmount(charge.amount).toString(),
        });
      }

      // Adjust supplier balance with delta
      const delta = grandAmount - oldTotal;
      if (delta !== 0) {
        await this.updateAccountBalanceInternal(
          client,
          purchase.supplierId ?? existing.supplierId,
          Math.abs(delta).toString(),
          delta > 0 ? "add" : "subtract"
        );
        await this.createLedgerEntryInternal(client, {
          accountId: purchase.supplierId ?? existing.supplierId,
          transactionType: delta > 0 ? "credit" : "debit",
          amount: Math.abs(delta).toString(),
          balance: "0",
          description: `Purchase Update Adjustment #${id}`,
          referenceType: "purchase",
          referenceId: id,
          entryDate: new Date(),
        });
      }

      return updatedPurchase;
    });
  }

  // Processing
  async getProcessingBatches(): Promise<Processing[]> {
    return db.select().from(processing).orderBy(desc(processing.startDate)).all();
  }

  async getProcessingBatch(id: number): Promise<Processing | undefined> {
    const [batch] = db.select().from(processing).where(eq(processing.id, id)).all();
    return batch;
  }

  async getNextBatchNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = db.select().from(processing)
      .orderBy(desc(processing.id))
      .limit(1)
      .all();

    const nextNum = last ? parseInt(last.batchNumber.split('-').pop() || '0') + 1 : 1;
    return `PRO-${year}-${String(nextNum).padStart(3, '0')}`;
  }

  async createProcessing(batch: InsertProcessing): Promise<Processing> {
    return db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const [last] = tx.select().from(processing).orderBy(desc(processing.id)).limit(1).all();
      const nextNum = last ? parseInt(last.batchNumber.split("-").pop() || "0") + 1 : 1;
      const batchNumber = `PRO-${year}-${String(nextNum).padStart(3, "0")}`;

      const client = tx as unknown as DbClient;

      // Reduce stock for source product
      await this.updateProductStockInternal(client, batch.sourceProductId, batch.sourceQuantity, "subtract");

      const [newBatch] = await tx.insert(processing).values({
        ...batch,
        batchNumber,
      }).returning();

      return newBatch;
    });
  }

  async updateProcessing(id: number, batch: Partial<InsertProcessing>): Promise<Processing | undefined> {
    const existingBatch = await this.getProcessingBatch(id);
    if (!existingBatch) return undefined;

    return db.transaction(async (tx) => {
      const updatePayload: Partial<InsertProcessing> = { ...batch };
      const client = tx as unknown as DbClient;

      if (batch.status === "in_progress" && existingBatch.status === "pending") {
        updatePayload.startDate = new Date();
      }

      if (batch.status === "completed" && existingBatch.status !== "completed") {
        const outputProductId = batch.outputProductId || existingBatch.outputProductId;
        const outputQuantity = batch.outputQuantity || existingBatch.outputQuantity;

        if (outputProductId && outputQuantity) {
          await this.updateProductStockInternal(
            client,
            outputProductId,
            outputQuantity,
            "add",
          );
        }
        updatePayload.completedDate = new Date();
      }

      const [updated] = await tx.update(processing).set(updatePayload).where(eq(processing.id, id)).returning();
      return updated;
    });
  }

  // Sales
  async getSales(): Promise<Sale[]> {
    return db.select().from(sales).orderBy(desc(sales.saleDate)).all();
  }

  async getSale(id: number): Promise<Sale | undefined> {
    const [sale] = db.select().from(sales).where(eq(sales.id, id)).all();
    return sale;
  }

  async getNextSaleInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = db.select().from(sales)
      .orderBy(desc(sales.id))
      .limit(1)
      .all();

    const nextNum = last ? parseInt(last.invoiceNumber.split("-").pop() || "0") + 1 : 1;
    return `SAL-${year}-${String(nextNum).padStart(4, "0")}`;
  }

  async getNextGatePassNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = db.select().from(sales)
      .orderBy(desc(sales.id))
      .limit(1)
      .all();

    const nextNum = last ? parseInt(last.gatePassNumber?.split("-").pop() || "0") + 1 : 1;
    return `GP-${year}-${String(nextNum).padStart(4, "0")}`;
  }

  async createSale(sale: InsertSale, items: SaleItemInput[]): Promise<Sale> {
    return db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const [lastSale] = tx.select().from(sales).orderBy(desc(sales.id)).limit(1).all();
      const nextInvoice = lastSale ? parseInt(lastSale.invoiceNumber.split("-").pop() || "0") + 1 : 1;
      const invoiceNumber = `SAL-${year}-${String(nextInvoice).padStart(4, "0")}`;

      const [lastGp] = tx.select().from(sales).orderBy(desc(sales.id)).limit(1).all();
      const nextGp = lastGp ? parseInt(lastGp.gatePassNumber?.split("-").pop() || "0") + 1 : 1;
      const gatePassNumber = `GP-${year}-${String(nextGp).padStart(4, "0")}`;

      const client = tx as unknown as DbClient;

      let subtotal = 0;
      const normalizedItems = items.map((item) => {
        const qty = parseAmount(item.quantity);
        const price = parseAmount(item.pricePerUnit);
        const total = qty * price;
        subtotal += total;
        return {
          ...item,
          quantity: qty.toString(),
          pricePerUnit: price.toString(),
          totalPrice: total.toString(),
        };
      });

      // Validate stock first
      for (const item of normalizedItems) {
        const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
        const currentStock = parseAmount(product?.currentStock || "0");
        const qty = parseAmount(item.quantity);
        if (currentStock < qty) {
          throw new Error(`Insufficient stock for product ${product?.name || item.productId}. Available: ${currentStock}, Required: ${qty}`);
        }
      }

      const charges = parseAmount(sale.loadingCharges || "0") + 
                     parseAmount(sale.weighingCharges || "0") + 
                     parseAmount(sale.otherCharges || "0");
      const totalAmount = subtotal + charges;

      const [newSale] = await tx.insert(sales).values({
        ...sale,
        invoiceNumber,
        gatePassNumber,
        subtotal: subtotal.toString(),
        totalAmount: totalAmount.toString(),
      }).returning();

      for (const item of normalizedItems) {
        await tx.insert(saleItems).values({
          ...item,
          saleId: newSale.id,
        });
        await this.updateProductStockInternal(client, item.productId, item.quantity, "subtract");
      }

      await this.updateAccountBalanceInternal(client, sale.customerId, totalAmount.toString(), "add");

      await this.createLedgerEntryInternal(client, {
        accountId: sale.customerId,
        transactionType: "debit",
        amount: totalAmount.toString(),
        balance: "0",
        description: `Sale Invoice: ${invoiceNumber}`,
        referenceType: "sale",
        referenceId: newSale.id,
        entryDate: new Date(),
      });

      return newSale;
    });
  }

  // Sale Items
  async getSaleItems(saleId: number): Promise<SaleItem[]> {
    return db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all();
  }

  // Ledger
  async getLedgerEntries(accountId?: number): Promise<LedgerEntry[]> {
    if (accountId) {
      return db.select().from(ledgerEntries)
        .where(eq(ledgerEntries.accountId, accountId))
        .orderBy(desc(ledgerEntries.entryDate))
        .all();
    }
    return db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.entryDate)).all();
  }

  private createLedgerEntryInternal(client: DbClient, entry: InsertLedgerEntry): Promise<LedgerEntry> {
    const [account] = client.select().from(accounts).where(eq(accounts.id, entry.accountId)).all();
    const balance = account?.currentBalance || "0";
    const newEntry = client.insert(ledgerEntries).values({
      ...entry,
      balance,
    }).returning().get();
    return Promise.resolve(newEntry);
  }

  async createLedgerEntry(entry: InsertLedgerEntry): Promise<LedgerEntry> {
    return this.createLedgerEntryInternal(db, entry);
  }

  // Cash Receipt Vouchers
  async getReceiptVouchers(): Promise<(ReceiptVoucher & { lines?: ReceiptVoucherLine[]; primaryAccountName?: string })[]> {
    const vouchers = db.select().from(receiptVouchers).where(isNull(receiptVouchers.deletedAt)).orderBy(desc(receiptVouchers.id)).all();
    const lines = db.select().from(receiptVoucherLines).all();
    const accountsList = await this.getAccounts();
    const accountMap = new Map(accountsList.map((a) => [a.id, a.name]));

    const linesByVoucher = lines.reduce<Record<number, ReceiptVoucherLine[]>>((acc, line) => {
      acc[line.voucherId] = acc[line.voucherId] || [];
      acc[line.voucherId].push(line);
      return acc;
    }, {});

    return vouchers.map((v) => {
      const voucherLines = linesByVoucher[v.id] || [];
      const primaryAccountName = voucherLines.length ? accountMap.get(voucherLines[0].accountId) || "" : "";
      return { ...v, lines: voucherLines, primaryAccountName };
    });
  }

  async getReceiptVoucher(id: number): Promise<(ReceiptVoucher & { lines: ReceiptVoucherLine[] }) | undefined> {
    const [voucher] = db.select().from(receiptVouchers).where(and(eq(receiptVouchers.id, id), isNull(receiptVouchers.deletedAt))).all();
    if (!voucher) return undefined;
    const lines = db.select().from(receiptVoucherLines).where(eq(receiptVoucherLines.voucherId, id)).all();
    return { ...voucher, lines };
  }

  async getNextReceiptVoucherNumber(voucherType = "CR"): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = db.select().from(receiptVouchers)
      .where(eq(receiptVouchers.voucherType, voucherType))
      .orderBy(desc(receiptVouchers.id))
      .limit(1)
      .all();
    const nextNum = last ? parseInt(last.voucherNumber.split("-").pop() || "0") + 1 : 1;
    return `${voucherType}-${year}-${String(nextNum).padStart(5, "0")}`;
  }

  private validateBalanced(lines: ReceiptLineInput[]) {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      totalDebit += parseAmount(line.debit || "0");
      totalCredit += parseAmount(line.credit || "0");
    }
    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new Error("Debit and Credit must be equal");
    }
    return { totalDebit, totalCredit };
  }

  async createReceiptVoucher(data: InsertReceiptVoucher, lines: ReceiptLineInput[]): Promise<ReceiptVoucher> {
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;

      const year = new Date().getFullYear();
      const [last] = tx.select().from(receiptVouchers)
        .where(eq(receiptVouchers.voucherType, data.voucherType || "CR"))
        .orderBy(desc(receiptVouchers.id))
        .limit(1)
        .all();
      const nextNum = last ? parseInt(last.voucherNumber.split("-").pop() || "0") + 1 : 1;
      const voucherNumber = `${data.voucherType || "CR"}-${year}-${String(nextNum).padStart(5, "0")}`;

      const { totalDebit, totalCredit } = this.validateBalanced(lines);
      const amountInWords = `${toWords(Math.round(totalDebit || totalCredit))} only`;

      const voucher = tx.insert(receiptVouchers).values({
        ...data,
        voucherNumber,
        totalDebit: totalDebit.toString(),
        totalCredit: totalCredit.toString(),
        amountInWords,
        updatedAt: new Date(),
      }).returning().get();

      for (const line of lines) {
        const debit = parseAmount(line.debit || "0");
        const credit = parseAmount(line.credit || "0");
        if (debit <= 0 && credit <= 0) continue;
        tx.insert(receiptVoucherLines).values({
          ...line,
          voucherId: voucher.id,
          debit: debit.toString(),
          credit: credit.toString(),
        }).run();

        if (debit > 0) {
          this.updateAccountBalanceInternal(client, line.accountId, debit.toString(), "add");
          this.createLedgerEntryInternal(client, {
            accountId: line.accountId,
            transactionType: "debit",
            amount: debit.toString(),
            balance: "0",
            description: `Receipt ${voucher.voucherNumber}`,
            referenceType: "receipt",
            referenceId: voucher.id,
            entryDate: data.voucherDate || new Date(),
          });
        }
        if (credit > 0) {
          this.updateAccountBalanceInternal(client, line.accountId, credit.toString(), "subtract");
          this.createLedgerEntryInternal(client, {
            accountId: line.accountId,
            transactionType: "credit",
            amount: credit.toString(),
            balance: "0",
            description: `Receipt ${voucher.voucherNumber}`,
            referenceType: "receipt",
            referenceId: voucher.id,
            entryDate: data.voucherDate || new Date(),
          });
        }
      }

      return voucher;
    });
  }

  async updateReceiptVoucher(id: number, data: Partial<InsertReceiptVoucher>, lines: ReceiptLineInput[]): Promise<ReceiptVoucher | undefined> {
    const existing = await this.getReceiptVoucher(id);
    if (!existing) return undefined;

    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;

      // reverse ledger/account impacts
      for (const line of existing.lines) {
        const debit = parseAmount(line.debit);
        const credit = parseAmount(line.credit);
        if (debit > 0) this.updateAccountBalanceInternal(client, line.accountId, debit.toString(), "subtract");
        if (credit > 0) this.updateAccountBalanceInternal(client, line.accountId, credit.toString(), "add");
      }
      tx.delete(receiptVoucherLines).where(eq(receiptVoucherLines.voucherId, id)).run();

      const { totalDebit, totalCredit } = this.validateBalanced(lines);
      const amountInWords = `${toWords(Math.round(totalDebit || totalCredit))} only`;

      const updated = tx.update(receiptVouchers).set({
        ...data,
        totalDebit: totalDebit.toString(),
        totalCredit: totalCredit.toString(),
        amountInWords,
        updatedAt: new Date(),
      }).where(eq(receiptVouchers.id, id)).returning().get();

      for (const line of lines) {
        const debit = parseAmount(line.debit || "0");
        const credit = parseAmount(line.credit || "0");
        if (debit <= 0 && credit <= 0) continue;
        tx.insert(receiptVoucherLines).values({
          ...line,
          voucherId: id,
          debit: debit.toString(),
          credit: credit.toString(),
        }).run();
        if (debit > 0) {
          this.updateAccountBalanceInternal(client, line.accountId, debit.toString(), "add");
          this.createLedgerEntryInternal(client, {
            accountId: line.accountId,
            transactionType: "debit",
            amount: debit.toString(),
            balance: "0",
            description: `Receipt ${updated.voucherNumber}`,
            referenceType: "receipt",
            referenceId: id,
            entryDate: data.voucherDate || new Date(),
          });
        }
        if (credit > 0) {
          this.updateAccountBalanceInternal(client, line.accountId, credit.toString(), "subtract");
          this.createLedgerEntryInternal(client, {
            accountId: line.accountId,
            transactionType: "credit",
            amount: credit.toString(),
            balance: "0",
            description: `Receipt ${updated.voucherNumber}`,
            referenceType: "receipt",
            referenceId: id,
            entryDate: data.voucherDate || new Date(),
          });
        }
      }

      return updated;
    });
  }

  async deleteReceiptVoucher(id: number): Promise<boolean> {
    const existing = await this.getReceiptVoucher(id);
    if (!existing) return false;
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      for (const line of existing.lines) {
        const debit = parseAmount(line.debit);
        const credit = parseAmount(line.credit);
        if (debit > 0) this.updateAccountBalanceInternal(client, line.accountId, debit.toString(), "subtract");
        if (credit > 0) this.updateAccountBalanceInternal(client, line.accountId, credit.toString(), "add");
      }
      tx.update(receiptVouchers).set({ deletedAt: new Date() }).where(eq(receiptVouchers.id, id)).run();
      tx.delete(receiptVoucherLines).where(eq(receiptVoucherLines.voucherId, id)).run();
      return true;
    });
  }

  // Reports
  async getStockReport(): Promise<{ product: Product; totalPurchased: string; totalSold: string; currentStock: string }[]> {
    const allProducts = await this.getProducts();
    const result = [];

    // Optimize N+1 by fetching all IDs inside loop? No, use improved queries if possible.
    // Drizzle doesn't support easy bulk group-by maps without raw SQL.
    // For now, stick to loop but use COALESCE instead of IFNULL.
    // Optimization (group by) is simpler to implement correctly in next phase if performance is still issue.
    // Issue #8 is High, but Correctness (COALESCE) is CRITICAL.
    
    for (const product of allProducts) {
      const [purchasedResult] = db.select({
        total: sql<string>`COALESCE(SUM(${purchaseItems.netWeightKg}), 0)`
      }).from(purchaseItems).where(eq(purchaseItems.productId, product.id)).all();

      const [soldResult] = db.select({
        total: sql<string>`COALESCE(SUM(${saleItems.quantity}), 0)`
      }).from(saleItems).where(eq(saleItems.productId, product.id)).all();

      result.push({
        product,
        totalPurchased: purchasedResult?.total || "0",
        totalSold: soldResult?.total || "0",
        currentStock: product.currentStock,
      });
    }

    return result;
  }

  async getTrialBalance(): Promise<{ account: Account; debit: string; credit: string }[]> {
    const allAccounts = await this.getAccounts();
    const result = [];

    for (const account of allAccounts) {
      const [debitResult] = db.select({
        total: sql<string>`COALESCE(SUM(${ledgerEntries.amount}), 0)`
      }).from(ledgerEntries)
        .where(and(
          eq(ledgerEntries.accountId, account.id),
          eq(ledgerEntries.transactionType, "debit")
        )).all();

      const [creditResult] = db.select({
        total: sql<string>`COALESCE(SUM(${ledgerEntries.amount}), 0)`
      }).from(ledgerEntries)
        .where(and(
          eq(ledgerEntries.accountId, account.id),
          eq(ledgerEntries.transactionType, "credit")
        )).all();

      result.push({
        account,
        debit: debitResult?.total || "0",
        credit: creditResult?.total || "0",
      });
    }

    return result;
  }

  async getProfitLoss(startDate?: Date, endDate?: Date): Promise<{
    totalPurchases: string;
    totalSales: string;
    expenses: string;
    grossProfit: string;
    netProfit: string;
    purchaseCount: number;
    saleCount: number;
  }> {
    const purchaseConditions = [];
    if (startDate) purchaseConditions.push(gte(purchases.purchaseDate, startDate));
    if (endDate) purchaseConditions.push(lte(purchases.purchaseDate, endDate));

    const purchaseQuery = db.select({
      total: sql<string>`COALESCE(SUM(${purchases.totalAmount}), 0)`,
      count: sql<number>`COUNT(*)`
    }).from(purchases);
    const [purchaseTotal] = (purchaseConditions.length
      ? purchaseQuery.where(and(...purchaseConditions))
      : purchaseQuery
    ).all();

    const saleConditions = [];
    if (startDate) saleConditions.push(gte(sales.saleDate, startDate));
    if (endDate) saleConditions.push(lte(sales.saleDate, endDate));

    const saleQuery = db.select({
      total: sql<string>`COALESCE(SUM(${sales.totalAmount}), 0)`,
      count: sql<number>`COUNT(*)`
    }).from(sales);
    const [saleTotal] = (saleConditions.length
      ? saleQuery.where(and(...saleConditions))
      : saleQuery
    ).all();

    // Filter expenes?
    const expenseAccounts = await this.getAccounts("expense");
    let expenseTotal = 0;
    for (const acc of expenseAccounts) {
      expenseTotal += parseFloat(acc.currentBalance);
    }

    const grossProfit = parseFloat(saleTotal?.total || "0") - parseFloat(purchaseTotal?.total || "0");
    const netProfit = grossProfit - expenseTotal;

    return {
      totalPurchases: purchaseTotal?.total || "0",
      totalSales: saleTotal?.total || "0",
      expenses: expenseTotal.toString(),
      grossProfit: grossProfit.toString(),
      netProfit: netProfit.toString(),
      purchaseCount: purchaseTotal?.count ?? 0,
      saleCount: saleTotal?.count ?? 0,
    };
  }
}

export const storage = new DatabaseStorage();

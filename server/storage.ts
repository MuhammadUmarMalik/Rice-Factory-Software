import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  users, accounts, products, purchases, purchaseItems,
  processing, sales, saleItems, ledgerEntries,
  type User, type InsertUser, type Account, type InsertAccount,
  type Product, type InsertProduct, type Purchase, type InsertPurchase,
  type PurchaseItem, type InsertPurchaseItem, type Processing, type InsertProcessing,
  type Sale, type InsertSale, type SaleItem, type InsertSaleItem,
  type LedgerEntry, type InsertLedgerEntry
} from "@shared/schema";

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
  updateAccountBalance(id: number, amount: string, type: 'add' | 'subtract'): Promise<void>;

  // Products
  getProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  updateProductStock(id: number, quantity: string, type: 'add' | 'subtract'): Promise<void>;

  // Purchases
  getPurchases(): Promise<Purchase[]>;
  getPurchase(id: number): Promise<Purchase | undefined>;
  createPurchase(purchase: InsertPurchase, items: InsertPurchaseItem[]): Promise<Purchase>;
  getNextPurchaseInvoiceNumber(): Promise<string>;

  // Purchase Items
  getPurchaseItems(purchaseId: number): Promise<PurchaseItem[]>;

  // Processing
  getProcessingBatches(): Promise<Processing[]>;
  getProcessingBatch(id: number): Promise<Processing | undefined>;
  createProcessing(batch: InsertProcessing): Promise<Processing>;
  updateProcessing(id: number, batch: Partial<InsertProcessing>): Promise<Processing | undefined>;
  getNextBatchNumber(): Promise<string>;

  // Sales
  getSales(): Promise<Sale[]>;
  getSale(id: number): Promise<Sale | undefined>;
  createSale(sale: InsertSale, items: InsertSaleItem[]): Promise<Sale>;
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
  getProfitLoss(startDate?: Date, endDate?: Date): Promise<{ totalPurchases: string; totalSales: string; expenses: string; grossProfit: string }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.fullName);
  }

  // Accounts
  async getAccounts(type?: string): Promise<Account[]> {
    if (type) {
      return db.select().from(accounts)
        .where(eq(accounts.type, type as any))
        .orderBy(accounts.name);
    }
    return db.select().from(accounts).orderBy(accounts.name);
  }

  async getAccount(id: number): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
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
    const operator = type === 'add' ? sql`+` : sql`-`;
    await db.update(accounts)
      .set({
        currentBalance: sql`${accounts.currentBalance} ${operator} ${amount}::decimal`
      })
      .where(eq(accounts.id, id));
  }

  // Products
  async getProducts(): Promise<Product[]> {
    return db.select().from(products).orderBy(products.name);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
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

  async updateProductStock(id: number, quantity: string, type: 'add' | 'subtract'): Promise<void> {
    if (type === 'add') {
      await db.update(products)
        .set({
          currentStock: sql`${products.currentStock} + ${quantity}::decimal`
        })
        .where(eq(products.id, id));
    } else {
      await db.update(products)
        .set({
          currentStock: sql`${products.currentStock} - ${quantity}::decimal`
        })
        .where(eq(products.id, id));
    }
  }

  // Purchases
  async getPurchases(): Promise<Purchase[]> {
    return db.select().from(purchases).orderBy(desc(purchases.purchaseDate));
  }

  async getPurchase(id: number): Promise<Purchase | undefined> {
    const [purchase] = await db.select().from(purchases).where(eq(purchases.id, id));
    return purchase;
  }

  async getNextPurchaseInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = await db.select().from(purchases)
      .where(sql`EXTRACT(YEAR FROM ${purchases.purchaseDate}) = ${year}`)
      .orderBy(desc(purchases.id))
      .limit(1);
    
    const nextNum = last ? parseInt(last.invoiceNumber.split('-').pop() || '0') + 1 : 1;
    return `PUR-${year}-${String(nextNum).padStart(4, '0')}`;
  }

  async createPurchase(purchase: InsertPurchase, items: InsertPurchaseItem[]): Promise<Purchase> {
    const invoiceNumber = await this.getNextPurchaseInvoiceNumber();
    
    let subtotal = 0;
    for (const item of items) {
      subtotal += parseFloat(item.totalPrice);
    }
    
    const brokerCommission = parseFloat(purchase.brokerCommissionAmount || "0");
    const totalAmount = subtotal + brokerCommission;

    const [newPurchase] = await db.insert(purchases).values({
      ...purchase,
      invoiceNumber,
      subtotal: subtotal.toString(),
      totalAmount: totalAmount.toString(),
    }).returning();

    for (const item of items) {
      await db.insert(purchaseItems).values({
        ...item,
        purchaseId: newPurchase.id,
      });
      await this.updateProductStock(item.productId, item.quantity, 'add');
    }

    await this.updateAccountBalance(purchase.supplierId, totalAmount.toString(), 'add');

    await this.createLedgerEntry({
      accountId: purchase.supplierId,
      transactionType: "credit",
      amount: totalAmount.toString(),
      balance: "0",
      description: `Purchase Invoice: ${invoiceNumber}`,
      referenceType: "purchase",
      referenceId: newPurchase.id,
      entryDate: new Date(),
    });

    return newPurchase;
  }

  // Purchase Items
  async getPurchaseItems(purchaseId: number): Promise<PurchaseItem[]> {
    return db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId));
  }

  // Processing
  async getProcessingBatches(): Promise<Processing[]> {
    return db.select().from(processing).orderBy(desc(processing.startDate));
  }

  async getProcessingBatch(id: number): Promise<Processing | undefined> {
    const [batch] = await db.select().from(processing).where(eq(processing.id, id));
    return batch;
  }

  async getNextBatchNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = await db.select().from(processing)
      .where(sql`EXTRACT(YEAR FROM ${processing.startDate}) = ${year}`)
      .orderBy(desc(processing.id))
      .limit(1);
    
    const nextNum = last ? parseInt(last.batchNumber.split('-').pop() || '0') + 1 : 1;
    return `PRO-${year}-${String(nextNum).padStart(3, '0')}`;
  }

  async createProcessing(batch: InsertProcessing): Promise<Processing> {
    const batchNumber = await this.getNextBatchNumber();
    
    await this.updateProductStock(batch.sourceProductId, batch.sourceQuantity, 'subtract');
    
    const [newBatch] = await db.insert(processing).values({
      ...batch,
      batchNumber,
    }).returning();

    return newBatch;
  }

  async updateProcessing(id: number, batch: Partial<InsertProcessing>): Promise<Processing | undefined> {
    const existingBatch = await this.getProcessingBatch(id);
    if (!existingBatch) return undefined;

    if (batch.status === 'completed' && existingBatch.status !== 'completed') {
      if (batch.outputProductId && batch.outputQuantity) {
        await this.updateProductStock(batch.outputProductId, batch.outputQuantity, 'add');
      }
      batch.completedDate = new Date();
    }

    const [updated] = await db.update(processing).set(batch).where(eq(processing.id, id)).returning();
    return updated;
  }

  // Sales
  async getSales(): Promise<Sale[]> {
    return db.select().from(sales).orderBy(desc(sales.saleDate));
  }

  async getSale(id: number): Promise<Sale | undefined> {
    const [sale] = await db.select().from(sales).where(eq(sales.id, id));
    return sale;
  }

  async getNextSaleInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = await db.select().from(sales)
      .where(sql`EXTRACT(YEAR FROM ${sales.saleDate}) = ${year}`)
      .orderBy(desc(sales.id))
      .limit(1);
    
    const nextNum = last ? parseInt(last.invoiceNumber.split('-').pop() || '0') + 1 : 1;
    return `SAL-${year}-${String(nextNum).padStart(4, '0')}`;
  }

  async getNextGatePassNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = await db.select().from(sales)
      .where(sql`EXTRACT(YEAR FROM ${sales.saleDate}) = ${year}`)
      .orderBy(desc(sales.id))
      .limit(1);
    
    const nextNum = last ? parseInt(last.gatePassNumber?.split('-').pop() || '0') + 1 : 1;
    return `GP-${year}-${String(nextNum).padStart(4, '0')}`;
  }

  async createSale(sale: InsertSale, items: InsertSaleItem[]): Promise<Sale> {
    const invoiceNumber = await this.getNextSaleInvoiceNumber();
    const gatePassNumber = await this.getNextGatePassNumber();
    
    let subtotal = 0;
    for (const item of items) {
      subtotal += parseFloat(item.totalPrice);
    }
    
    const charges = parseFloat(sale.loadingCharges || "0") + 
                   parseFloat(sale.weighingCharges || "0") + 
                   parseFloat(sale.otherCharges || "0");
    const totalAmount = subtotal + charges;

    const [newSale] = await db.insert(sales).values({
      ...sale,
      invoiceNumber,
      gatePassNumber,
      subtotal: subtotal.toString(),
      totalAmount: totalAmount.toString(),
    }).returning();

    for (const item of items) {
      await db.insert(saleItems).values({
        ...item,
        saleId: newSale.id,
      });
      await this.updateProductStock(item.productId, item.quantity, 'subtract');
    }

    await this.updateAccountBalance(sale.customerId, totalAmount.toString(), 'add');

    await this.createLedgerEntry({
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
  }

  // Sale Items
  async getSaleItems(saleId: number): Promise<SaleItem[]> {
    return db.select().from(saleItems).where(eq(saleItems.saleId, saleId));
  }

  // Ledger
  async getLedgerEntries(accountId?: number): Promise<LedgerEntry[]> {
    if (accountId) {
      return db.select().from(ledgerEntries)
        .where(eq(ledgerEntries.accountId, accountId))
        .orderBy(desc(ledgerEntries.entryDate));
    }
    return db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.entryDate));
  }

  async createLedgerEntry(entry: InsertLedgerEntry): Promise<LedgerEntry> {
    const account = await this.getAccount(entry.accountId);
    const [newEntry] = await db.insert(ledgerEntries).values({
      ...entry,
      balance: account?.currentBalance || "0",
    }).returning();
    return newEntry;
  }

  // Reports
  async getStockReport(): Promise<{ product: Product; totalPurchased: string; totalSold: string; currentStock: string }[]> {
    const allProducts = await this.getProducts();
    const result = [];

    for (const product of allProducts) {
      const [purchasedResult] = await db.select({
        total: sql<string>`COALESCE(SUM(${purchaseItems.quantity}), 0)`
      }).from(purchaseItems).where(eq(purchaseItems.productId, product.id));

      const [soldResult] = await db.select({
        total: sql<string>`COALESCE(SUM(${saleItems.quantity}), 0)`
      }).from(saleItems).where(eq(saleItems.productId, product.id));

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
      const [debitResult] = await db.select({
        total: sql<string>`COALESCE(SUM(${ledgerEntries.amount}), 0)`
      }).from(ledgerEntries)
        .where(and(
          eq(ledgerEntries.accountId, account.id),
          eq(ledgerEntries.transactionType, "debit")
        ));

      const [creditResult] = await db.select({
        total: sql<string>`COALESCE(SUM(${ledgerEntries.amount}), 0)`
      }).from(ledgerEntries)
        .where(and(
          eq(ledgerEntries.accountId, account.id),
          eq(ledgerEntries.transactionType, "credit")
        ));

      result.push({
        account,
        debit: debitResult?.total || "0",
        credit: creditResult?.total || "0",
      });
    }

    return result;
  }

  async getProfitLoss(startDate?: Date, endDate?: Date): Promise<{ totalPurchases: string; totalSales: string; expenses: string; grossProfit: string }> {
    const [purchaseTotal] = await db.select({
      total: sql<string>`COALESCE(SUM(${purchases.totalAmount}), 0)`
    }).from(purchases);

    const [saleTotal] = await db.select({
      total: sql<string>`COALESCE(SUM(${sales.totalAmount}), 0)`
    }).from(sales);

    const expenseAccounts = await this.getAccounts("expense");
    let expenseTotal = 0;
    for (const acc of expenseAccounts) {
      expenseTotal += parseFloat(acc.currentBalance);
    }

    const grossProfit = parseFloat(saleTotal?.total || "0") - parseFloat(purchaseTotal?.total || "0") - expenseTotal;

    return {
      totalPurchases: purchaseTotal?.total || "0",
      totalSales: saleTotal?.total || "0",
      expenses: expenseTotal.toString(),
      grossProfit: grossProfit.toString(),
    };
  }
}

export const storage = new DatabaseStorage();

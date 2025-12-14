import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  fullNameUrdu: text("full_name_urdu"),
  role: text("role", { enum: ["admin", "manager", "accountant", "operator"] }).notNull().default("operator"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Accounts table (Customers, Suppliers, Banks, Expense Categories)
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  nameUrdu: text("name_urdu"),
  type: text("type", { enum: ["customer", "supplier", "bank", "expense"] }).notNull(),
  phone: text("phone"),
  address: text("address"),
  addressUrdu: text("address_urdu"),
  openingBalance: text("opening_balance").notNull().default("0"),
  currentBalance: text("current_balance").notNull().default("0"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  currentBalance: true,
  createdAt: true,
});
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accounts.$inferSelect;

// Products table (Rice types)
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  nameUrdu: text("name_urdu"),
  unit: text("unit").notNull().default("kg"),
  currentStock: text("current_stock").notNull().default("0"),
  avgPurchasePrice: text("avg_purchase_price").notNull().default("0"),
  salePrice: text("sale_price").notNull().default("0"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// Purchases table
export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNumber: text("invoice_number").notNull().unique(),
  billNo: text("bill_no"),
  bookNo: text("book_no"),
  supplierId: integer("supplier_id").notNull().references(() => accounts.id),
  expenseAccountId: integer("expense_account_id").references(() => accounts.id),
  vehicleNumber: text("vehicle_number"),
  dueDate: integer("due_date", { mode: "timestamp" }),
  brokerId: integer("broker_id").references(() => accounts.id),
  brokerCommissionPercent: text("broker_commission_percent").default("0"),
  brokerCommissionAmount: text("broker_commission_amount").default("0"),
  subtotal: text("subtotal").notNull().default("0"), // line items subtotal
  totalAmount: text("total_amount").notNull().default("0"), // grand amount after charges
  totalBags: text("total_bags").notNull().default("0"),
  totalGrossWeightKg: text("total_gross_weight_kg").notNull().default("0"),
  totalNetWeightKg: text("total_net_weight_kg").notNull().default("0"),
  totalMoundQty: text("total_mound_qty").notNull().default("0"),
  totalMoundRemainderKg: text("total_mound_remainder_kg").notNull().default("0"),
  chargesAdd: text("charges_add").notNull().default("0"),
  chargesLess: text("charges_less").notNull().default("0"),
  buyerAmount: text("buyer_amount").notNull().default("0"),
  balanceDue: text("balance_due").notNull().default("0"),
  paidAmount: text("paid_amount").notNull().default("0"),
  amountInWords: text("amount_in_words").notNull().default(""),
  notes: text("notes"),
  purchaseDate: integer("purchase_date", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertPurchaseSchema = createInsertSchema(purchases).omit({
  id: true,
  invoiceNumber: true,
  subtotal: true,
  totalAmount: true,
  createdAt: true,
});
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchases.$inferSelect;

// Purchase Items table
export const purchaseItems = sqliteTable("purchase_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseId: integer("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  serialNo: integer("serial_no"),
  marka: text("marka"),
  bags: text("bags").notNull(),
  fillingPerBagKg: text("filling_per_bag_kg").notNull(),
  looseKgs: text("loose_kgs").notNull().default("0"),
  grossWeightKg: text("gross_weight_kg").notNull(),
  lessKg: text("less_kg").notNull().default("0"),
  bardanaKatKg: text("bardana_kat_kg").notNull().default("0"),
  netWeightKg: text("net_weight_kg").notNull(),
  moundQty: text("mound_qty").notNull(),
  moundRemainderKg: text("mound_remainder_kg").notNull().default("0"),
  rateUnit: text("rate_unit", { enum: ["kg", "mound", "bag", "quintal", "ton"] }).notNull().default("kg"),
  rate: text("rate").notNull(),
  amount: text("amount").notNull(),
});

export const insertPurchaseItemSchema = createInsertSchema(purchaseItems).omit({
  id: true,
});
export type InsertPurchaseItem = z.infer<typeof insertPurchaseItemSchema>;
export type PurchaseItem = typeof purchaseItems.$inferSelect;

// Purchase Charges table
export const purchaseCharges = sqliteTable("purchase_charges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseId: integer("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: [
      "weight",
      "freight",
      "loading_filling",
      "market_fee",
      "mitha_sukri",
      "other",
      "phone_analysis",
      "brokerage",
      "commission",
      "bardana",
      "broken_allowance",
    ],
  }).notNull(),
  mode: text("mode", { enum: ["add", "less"] }).notNull().default("add"),
  amount: text("amount").notNull().default("0"),
  accountId: integer("account_id").references(() => accounts.id),
  note: text("note"),
});

export const insertPurchaseChargeSchema = createInsertSchema(purchaseCharges).omit({
  id: true,
});
export type InsertPurchaseCharge = z.infer<typeof insertPurchaseChargeSchema>;
export type PurchaseCharge = typeof purchaseCharges.$inferSelect;

// Processing table (Stock Processing)
export const processing = sqliteTable("processing", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchNumber: text("batch_number").notNull().unique(),
  sourceProductId: integer("source_product_id").notNull().references(() => products.id),
  sourceQuantity: text("source_quantity").notNull(),
  outputProductId: integer("output_product_id").references(() => products.id),
  outputCategory: text("output_category"),
  outputQuantity: text("output_quantity"),
  wastageQuantity: text("wastage_quantity"),
  status: text("status", { enum: ["pending", "in_progress", "completed"] }).notNull().default("pending"),
  notes: text("notes"),
  startDate: integer("start_date", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  completedDate: integer("completed_date", { mode: "timestamp" }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertProcessingSchema = createInsertSchema(processing).omit({
  id: true,
  batchNumber: true,
  createdAt: true,
});
export type InsertProcessing = z.infer<typeof insertProcessingSchema>;
export type Processing = typeof processing.$inferSelect;

// Sales table
export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNumber: text("invoice_number").notNull().unique(),
  customerId: integer("customer_id").notNull().references(() => accounts.id),
  vehicleNumber: text("vehicle_number"),
  loadingCharges: text("loading_charges").default("0"),
  weighingCharges: text("weighing_charges").default("0"),
  otherCharges: text("other_charges").default("0"),
  subtotal: text("subtotal").notNull().default("0"),
  totalAmount: text("total_amount").notNull().default("0"),
  paidAmount: text("paid_amount").notNull().default("0"),
  notes: text("notes"),
  gatePassNumber: text("gate_pass_number"),
  saleDate: integer("sale_date", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertSaleSchema = createInsertSchema(sales).omit({
  id: true,
  invoiceNumber: true,
  gatePassNumber: true,
  subtotal: true,
  totalAmount: true,
  createdAt: true,
});
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof sales.$inferSelect;

// Sale Items table
export const saleItems = sqliteTable("sale_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: text("quantity").notNull(),
  pricePerUnit: text("price_per_unit").notNull(),
  totalPrice: text("total_price").notNull(),
});

export const insertSaleItemSchema = createInsertSchema(saleItems).omit({
  id: true,
});
export type InsertSaleItem = z.infer<typeof insertSaleItemSchema>;
export type SaleItem = typeof saleItems.$inferSelect;

// Ledger Entries table
export const ledgerEntries = sqliteTable("ledger_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  transactionType: text("transaction_type", { enum: ["debit", "credit"] }).notNull(),
  amount: text("amount").notNull(),
  balance: text("balance").notNull(),
  description: text("description").notNull(),
  descriptionUrdu: text("description_urdu"),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  entryDate: integer("entry_date", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({
  id: true,
  createdAt: true,
});
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;

// Cash Receipt Vouchers
export const receiptVouchers = sqliteTable("receipt_vouchers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherNumber: text("voucher_number").notNull().unique(),
  voucherType: text("voucher_type").notNull().default("CR"),
  voucherDate: integer("voucher_date", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  totalDebit: text("total_debit").notNull().default("0"),
  totalCredit: text("total_credit").notNull().default("0"),
  amountInWords: text("amount_in_words").notNull().default(""),
  narration: text("narration"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const receiptVoucherLines = sqliteTable("receipt_voucher_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherId: integer("voucher_id").notNull().references(() => receiptVouchers.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  narration: text("narration"),
  debit: text("debit").notNull().default("0"),
  credit: text("credit").notNull().default("0"),
});

export const insertReceiptVoucherSchema = createInsertSchema(receiptVouchers).omit({
  id: true,
  voucherNumber: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertReceiptVoucher = z.infer<typeof insertReceiptVoucherSchema>;
export type ReceiptVoucher = typeof receiptVouchers.$inferSelect;

export const insertReceiptVoucherLineSchema = createInsertSchema(receiptVoucherLines).omit({
  id: true,
});
export type InsertReceiptVoucherLine = z.infer<typeof insertReceiptVoucherLineSchema>;
export type ReceiptVoucherLine = typeof receiptVoucherLines.$inferSelect;

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  purchases: many(purchases),
  sales: many(sales),
  processing: many(processing),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
  purchases: many(purchases),
  sales: many(sales),
  ledgerEntries: many(ledgerEntries),
}));

export const productsRelations = relations(products, ({ many }) => ({
  purchaseItems: many(purchaseItems),
  saleItems: many(saleItems),
  processingSource: many(processing),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(accounts, {
    fields: [purchases.supplierId],
    references: [accounts.id],
  }),
  expenseAccount: one(accounts, {
    fields: [purchases.expenseAccountId],
    references: [accounts.id],
  }),
  broker: one(accounts, {
    fields: [purchases.brokerId],
    references: [accounts.id],
  }),
  createdByUser: one(users, {
    fields: [purchases.createdBy],
    references: [users.id],
  }),
  items: many(purchaseItems),
  charges: many(purchaseCharges),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, {
    fields: [purchaseItems.purchaseId],
    references: [purchases.id],
  }),
  product: one(products, {
    fields: [purchaseItems.productId],
    references: [products.id],
  }),
}));

export const purchaseChargesRelations = relations(purchaseCharges, ({ one }) => ({
  purchase: one(purchases, {
    fields: [purchaseCharges.purchaseId],
    references: [purchases.id],
  }),
  account: one(accounts, {
    fields: [purchaseCharges.accountId],
    references: [accounts.id],
  }),
}));

export const processingRelations = relations(processing, ({ one }) => ({
  sourceProduct: one(products, {
    fields: [processing.sourceProductId],
    references: [products.id],
  }),
  outputProduct: one(products, {
    fields: [processing.outputProductId],
    references: [products.id],
  }),
  createdByUser: one(users, {
    fields: [processing.createdBy],
    references: [users.id],
  }),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(accounts, {
    fields: [sales.customerId],
    references: [accounts.id],
  }),
  createdByUser: one(users, {
    fields: [sales.createdBy],
    references: [users.id],
  }),
  items: many(saleItems),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
  product: one(products, {
    fields: [saleItems.productId],
    references: [products.id],
  }),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  account: one(accounts, {
    fields: [ledgerEntries.accountId],
    references: [accounts.id],
  }),
}));

export const receiptVouchersRelations = relations(receiptVouchers, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [receiptVouchers.createdBy],
    references: [users.id],
  }),
  updatedByUser: one(users, {
    fields: [receiptVouchers.updatedBy],
    references: [users.id],
  }),
  lines: many(receiptVoucherLines),
}));

export const receiptVoucherLinesRelations = relations(receiptVoucherLines, ({ one }) => ({
  voucher: one(receiptVouchers, {
    fields: [receiptVoucherLines.voucherId],
    references: [receiptVouchers.id],
  }),
  account: one(accounts, {
    fields: [receiptVoucherLines.accountId],
    references: [accounts.id],
  }),
}));

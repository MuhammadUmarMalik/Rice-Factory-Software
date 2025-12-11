import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "accountant", "operator"]);
export const accountTypeEnum = pgEnum("account_type", ["customer", "supplier", "bank", "expense"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["debit", "credit"]);
export const processingStatusEnum = pgEnum("processing_status", ["pending", "in_progress", "completed"]);

// Users table
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  fullNameUrdu: text("full_name_urdu"),
  role: userRoleEnum("role").notNull().default("operator"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Accounts table (Customers, Suppliers, Banks, Expense Categories)
export const accounts = pgTable("accounts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  nameUrdu: text("name_urdu"),
  type: accountTypeEnum("type").notNull(),
  phone: text("phone"),
  address: text("address"),
  addressUrdu: text("address_urdu"),
  openingBalance: decimal("opening_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  currentBalance: decimal("current_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  currentBalance: true,
  createdAt: true,
});
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accounts.$inferSelect;

// Products table (Rice types)
export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  nameUrdu: text("name_urdu"),
  unit: text("unit").notNull().default("kg"),
  currentStock: decimal("current_stock", { precision: 15, scale: 2 }).notNull().default("0"),
  avgPurchasePrice: decimal("avg_purchase_price", { precision: 15, scale: 2 }).notNull().default("0"),
  salePrice: decimal("sale_price", { precision: 15, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  currentStock: true,
  avgPurchasePrice: true,
  createdAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// Purchases table
export const purchases = pgTable("purchases", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  supplierId: integer("supplier_id").notNull().references(() => accounts.id),
  vehicleNumber: text("vehicle_number"),
  brokerId: integer("broker_id").references(() => accounts.id),
  brokerCommissionPercent: decimal("broker_commission_percent", { precision: 5, scale: 2 }).default("0"),
  brokerCommissionAmount: decimal("broker_commission_amount", { precision: 15, scale: 2 }).default("0"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  purchaseDate: timestamp("purchase_date").notNull().defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
export const purchaseItems = pgTable("purchase_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  purchaseId: integer("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: decimal("quantity", { precision: 15, scale: 2 }).notNull(),
  pricePerUnit: decimal("price_per_unit", { precision: 15, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 15, scale: 2 }).notNull(),
});

export const insertPurchaseItemSchema = createInsertSchema(purchaseItems).omit({
  id: true,
});
export type InsertPurchaseItem = z.infer<typeof insertPurchaseItemSchema>;
export type PurchaseItem = typeof purchaseItems.$inferSelect;

// Processing table (Stock Processing)
export const processing = pgTable("processing", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  batchNumber: text("batch_number").notNull().unique(),
  sourceProductId: integer("source_product_id").notNull().references(() => products.id),
  sourceQuantity: decimal("source_quantity", { precision: 15, scale: 2 }).notNull(),
  outputProductId: integer("output_product_id").references(() => products.id),
  outputQuantity: decimal("output_quantity", { precision: 15, scale: 2 }),
  wastageQuantity: decimal("wastage_quantity", { precision: 15, scale: 2 }),
  status: processingStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  startDate: timestamp("start_date").notNull().defaultNow(),
  completedDate: timestamp("completed_date"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProcessingSchema = createInsertSchema(processing).omit({
  id: true,
  batchNumber: true,
  createdAt: true,
});
export type InsertProcessing = z.infer<typeof insertProcessingSchema>;
export type Processing = typeof processing.$inferSelect;

// Sales table
export const sales = pgTable("sales", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  customerId: integer("customer_id").notNull().references(() => accounts.id),
  vehicleNumber: text("vehicle_number"),
  loadingCharges: decimal("loading_charges", { precision: 15, scale: 2 }).default("0"),
  weighingCharges: decimal("weighing_charges", { precision: 15, scale: 2 }).default("0"),
  otherCharges: decimal("other_charges", { precision: 15, scale: 2 }).default("0"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  gatePassNumber: text("gate_pass_number"),
  saleDate: timestamp("sale_date").notNull().defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
export const saleItems = pgTable("sale_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  saleId: integer("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: decimal("quantity", { precision: 15, scale: 2 }).notNull(),
  pricePerUnit: decimal("price_per_unit", { precision: 15, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 15, scale: 2 }).notNull(),
});

export const insertSaleItemSchema = createInsertSchema(saleItems).omit({
  id: true,
});
export type InsertSaleItem = z.infer<typeof insertSaleItemSchema>;
export type SaleItem = typeof saleItems.$inferSelect;

// Ledger Entries table
export const ledgerEntries = pgTable("ledger_entries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  transactionType: transactionTypeEnum("transaction_type").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull(),
  description: text("description").notNull(),
  descriptionUrdu: text("description_urdu"),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  entryDate: timestamp("entry_date").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({
  id: true,
  createdAt: true,
});
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;

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
  broker: one(accounts, {
    fields: [purchases.brokerId],
    references: [accounts.id],
  }),
  createdByUser: one(users, {
    fields: [purchases.createdBy],
    references: [users.id],
  }),
  items: many(purchaseItems),
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

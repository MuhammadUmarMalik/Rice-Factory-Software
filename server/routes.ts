import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAccountSchema, insertProductSchema, insertPurchaseSchema, insertProcessingSchema, insertSaleSchema, insertReceiptVoucherSchema, insertReceiptVoucherLineSchema } from "@shared/schema";
import { z } from "zod";
import { format } from "date-fns";
import { promises as fs } from "fs";
import path from "path";

const numericString = z.union([z.string(), z.number()]).transform((val) => {
  const num = typeof val === "number" ? val : parseFloat(val);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("Invalid numeric value");
  }
  return num.toString();
});

const purchaseItemsSchema = z.array(z.object({
  productId: z.number().int().positive(),
  serialNo: z.number().int().positive().optional(),
  marka: z.string().optional(),
  bags: numericString,
  fillingPerBagKg: numericString,
  looseKgs: numericString.optional().default("0"),
  grossWeightKg: numericString.optional(), // computed server side, allow presence for edits
  lessKg: numericString.optional().default("0"),
  bardanaKatKg: numericString.optional().default("0"),
  netWeightKg: numericString.optional(), // computed server side
  moundQty: numericString.optional(), // computed server side
  moundRemainderKg: numericString.optional(), // computed server side
  rate: numericString,
  rateUnit: z.enum(["kg", "mound", "bag", "quintal", "ton"]),
  amount: numericString.optional(), // computed server side
})).min(1);

const purchaseChargesSchema = z.array(z.object({
  type: z.enum([
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
  ]),
  mode: z.enum(["add", "less"]).default("add"),
  amount: numericString,
  accountId: z.number().int().positive().optional(),
})).optional().default([]);

const saleItemsSchema = z.array(z.object({
  productId: z.number().int().positive(),
  quantity: numericString,
  pricePerUnit: numericString,
})).min(1);

// Receipt lines should be supplied without a voucherId; it gets attached inside the transaction
const receiptLinesSchema = z.array(
  insertReceiptVoucherLineSchema
    .omit({ voucherId: true })
    .extend({
      debit: numericString.default("0"),
      credit: numericString.default("0"),
      narration: z.string().optional(),
      accountId: z.number().int().positive(),
    })
).min(1);

const productSchema = insertProductSchema.extend({
  currentStock: numericString.optional(),
  avgPurchasePrice: numericString.optional(),
  salePrice: numericString.optional(),
});

const productUpdateSchema = productSchema.partial();

const settingsSchema = z.object({
  businessName: z.string().default(""),
  businessNameUrdu: z.string().default(""),
  phone: z.string().default(""),
  address: z.string().default(""),
  language: z.enum(["en", "ur"]).default("en"),
  theme: z.enum(["light", "dark"]).default("light"),
});

const settingsPath = path.join(process.cwd(), ".local", "settings.json");

async function readSettings() {
  try {
    const raw = await fs.readFile(settingsPath, "utf-8");
    return settingsSchema.parse(JSON.parse(raw));
  } catch (err) {
    return settingsSchema.parse({});
  }
}

async function writeSettings(data: unknown) {
  const parsed = settingsSchema.parse(data);
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(parsed, null, 2), "utf-8");
  return parsed;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Settings
  app.get("/api/settings", async (_req, res) => {
    try {
      const settings = await readSettings();
      res.json(settings);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to load settings" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const saved = await writeSettings(req.body);
      res.json(saved);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  // Dashboard Stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const profitLoss = await storage.getProfitLoss();
      const products = await storage.getProducts();
      const stockValue = products.reduce((sum, p) => 
        sum + (parseFloat(p.currentStock) * parseFloat(p.avgPurchasePrice)), 0);

      res.json({
        totalPurchases: `Rs. ${parseFloat(profitLoss.totalPurchases).toLocaleString()}`,
        totalSales: `Rs. ${parseFloat(profitLoss.totalSales).toLocaleString()}`,
        stockValue: `Rs. ${stockValue.toLocaleString()}`,
        totalProfit: `Rs. ${parseFloat((profitLoss as any).netProfit ?? profitLoss.grossProfit).toLocaleString()}`,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/dashboard/recent", async (req, res) => {
    try {
      const [recentPurchases, recentSales, recentProcessing] = await Promise.all([
        storage.getPurchases(),
        storage.getSales(),
        storage.getProcessingBatches(),
      ]);

      const activities = [
        ...recentPurchases.slice(0, 5).map(p => ({
          type: "purchase",
          id: p.id,
          amount: p.totalAmount,
          date: p.purchaseDate,
          reference: p.invoiceNumber,
        })),
        ...recentSales.slice(0, 5).map(s => ({
          type: "sale",
          id: s.id,
          amount: s.totalAmount,
          date: s.saleDate,
          reference: s.invoiceNumber,
        })),
        ...recentProcessing.slice(0, 5).map(p => ({
          type: "processing",
          id: p.id,
          amount: p.sourceQuantity,
          date: p.startDate,
          reference: p.batchNumber,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

      res.json(activities);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch recent activity" });
    }
  });

  app.get("/api/dashboard/charts", async (_req, res) => {
    try {
      const [purchases, sales, products] = await Promise.all([
        storage.getPurchases(),
        storage.getSales(),
        storage.getProducts(),
      ]);

      const monthSlots = Array.from({ length: 6 }).map((_, index) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (5 - index));
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        return { key, label: format(date, "MMM") };
      });

      const monthlyTotals = monthSlots.map(({ key, label }) => {
        const [year, month] = key.split("-").map(Number);

        const purchaseTotal = purchases
          .filter((p) => {
            const d = new Date(p.purchaseDate);
            return d.getFullYear() === year && d.getMonth() === month;
          })
          .reduce((sum, p) => sum + parseFloat(p.totalAmount || "0"), 0);

        const saleTotal = sales
          .filter((s) => {
            const d = new Date(s.saleDate);
            return d.getFullYear() === year && d.getMonth() === month;
          })
          .reduce((sum, s) => sum + parseFloat(s.totalAmount || "0"), 0);

        return {
          name: label,
          purchases: purchaseTotal,
          sales: saleTotal,
        };
      });

      const productStock = products.map((p) => ({
        name: p.name,
        stock: parseFloat(p.currentStock || "0"),
        unit: p.unit,
      }));

      res.json({ monthlyTotals, productStock });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch chart data" });
    }
  });

  // Accounts CRUD
  app.get("/api/accounts", async (req, res) => {
    try {
      const type = req.query.type as string | undefined;
      const accounts = await storage.getAccounts(type);
      res.json(accounts);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  app.get("/api/accounts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const account = await storage.getAccount(id);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch account" });
    }
  });

  app.post("/api/accounts", async (req, res) => {
    try {
      const data = insertAccountSchema.parse(req.body);
      const account = await storage.createAccount(data);
      res.status(201).json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  app.patch("/api/accounts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertAccountSchema.partial().parse(req.body);
      const account = await storage.updateAccount(id, data);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to update account" });
    }
  });

  // Products CRUD
  app.get("/api/products", async (req, res) => {
    try {
      const products = await storage.getProducts();
      res.json(products);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const product = await storage.getProduct(id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const parsed = productSchema.parse(req.body);
      const data = {
        ...parsed,
        currentStock: parsed.currentStock ?? "0",
        avgPurchasePrice: parsed.avgPurchasePrice ?? "0",
        salePrice: parsed.salePrice ?? "0",
      };
      const product = await storage.createProduct(data);
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  app.patch("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const parsed = productUpdateSchema.parse(req.body);
      const data = {
        ...parsed,
        currentStock: parsed.currentStock ?? undefined,
        avgPurchasePrice: parsed.avgPurchasePrice ?? undefined,
        salePrice: parsed.salePrice ?? undefined,
      };
      const product = await storage.updateProduct(id, data);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteProduct(id);
      if (!deleted) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  // Purchases CRUD
  app.get("/api/purchases", async (req, res) => {
    try {
      const purchases = await storage.getPurchases();
      res.json(purchases);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch purchases" });
    }
  });

  app.get("/api/purchases/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const purchase = await storage.getPurchaseWithDetails(id);
      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }
      res.json(purchase);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch purchase" });
    }
  });

  app.post("/api/purchases", async (req, res) => {
    try {
      const { items, charges, ...purchaseData } = req.body;
      const data = insertPurchaseSchema.parse(purchaseData);
      const parsedItems = purchaseItemsSchema.parse(items || []);
      const parsedCharges = purchaseChargesSchema.parse(charges || []);
      const purchase = await storage.createPurchase(data, parsedItems, parsedCharges);
      res.status(201).json(purchase);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to create purchase" });
    }
  });

  // Receipt Vouchers
  app.get("/api/receipts", async (_req, res) => {
    try {
      const [vouchers, accountsList] = await Promise.all([
        storage.getReceiptVouchers(),
        storage.getAccounts(),
      ]);
      const accountMap = new Map(accountsList.map((a) => [a.id, a.name]));

      const detailed = await Promise.all(
        vouchers
          .filter((v) => v.voucherType === "CR")
          .map(async (v) => {
            const withLines = await storage.getReceiptVoucher(v.id);
            const lines = withLines?.lines || [];
            const primaryAccountName =
              lines.length > 0 ? accountMap.get(lines[0].accountId) || "" : "";
            return { ...v, lines, primaryAccountName };
        })
      );

      res.json(detailed);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch vouchers" });
    }
  });

  app.get("/api/receipts/next-number", async (req, res) => {
    try {
      const type = (req.query.type as string) || "CR";
      const next = await storage.getNextReceiptVoucherNumber(type);
      res.json({ voucherNumber: next });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch voucher number" });
    }
  });

  app.get("/api/receipts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const voucher = await storage.getReceiptVoucher(id);
      if (!voucher || voucher.voucherType !== "CR") return res.status(404).json({ error: "Voucher not found" });
      res.json(voucher);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch voucher" });
    }
  });

const receiptHeaderSchema = insertReceiptVoucherSchema.extend({
  voucherDate: z.union([z.string(), z.date(), z.number()]).transform((val) => new Date(val)),
});
  const receiptHeaderSchemaPartial = receiptHeaderSchema.partial();

  app.post("/api/receipts", async (req, res) => {
    try {
      const { lines, ...payload } = req.body;
      const header = receiptHeaderSchema.parse({ ...payload, voucherType: "CR" });
      const parsedLines = receiptLinesSchema.parse(lines || []);
      const voucher = await storage.createReceiptVoucher(header, parsedLines);
      res.status(201).json(voucher);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to create voucher" });
    }
  });

  app.patch("/api/receipts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const current = await storage.getReceiptVoucher(id);
      if (!current || current.voucherType !== "CR") {
        return res.status(404).json({ error: "Voucher not found" });
      }
      const { lines, ...payload } = req.body;
      const header = receiptHeaderSchemaPartial.parse({ ...payload, voucherType: "CR" });
      const parsedLines = receiptLinesSchema.parse(lines || []);
      const voucher = await storage.updateReceiptVoucher(id, header, parsedLines);
      if (!voucher) return res.status(404).json({ error: "Voucher not found" });
      res.json(voucher);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to update voucher" });
    }
  });

  app.delete("/api/receipts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const current = await storage.getReceiptVoucher(id);
      if (!current || current.voucherType !== "CR") {
        return res.status(404).json({ error: "Voucher not found" });
      }
      const ok = await storage.deleteReceiptVoucher(id);
      if (!ok) return res.status(404).json({ error: "Voucher not found" });
      res.status(204).send();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete voucher" });
    }
  });

  // Cash Payment Vouchers (Debit)
  app.get("/api/payments", async (_req, res) => {
    try {
      const [vouchers, accountsList] = await Promise.all([
        storage.getReceiptVouchers(),
        storage.getAccounts(),
      ]);
      const accountMap = new Map(accountsList.map((a) => [a.id, a.name]));

      const detailed = await Promise.all(
        vouchers
          .filter((v) => v.voucherType === "DR")
          .map(async (v) => {
            const withLines = await storage.getReceiptVoucher(v.id);
            const lines = withLines?.lines || [];
            const primaryAccountName =
              lines.length > 0 ? accountMap.get(lines[0].accountId) || "" : "";
            return { ...v, lines, primaryAccountName };
          })
      );

      res.json(detailed);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch vouchers" });
    }
  });

  app.get("/api/payments/next-number", async (_req, res) => {
    try {
      const next = await storage.getNextReceiptVoucherNumber("DR");
      res.json({ voucherNumber: next });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch voucher number" });
    }
  });

  app.get("/api/payments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const voucher = await storage.getReceiptVoucher(id);
      if (!voucher || voucher.voucherType !== "DR") return res.status(404).json({ error: "Voucher not found" });
      res.json(voucher);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch voucher" });
    }
  });

  app.post("/api/payments", async (req, res) => {
    try {
      const { lines, ...payload } = req.body;
      const header = receiptHeaderSchema.parse({ ...payload, voucherType: "DR" });
      const parsedLines = receiptLinesSchema.parse(lines || []);
      const voucher = await storage.createReceiptVoucher(header, parsedLines);
      res.status(201).json(voucher);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to create voucher" });
    }
  });

  app.patch("/api/payments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const current = await storage.getReceiptVoucher(id);
      if (!current || current.voucherType !== "DR") {
        return res.status(404).json({ error: "Voucher not found" });
      }
      const { lines, ...payload } = req.body;
      const header = receiptHeaderSchemaPartial.parse({ ...payload, voucherType: "DR" });
      const parsedLines = receiptLinesSchema.parse(lines || []);
      const voucher = await storage.updateReceiptVoucher(id, header, parsedLines);
      if (!voucher) return res.status(404).json({ error: "Voucher not found" });
      res.json(voucher);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to update voucher" });
    }
  });

  app.delete("/api/payments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const current = await storage.getReceiptVoucher(id);
      if (!current || current.voucherType !== "DR") {
        return res.status(404).json({ error: "Voucher not found" });
      }
      const ok = await storage.deleteReceiptVoucher(id);
      if (!ok) return res.status(404).json({ error: "Voucher not found" });
      res.status(204).send();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete voucher" });
    }
  });

  app.patch("/api/purchases/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { items, charges, ...purchaseData } = req.body;
      const data = insertPurchaseSchema.partial().parse(purchaseData);
      const parsedItems = purchaseItemsSchema.parse(items || []);
      const parsedCharges = purchaseChargesSchema.parse(charges || []);
      const purchase = await storage.updatePurchase(id, data, parsedItems, parsedCharges);
      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }
      res.json(purchase);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to update purchase" });
    }
  });

  // Processing CRUD
  app.get("/api/processing", async (req, res) => {
    try {
      const [batches, products] = await Promise.all([
        storage.getProcessingBatches(),
        storage.getProducts(),
      ]);

      const enriched = batches.map((batch) => ({
        ...batch,
        sourceProduct: products.find((p) => p.id === batch.sourceProductId),
        outputProduct: batch.outputProductId
          ? products.find((p) => p.id === batch.outputProductId)
          : undefined,
      }));

      res.json(enriched);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch processing batches" });
    }
  });

  app.get("/api/processing/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const batch = await storage.getProcessingBatch(id);
      if (!batch) {
        return res.status(404).json({ error: "Processing batch not found" });
      }
      res.json(batch);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch processing batch" });
    }
  });

  app.post("/api/processing", async (req, res) => {
    try {
      const parsed = insertProcessingSchema.parse(req.body);
      if (parsed.outputQuantity) {
        parsed.outputQuantity = numericString.parse(parsed.outputQuantity);
      }
      parsed.sourceQuantity = numericString.parse(parsed.sourceQuantity);
      const batch = await storage.createProcessing(parsed);
      res.status(201).json(batch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to create processing batch" });
    }
  });

  app.patch("/api/processing/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertProcessingSchema.partial().parse(req.body);
      const batch = await storage.updateProcessing(id, data);
      if (!batch) {
        return res.status(404).json({ error: "Processing batch not found" });
      }
      res.json(batch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to update processing batch" });
    }
  });

  app.patch("/api/processing/:id/start", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getProcessingBatch(id);
      if (!existing) {
        return res.status(404).json({ error: "Processing batch not found" });
      }

      if (existing.status !== "pending") {
        return res.status(400).json({ error: "Batch already started" });
      }

      const batch = await storage.updateProcessing(id, { status: "in_progress" });
      res.json(batch);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to start processing batch" });
    }
  });

  app.patch("/api/processing/:id/complete", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getProcessingBatch(id);
      if (!existing) {
        return res.status(404).json({ error: "Processing batch not found" });
      }

      if (existing.status === "completed") {
        return res.status(400).json({ error: "Batch already completed" });
      }

      const body = z.object({
        outputProductId: z.number().int().positive(),
        outputQuantity: numericString,
        wastageQuantity: numericString.optional(),
      }).parse(req.body);

      if (existing.status === "pending") {
        await storage.updateProcessing(id, { status: "in_progress" });
      }

      const batch = await storage.updateProcessing(id, {
        status: "completed",
        outputProductId: body.outputProductId,
        outputQuantity: body.outputQuantity,
        wastageQuantity: body.wastageQuantity,
      });

      res.json(batch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to complete processing batch" });
    }
  });

  // Sales CRUD
  app.get("/api/sales", async (req, res) => {
    try {
      const sales = await storage.getSales();
      res.json(sales);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch sales" });
    }
  });

  app.get("/api/sales/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sale = await storage.getSale(id);
      if (!sale) {
        return res.status(404).json({ error: "Sale not found" });
      }
      const items = await storage.getSaleItems(id);
      res.json({ ...sale, items });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch sale" });
    }
  });

  app.post("/api/sales", async (req, res) => {
    try {
      const { items, ...saleData } = req.body;
      const data = insertSaleSchema.parse(saleData);
      const parsedItems = saleItemsSchema.parse(items || []);
      const sale = await storage.createSale(data, parsedItems);
      res.status(201).json(sale);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error && error.message.toLowerCase().includes("insufficient stock")) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to create sale" });
    }
  });

  // Ledger
  app.get("/api/ledger", async (req, res) => {
    try {
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
      const entries = await storage.getLedgerEntries(accountId);
      res.json(entries);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch ledger entries" });
    }
  });

  // Reports
  app.get("/api/reports/stock", async (req, res) => {
    try {
      const report = await storage.getStockReport();
      res.json(report);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch stock report" });
    }
  });

  app.get("/api/reports/trial-balance", async (req, res) => {
    try {
      const report = await storage.getTrialBalance();
      res.json(report);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch trial balance" });
    }
  });

  app.get("/api/reports/profit-loss", async (req, res) => {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const report = await storage.getProfitLoss(startDate, endDate);
      res.json(report);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch profit/loss report" });
    }
  });

  app.get("/api/reports/purchases", async (req, res) => {
    try {
      const purchases = await storage.getPurchases();
      const purchasesWithDetails = await Promise.all(
        purchases.map(async (purchase) => {
          const items = await storage.getPurchaseItems(purchase.id);
          const charges = await storage.getPurchaseCharges(purchase.id);
          const supplier = await storage.getAccount(purchase.supplierId);
          return { ...purchase, items, charges, supplier };
        })
      );
      res.json(purchasesWithDetails);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch purchase report" });
    }
  });

  app.get("/api/reports/sales", async (req, res) => {
    try {
      const sales = await storage.getSales();
      const salesWithDetails = await Promise.all(
        sales.map(async (sale) => {
          const items = await storage.getSaleItems(sale.id);
          const customer = await storage.getAccount(sale.customerId);
          return { ...sale, items, customer };
        })
      );
      res.json(salesWithDetails);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch sales report" });
    }
  });

  return httpServer;
}

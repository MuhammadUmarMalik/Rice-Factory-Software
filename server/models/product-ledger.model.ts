/**
 * Product Ledger model — per-product stock movement ledger.
 *
 * Queries purchase items, sale items, and processing (both source and output)
 * to build a chronological stock ledger for a single product or all products
 * of a given type (raw/bio).
 */
import { db } from "./db";
import { eq, and, gte, lte, asc, sql, inArray } from "drizzle-orm";
import {
  products,
  purchaseItems,
  purchases,
  saleItems,
  sales,
  processing,
  processingOutputs,
  accounts,
  type Product,
} from "../db/schema";
import { parseAmount } from "../utils/parse";

export type ProductLedgerRow = {
  id: number;
  productId: number;
  productName: string;
  productType: string;
  unit: string;
  entryDate: Date;
  voucherType: "Purchase" | "Sale" | "Processing-In" | "Processing-Out";
  voucherNo: string;
  partyName: string;
  narration: string;
  quantityIn: string;
  quantityOut: string;
  rate: string;
  amount: string;
  runningBalance: string;
};

export type ProductLedgerReport = {
  product: Product | null;
  rows: ProductLedgerRow[];
  totals: {
    quantityIn: string;
    quantityOut: string;
    closingBalance: string;
  };
  openingBalance: string;
};

/**
 * Fetch stock movement rows for a product ledger.
 * If productId is provided, returns rows for that product only.
 * If type is provided (without productId), returns rows for all products of that type.
 */
export function getProductLedger(params: {
  productId?: number;
  type?: "raw" | "bio";
  startDate?: string;
  endDate?: string;
}): ProductLedgerReport {
  const { productId, type, startDate, endDate } = params;

  // Build product filter
  const productFilters = [];
  if (productId) {
    productFilters.push(eq(products.id, productId));
  }
  if (type) {
    productFilters.push(eq(products.productType, type));
  }
  const productFilter = productFilters.length > 0
    ? and(...productFilters)
    : undefined;

  // Get products matching the filter
  const productList = productFilter
    ? db.select().from(products).where(productFilter).orderBy(products.name).all()
    : db.select().from(products).orderBy(products.name).all();

  if (productList.length === 0) {
    return {
      product: null,
      rows: [],
      totals: { quantityIn: "0", quantityOut: "0", closingBalance: "0" },
      openingBalance: "0",
    };
  }

  const productIds = productList.map((p) => p.id);
  const productMap = new Map(productList.map((p) => [p.id, p]));

  // --- Purchase Items (IN) ---
  const purchaseRows = db
    .select({
      id: purchaseItems.id,
      productId: purchaseItems.productId,
      entryDate: purchases.purchaseDate,
      voucherNo: purchases.invoiceNumber,
      partyName: accounts.name,
      quantityIn: purchaseItems.netWeightKg,
      rate: purchaseItems.rate,
      amount: purchaseItems.amount,
    })
    .from(purchaseItems)
    .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
    .leftJoin(accounts, eq(purchases.supplierId, accounts.id))
    .where(
      and(
        inArray(purchaseItems.productId, productIds),
        startDate ? gte(purchases.purchaseDate, new Date(startDate)) : undefined,
        endDate ? lte(purchases.purchaseDate, new Date(endDate + "T23:59:59")) : undefined,
      ),
    )
    .orderBy(asc(purchases.purchaseDate))
    .all();

  // --- Sale Items (OUT) ---
  const saleRows = db
    .select({
      id: saleItems.id,
      productId: saleItems.productId,
      entryDate: sales.saleDate,
      voucherNo: sales.invoiceNumber,
      partyName: accounts.name,
      quantityOut: saleItems.quantityKg,
      rate: saleItems.pricePerUnit,
      amount: saleItems.totalPrice,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .leftJoin(accounts, eq(sales.customerId, accounts.id))
    .where(
      and(
        inArray(saleItems.productId, productIds),
        startDate ? gte(sales.saleDate, new Date(startDate)) : undefined,
        endDate ? lte(sales.saleDate, new Date(endDate + "T23:59:59")) : undefined,
      ),
    )
    .orderBy(asc(sales.saleDate))
    .all();

  // --- Processing Source (OUT from source product) ---
  const processingSourceRows = db
    .select({
      id: processing.id,
      productId: processing.sourceProductId,
      entryDate: processing.completedDate,
      voucherNo: processing.batchNumber,
      partyName: sql<string>`'Processing'`,
      quantityOut: processing.sourceQuantity,
      rate: sql<string>`'0'`,
      amount: sql<string>`'0'`,
    })
    .from(processing)
    .where(
      and(
        inArray(processing.sourceProductId, productIds),
        eq(processing.status, "completed"),
        startDate ? gte(processing.completedDate, new Date(startDate)) : undefined,
        endDate ? lte(processing.completedDate, new Date(endDate + "T23:59:59")) : undefined,
      ),
    )
    .orderBy(asc(processing.completedDate))
    .all();

  // --- Processing Outputs (IN to output product) ---
  const processingOutputRows = db
    .select({
      id: processingOutputs.id,
      productId: processingOutputs.productId,
      entryDate: processing.completedDate,
      voucherNo: processing.batchNumber,
      partyName: sql<string>`'Processing'`,
      quantityIn: processingOutputs.quantity,
      rate: sql<string>`'0'`,
      amount: sql<string>`'0'`,
    })
    .from(processingOutputs)
    .innerJoin(processing, eq(processingOutputs.processingId, processing.id))
    .where(
      and(
        inArray(processingOutputs.productId, productIds),
        eq(processing.status, "completed"),
        startDate ? gte(processing.completedDate, new Date(startDate)) : undefined,
        endDate ? lte(processing.completedDate, new Date(endDate + "T23:59:59")) : undefined,
      ),
    )
    .orderBy(asc(processing.completedDate))
    .all();

  // Merge all rows into a unified ledger
  type RawRow = {
    id: number;
    productId: number;
    entryDate: Date | null;
    voucherNo: string;
    partyName: string | null;
    quantityIn?: string | null;
    quantityOut?: string | null;
    rate: string;
    amount: string;
    voucherType: ProductLedgerRow["voucherType"];
  };

  const allRawRows: RawRow[] = [
    ...purchaseRows.map((r) => ({ ...r, voucherType: "Purchase" as const })),
    ...saleRows.map((r) => ({ ...r, voucherType: "Sale" as const })),
    ...processingSourceRows.map((r) => ({ ...r, voucherType: "Processing-Out" as const })),
    ...processingOutputRows.map((r) => ({ ...r, voucherType: "Processing-In" as const })),
  ];

  // Sort by date
  allRawRows.sort((a, b) => {
    const dateA = a.entryDate ? new Date(a.entryDate).getTime() : 0;
    const dateB = b.entryDate ? new Date(b.entryDate).getTime() : 0;
    return dateA - dateB;
  });

  // Calculate running balance per product
  const runningBalances = new Map<number, number>();
  for (const pid of productIds) {
    runningBalances.set(pid, 0);
  }

  // If we have a start date, calculate opening balance from prior transactions
  if (startDate) {
    const priorPurchaseRows = db
      .select({
        productId: purchaseItems.productId,
        qty: purchaseItems.netWeightKg,
      })
      .from(purchaseItems)
      .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
      .where(
        and(
          inArray(purchaseItems.productId, productIds),
          sql`${purchases.purchaseDate} < ${new Date(startDate)}`,
        ),
      )
      .all();

    const priorSaleRows = db
      .select({
        productId: saleItems.productId,
        qty: saleItems.quantityKg,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(
        and(
          inArray(saleItems.productId, productIds),
          sql`${sales.saleDate} < ${new Date(startDate)}`,
        ),
      )
      .all();

    const priorProcessingSourceRows = db
      .select({
        productId: processing.sourceProductId,
        qty: processing.sourceQuantity,
      })
      .from(processing)
      .where(
        and(
          inArray(processing.sourceProductId, productIds),
          eq(processing.status, "completed"),
          sql`${processing.completedDate} < ${new Date(startDate)}`,
        ),
      )
      .all();

    const priorProcessingOutputRows = db
      .select({
        productId: processingOutputs.productId,
        qty: processingOutputs.quantity,
      })
      .from(processingOutputs)
      .innerJoin(processing, eq(processingOutputs.processingId, processing.id))
      .where(
        and(
          inArray(processingOutputs.productId, productIds),
          eq(processing.status, "completed"),
          sql`${processing.completedDate} < ${new Date(startDate)}`,
        ),
      )
      .all();

    for (const row of priorPurchaseRows) {
      const current = runningBalances.get(row.productId) || 0;
      runningBalances.set(row.productId, current + parseAmount(row.qty));
    }
    for (const row of priorSaleRows) {
      const current = runningBalances.get(row.productId) || 0;
      runningBalances.set(row.productId, current - parseAmount(row.qty));
    }
    for (const row of priorProcessingSourceRows) {
      const current = runningBalances.get(row.productId) || 0;
      runningBalances.set(row.productId, current - parseAmount(row.qty));
    }
    for (const row of priorProcessingOutputRows) {
      const current = runningBalances.get(row.productId) || 0;
      runningBalances.set(row.productId, current + parseAmount(row.qty));
    }
  }

  // Build final rows with running balance
  const rows: ProductLedgerRow[] = allRawRows.map((raw) => {
    const product = productMap.get(raw.productId);
    const qtyIn = parseAmount(raw.quantityIn || "0");
    const qtyOut = parseAmount(raw.quantityOut || "0");
    const prevBalance = runningBalances.get(raw.productId) || 0;
    const newBalance = prevBalance + qtyIn - qtyOut;
    runningBalances.set(raw.productId, newBalance);

    const narrationParts: string[] = [];
    if (raw.voucherType === "Purchase") {
      narrationParts.push(`Purchase from ${raw.partyName || "Supplier"}`);
    } else if (raw.voucherType === "Sale") {
      narrationParts.push(`Sale to ${raw.partyName || "Customer"}`);
    } else if (raw.voucherType === "Processing-In") {
      narrationParts.push(`Processing output (Batch: ${raw.voucherNo})`);
    } else {
      narrationParts.push(`Processing consumed (Batch: ${raw.voucherNo})`);
    }

    return {
      id: raw.id,
      productId: raw.productId,
      productName: product?.name || "",
      productType: product?.productType || "",
      unit: product?.unit || "kg",
      entryDate: raw.entryDate || new Date(),
      voucherType: raw.voucherType,
      voucherNo: raw.voucherNo,
      partyName: raw.partyName || "",
      narration: narrationParts.join(" — "),
      quantityIn: qtyIn > 0 ? qtyIn.toFixed(3) : "0",
      quantityOut: qtyOut > 0 ? qtyOut.toFixed(3) : "0",
      rate: raw.rate || "0",
      amount: raw.amount || "0",
      runningBalance: newBalance.toFixed(3),
    };
  });

  // Calculate totals
  let totalIn = 0;
  let totalOut = 0;
  for (const row of rows) {
    totalIn += parseAmount(row.quantityIn);
    totalOut += parseAmount(row.quantityOut);
  }

  // If single product, get opening balance from product's current stock
  let openingBalance = "0";
  if (productId && productList.length === 1) {
    const product = productList[0];
    const currentStock = parseAmount(product.currentStock);
    openingBalance = (currentStock - totalIn + totalOut).toFixed(3);
  }

  const closingBalance = (parseAmount(openingBalance) + totalIn - totalOut).toFixed(3);

  return {
    product: productId && productList.length === 1 ? productList[0] : null,
    rows,
    totals: {
      quantityIn: totalIn.toFixed(3),
      quantityOut: totalOut.toFixed(3),
      closingBalance,
    },
    openingBalance,
  };
}

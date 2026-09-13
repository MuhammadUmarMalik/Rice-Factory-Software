/**
 * Product persistence, extracted from the "// Products" section of storage.ts.
 *
 * These are plain functions over the shared `db` handle, called directly by
 * the repository adapters and the services.
 */
import { db } from "./db";
import { eq } from "drizzle-orm";
import { products, type Product, type InsertProduct } from "../db/schema";
import { parseAmount } from "../utils/parse";

/** Either the shared client or a transaction-scoped one. */
type DbClient = typeof db;

export async function getProducts(): Promise<Product[]> {
  return db.select().from(products).orderBy(products.name).all();
}

export async function getActiveProducts(): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(eq(products.isActive, true as any))
    .orderBy(products.name)
    .all();
}

export async function getProduct(id: number): Promise<Product | undefined> {
  const [product] = db.select().from(products).where(eq(products.id, id)).all();
  return product;
}

export async function createProduct(product: InsertProduct): Promise<Product> {
  const [newProduct] = await db.insert(products).values(product).returning();
  return newProduct;
}

export async function updateProduct(
  id: number,
  product: Partial<InsertProduct>,
): Promise<Product | undefined> {
  const [updated] = await db.update(products).set(product).where(eq(products.id, id)).returning();
  return updated;
}

export async function deleteProduct(id: number): Promise<boolean> {
  try {
    const result = await db.delete(products).where(eq(products.id, id)).run();
    return result.changes > 0;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "SQLITE_CONSTRAINT_FOREIGNKEY") throw error;

    const [existing] = db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, id))
      .all();
    if (!existing) return false;

    await db.update(products).set({ isActive: false as any }).where(eq(products.id, id)).run();
    return true;
  }
}

/**
 * Client-parameterised stock movement. Every posting path calls
 * this inside its own transaction, so the client must stay an argument rather
 * than defaulting to the shared handle.
 */
export function updateProductStockOn(
  client: DbClient,
  id: number,
  quantity: string,
  type: "add" | "subtract",
) {
  const [product] = client.select().from(products).where(eq(products.id, id)).all();
  if (!product) {
    // Without this the UPDATE below matched no rows and the movement was
    // silently dropped, leaving the document booked against no inventory.
    throw new Error(`Product ${id} not found`);
  }
  const current = parseAmount(product.currentStock || "0");
  const qty = parseAmount(quantity || "0");
  // Binary floating point leaves residue such as 0.30000000000000004; stock
  // is tracked to 3 decimals (grams), so round to that precision.
  const newStock = Math.round((type === "add" ? current + qty : current - qty) * 1000) / 1000;

  if (type === "subtract" && newStock < 0) {
    throw new Error(`Insufficient stock for product ${product.name || id}`);
  }

  client.update(products)
    .set({ currentStock: newStock.toString() })
    .where(eq(products.id, id))
    .run();
}

export async function updateProductStock(
  id: number,
  quantity: string,
  type: "add" | "subtract",
): Promise<void> {
  return updateProductStockOn(db, id, quantity, type);
}

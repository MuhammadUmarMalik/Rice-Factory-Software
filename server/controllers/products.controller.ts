import type { Request, Response } from "express";
import { z } from "zod";
import { productSchema, productUpdateSchema } from "../schemas/products.schema";
import * as productsService from "../services/products.service";
import { parseRequiredInt } from "../utils/parse";

export async function listProducts(req: Request, res: Response) {
  try {
    const products = await productsService.listProducts();
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
}

export async function getProduct(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid product id" });
    const product = await productsService.getProduct(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
}

export async function createProduct(req: Request, res: Response) {
  try {
    const parsed = productSchema.parse(req.body);
    const data = {
      ...parsed,
      currentStock: parsed.currentStock ?? "0",
      avgPurchasePrice: parsed.avgPurchasePrice ?? "0",
      salePrice: parsed.salePrice ?? "0",
    };
    const product = await productsService.createProduct(data);
    res.status(201).json(product);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create product" });
  }
}

export async function updateProduct(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid product id" });
    const parsed = productUpdateSchema.parse(req.body);
    // Older clients included these read-only values in every edit request.
    // Ignore them while preserving transaction-derived inventory balances.
    const {
      currentStock: _currentStock,
      avgPurchasePrice: _avgPurchasePrice,
      ...editableFields
    } = parsed;
    const data = Object.fromEntries(
      Object.entries(editableFields).filter(([, value]) => value !== undefined),
    );
    // A body carrying only read-only fields would otherwise reach the ORM with
    // an empty update set and fail as an unhandled 500.
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No editable fields were provided" });
    }
    const product = await productsService.updateProduct(id, data);
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
}

export async function deleteProduct(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid product id" });
    const deleted = await productsService.deleteProduct(id);
    if (!deleted) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.status(204).send();
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return res.status(409).json({
        error: "Cannot delete product because it is referenced by purchases, sales, or processing batches",
      });
    }
    // Unexpected failures are server-side; reporting them as 400 previously
    // both lied about the cause and leaked internal error text.
    console.error(error);
    res.status(500).json({ error: "Failed to delete product" });
  }
}

import type { Request, Response } from "express";
import { z } from "zod";
import { insertSaleSchema } from "../db/schema";
import { saleItemsSchema } from "../schemas/sales.schema";
import * as salesService from "../services/sales.service";
import { notifyLowStock, notifyUsers } from "../utils/notifications";
import { isBusinessRuleError } from "../utils/errors";
import { parseRequiredInt } from "../utils/parse";

const isFutureDate = (value: Date) => {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const check = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  return check.getTime() > todayStart.getTime();
};

const normalizeDate = (value: unknown) => {
  if (value == null || value === "") return undefined;
  return value instanceof Date ? value : new Date(value as any);
};

const dueDateIsBeforeTransaction = (dueDate: Date | undefined | null, transactionDate: Date | undefined | null) => {
  if (!dueDate || !transactionDate) return false;
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
  const transactionDay = new Date(
    transactionDate.getFullYear(),
    transactionDate.getMonth(),
    transactionDate.getDate(),
  ).getTime();
  return dueDay < transactionDay;
};

export async function listSales(req: Request, res: Response) {
  try {
    const sales = await salesService.listSales();
    res.json(sales);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch sales" });
  }
}

export async function getSale(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid sale id" });
    const sale = await salesService.getSale(id);
    if (!sale) {
      return res.status(404).json({ error: "Sale not found" });
    }
    res.json(sale);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch sale" });
  }
}

export async function createSale(req: Request, res: Response) {
  try {
    const { items, ...saleData } = req.body;
    const data = insertSaleSchema.parse({
      ...saleData,
      saleDate: normalizeDate((saleData as any).saleDate),
      dueDate: normalizeDate((saleData as any).dueDate),
    });
    if (data.saleDate && isFutureDate(data.saleDate)) {
      return res.status(400).json({ error: "Sale date cannot be in the future" });
    }
    if (dueDateIsBeforeTransaction(data.dueDate, data.saleDate ?? new Date())) {
      return res.status(400).json({ error: "Due date cannot be before the sale date" });
    }
    const parsedItems = saleItemsSchema.parse(items || []);
    const sale = await salesService.createSale(data, parsedItems);
    await notifyUsers({
      title: "Sale completed",
      message: `Sale ${sale.invoiceNumber} posted.`,
      type: "sale",
      entityType: "sale",
      entityId: sale.id,
    });
    try {
      await Promise.all(parsedItems.map((item: any) => notifyLowStock(item.productId)));
    } catch (notifyErr) {
      console.error("Low stock notification failed:", notifyErr);
    }
    res.status(201).json(sale);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (isBusinessRuleError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create sale" });
  }
}

export async function updateSale(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid sale id" });
    const existing = await salesService.getSale(id);
    if (!existing) {
      return res.status(404).json({ error: "Sale not found" });
    }
    const { items, ...saleData } = req.body;
    const data = insertSaleSchema.partial().parse({
      ...saleData,
      saleDate: normalizeDate((saleData as any).saleDate),
      dueDate: normalizeDate((saleData as any).dueDate),
    });
    if (data.saleDate && isFutureDate(data.saleDate)) {
      return res.status(400).json({ error: "Sale date cannot be in the future" });
    }
    if (dueDateIsBeforeTransaction(data.dueDate, data.saleDate ?? existing.saleDate)) {
      return res.status(400).json({ error: "Due date cannot be before the sale date" });
    }
    const parsedItems = saleItemsSchema.parse(items || []);
    const sale = await salesService.updateSale(id, data, parsedItems);
    if (!sale) return res.status(404).json({ error: "Sale not found" });
    res.json(sale);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (isBusinessRuleError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to update sale" });
  }
}

export async function deleteSale(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid sale id" });
    const ok = await salesService.deleteSale(id);
    if (!ok) return res.status(404).json({ error: "Sale not found" });
    res.status(204).send();
  } catch (error) {
    if (isBusinessRuleError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to delete sale" });
  }
}

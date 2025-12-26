import type { Request, Response } from "express";
import { z } from "zod";
import { insertSaleSchema } from "@shared/schema";
import { saleItemsSchema } from "../schemas/sales.schema";
import * as salesService from "../services/sales.service";
import { notifyLowStock, notifyUsers } from "../utils/notifications";

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
    const id = parseInt(req.params.id);
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
    const data = insertSaleSchema.parse(saleData);
    const parsedItems = saleItemsSchema.parse(items || []);
    const sale = await salesService.createSale(data, parsedItems);
    await notifyUsers({
      title: "Sale completed",
      message: `Sale ${sale.invoiceNumber} posted.`,
      type: "sale",
      entityType: "sale",
      entityId: sale.id,
    });
    await Promise.all(parsedItems.map((item: any) => notifyLowStock(item.productId)));
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
}

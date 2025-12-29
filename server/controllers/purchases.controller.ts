import type { Request, Response } from "express";
import { z } from "zod";
import {
  purchaseChargesSchema,
  purchaseInputSchema,
  purchaseItemsSchema,
} from "../schemas/purchases.schema";
import * as purchasesService from "../services/purchases.service";
import { getUserId } from "../utils/auth";
import { notifyUsers } from "../utils/notifications";
import { parseRequiredInt } from "../utils/parse";

export async function getNextBillNumber(_req: Request, res: Response) {
  try {
    const billNo = await purchasesService.getNextBillNumber();
    res.json({ billNo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get next bill number" });
  }
}

export async function listPurchases(req: Request, res: Response) {
  try {
    const purchases = await purchasesService.listPurchases();
    res.json(purchases);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch purchases" });
  }
}

export async function getPurchase(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid purchase id" });
    const purchase = await purchasesService.getPurchase(id);
    if (!purchase) {
      return res.status(404).json({ error: "Purchase not found" });
    }
    res.json(purchase);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch purchase" });
  }
}

export async function createPurchase(req: Request, res: Response) {
  try {
    const { items, charges, ...purchaseBody } = req.body;
    const data = purchaseInputSchema.parse(purchaseBody);
    const parsedItems = purchaseItemsSchema.parse(items || []);
    const parsedCharges = purchaseChargesSchema.parse(charges || []);
    const moundBaseKg = (data as any).moundBaseKg == 60 ? 60 : 40;
    const { moundBaseKg: _mb, ...purchaseData } = data as any;
    const purchase = await purchasesService.createPurchase(
      purchaseData,
      parsedItems,
      parsedCharges,
      moundBaseKg,
    );
    await notifyUsers({
      title: "New stock added",
      message: `Purchase ${purchase.invoiceNumber} received.`,
      type: "stock_added",
      entityType: "purchase",
      entityId: purchase.id,
    });
    res.status(201).json(purchase);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create purchase" });
  }
}

export async function updatePurchase(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid purchase id" });
    const { items, charges, ...purchaseBody } = req.body;
    const data = purchaseInputSchema.partial().parse(purchaseBody);
    const parsedItems = items ? purchaseItemsSchema.parse(items) : [];
    const parsedCharges = charges ? purchaseChargesSchema.parse(charges) : [];
    const moundBaseKg = (data as any).moundBaseKg == 60 ? 60 : 40;
    const { moundBaseKg: _mb, ...purchaseData } = data as any;
    const purchase = await purchasesService.updatePurchase(
      id,
      purchaseData,
      parsedItems,
      parsedCharges,
      moundBaseKg,
    );
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
}

export async function deletePurchase(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid purchase id" });
    const ok = await purchasesService.deletePurchase(id, getUserId(req));
    if (!ok) return res.status(404).json({ error: "Purchase not found" });
    res.json({ success: true, message: "Purchase deleted successfully" });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to delete purchase" });
  }
}

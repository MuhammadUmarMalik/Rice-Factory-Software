import type { Request, Response } from "express";
import { z } from "zod";
import {
  receiptHeaderSchema,
  receiptHeaderSchemaPartial,
  receiptLinesSchema,
} from "../schemas/receipts.schema";
import * as receiptsService from "../services/receipts.service";
import { notifyUsers } from "../utils/notifications";

export async function listReceipts(_req: Request, res: Response) {
  try {
    const vouchers = await receiptsService.listReceipts();
    res.json(vouchers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch vouchers" });
  }
}

export async function getNextReceiptNumber(req: Request, res: Response) {
  try {
    const type = (req.query.type as string) || "CR";
    const next = await receiptsService.getNextReceiptNumber(type);
    res.json({ voucherNumber: next });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch voucher number" });
  }
}

export async function getReceipt(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const voucher = await receiptsService.getReceipt(id);
    if (!voucher || voucher.voucherType != "CR") return res.status(404).json({ error: "Voucher not found" });
    res.json(voucher);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch voucher" });
  }
}

export async function createReceipt(req: Request, res: Response) {
  try {
    const { lines, ...payload } = req.body;
    const header = receiptHeaderSchema.parse({ ...payload, voucherType: "CR" });
    const parsedLines = receiptLinesSchema.parse(lines || []);
    const voucher = await receiptsService.createReceipt(header, parsedLines);
    await notifyUsers({
      title: "Payment received",
      message: `Receipt ${voucher.voucherNumber} recorded.`,
      type: "receipt",
      entityType: "receipt",
      entityId: voucher.id,
    });
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
}

export async function updateReceipt(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const current = await receiptsService.getReceipt(id);
    if (!current || current.voucherType != "CR") {
      return res.status(404).json({ error: "Voucher not found" });
    }
    const { lines, ...payload } = req.body;
    const header = receiptHeaderSchemaPartial.parse({ ...payload, voucherType: "CR" });
    const parsedLines = receiptLinesSchema.parse(lines || []);
    const voucher = await receiptsService.updateReceipt(id, header, parsedLines);
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
}

export async function deleteReceipt(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const current = await receiptsService.getReceipt(id);
    if (!current || current.voucherType != "CR") {
      return res.status(404).json({ error: "Voucher not found" });
    }
    const ok = await receiptsService.deleteReceipt(id);
    if (!ok) return res.status(404).json({ error: "Voucher not found" });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete voucher" });
  }
}

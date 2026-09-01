import type { Request, Response } from "express";
import { z } from "zod";
import {
  receiptHeaderSchema,
  receiptHeaderSchemaPartial,
  receiptLinesSchema,
} from "../schemas/receipts.schema";
import * as paymentsService from "../services/payments.service";
import { notifyUsers } from "../utils/notifications";
import { parseRequiredInt } from "../utils/parse";
import { isBusinessRuleError } from "../utils/errors";

export async function listPayments(_req: Request, res: Response) {
  try {
    const vouchers = await paymentsService.listPayments();
    res.json(vouchers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch vouchers" });
  }
}

export async function getNextPaymentNumber(_req: Request, res: Response) {
  try {
    const next = await paymentsService.getNextPaymentNumber();
    res.json({ voucherNumber: next });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch voucher number" });
  }
}

export async function getPayment(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid voucher id" });
    const voucher = await paymentsService.getPayment(id);
    if (!voucher || voucher.voucherType !== "CP") return res.status(404).json({ error: "Voucher not found" });
    res.json(voucher);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch voucher" });
  }
}

export async function createPayment(req: Request, res: Response) {
  try {
    const { lines, ...payload } = req.body;
    const header = receiptHeaderSchema.parse({ ...payload, voucherType: "CP" });
    const parsedLines = receiptLinesSchema.parse(lines || []);
    const voucher = await paymentsService.createPayment(header, parsedLines);
    await notifyUsers({
      title: "Payment completed",
      message: `Payment voucher ${voucher.voucherNumber} recorded.`,
      type: "payment",
      entityType: "payment",
      entityId: voucher.id,
    });
    res.status(201).json(voucher);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (isBusinessRuleError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create voucher" });
  }
}

export async function updatePayment(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid voucher id" });
    const current = await paymentsService.getPayment(id);
    if (!current || current.voucherType !== "CP") {
      return res.status(404).json({ error: "Voucher not found" });
    }
    const { lines, ...payload } = req.body;
    const header = receiptHeaderSchemaPartial.parse({ ...payload, voucherType: "CP" });
    const parsedLines = receiptLinesSchema.parse(lines || []);
    const voucher = await paymentsService.updatePayment(id, header, parsedLines);
    if (!voucher) return res.status(404).json({ error: "Voucher not found" });
    res.json(voucher);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (isBusinessRuleError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to update voucher" });
  }
}

export async function deletePayment(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid voucher id" });
    const current = await paymentsService.getPayment(id);
    if (!current || current.voucherType !== "CP") {
      return res.status(404).json({ error: "Voucher not found" });
    }
    const ok = await paymentsService.deletePayment(id);
    if (!ok) return res.status(404).json({ error: "Voucher not found" });
    res.status(204).send();
  } catch (error) {
    if (isBusinessRuleError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to delete voucher" });
  }
}

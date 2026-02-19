import type { Request, Response } from "express";
import * as cashService from "../services/cash-in-hand.service";

export async function getBalance(req: Request, res: Response) {
  try {
    const date = req.query.date as string | undefined;
    const cashAccountId = parseInt(req.query.cashAccountId as string, 10) || 1;
    const result = await cashService.getBalance(cashAccountId, date);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch cash balance" });
  }
}

export async function getReceipts(req: Request, res: Response) {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const cashAccountId = req.query.cashAccountId ? parseInt(req.query.cashAccountId as string, 10) : undefined;
    const result = await cashService.getReceipts({ from, to, cashAccountId });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch receipts" });
  }
}

export async function getReceiptById(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await cashService.getReceiptById(id);
    if (!result) return res.status(404).json({ error: "Receipt not found" });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch receipt" });
  }
}

export async function createReceipt(req: Request, res: Response) {
  try {
    const result = await cashService.createReceipt(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    const msg = error?.message || "Failed to create receipt";
    if (msg.includes("Amount")) return res.status(400).json({ error: msg });
    console.error(error);
    res.status(500).json({ error: msg });
  }
}

export async function updateReceipt(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await cashService.updateReceipt(id, req.body);
    if (!result) return res.status(404).json({ error: "Receipt not found" });
    res.json(result);
  } catch (error: any) {
    const msg = error?.message || "Failed to update receipt";
    if (msg.includes("linked")) return res.status(400).json({ error: msg });
    if (msg.includes("Amount")) return res.status(400).json({ error: msg });
    console.error(error);
    res.status(500).json({ error: msg });
  }
}

export async function deleteReceipt(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await cashService.deleteReceipt(id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete receipt" });
  }
}

export async function getPayments(req: Request, res: Response) {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const cashAccountId = req.query.cashAccountId ? parseInt(req.query.cashAccountId as string, 10) : undefined;
    const result = await cashService.getPayments({ from, to, cashAccountId });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
}

export async function getPaymentById(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await cashService.getPaymentById(id);
    if (!result) return res.status(404).json({ error: "Payment not found" });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch payment" });
  }
}

export async function createPayment(req: Request, res: Response) {
  try {
    const result = await cashService.createPayment(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    const msg = error?.message || "Failed to create payment";
    if (msg.includes("Amount")) return res.status(400).json({ error: msg });
    console.error(error);
    res.status(500).json({ error: msg });
  }
}

export async function updatePayment(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await cashService.updatePayment(id, req.body);
    if (!result) return res.status(404).json({ error: "Payment not found" });
    res.json(result);
  } catch (error: any) {
    const msg = error?.message || "Failed to update payment";
    if (msg.includes("linked")) return res.status(400).json({ error: msg });
    if (msg.includes("Amount")) return res.status(400).json({ error: msg });
    console.error(error);
    res.status(500).json({ error: msg });
  }
}

export async function deletePayment(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await cashService.deletePayment(id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete payment" });
  }
}

export async function getLedger(req: Request, res: Response) {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const cashAccountId = req.query.cashAccountId ? parseInt(req.query.cashAccountId as string, 10) : undefined;
    const result = await cashService.getLedger({ from, to, cashAccountId });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch ledger" });
  }
}

export async function getSummary(req: Request, res: Response) {
  try {
    const cashAccountId = req.query.cashAccountId ? parseInt(req.query.cashAccountId as string, 10) : 1;
    const result = await cashService.getTodaySummary(cashAccountId);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
}


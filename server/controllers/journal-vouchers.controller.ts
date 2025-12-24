import type { Request, Response } from "express";
import { z } from "zod";
import { journalVoucherInputSchema } from "../schemas/journal.schema";
import * as journalService from "../services/journal-vouchers.service";

export async function listJournalVouchers(_req: Request, res: Response) {
  try {
    const vouchers = await journalService.listJournalVouchers();
    res.json(vouchers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch journal vouchers" });
  }
}

export async function getNextJournalNumber(_req: Request, res: Response) {
  try {
    const voucherNo = await journalService.getNextJournalNumber();
    res.json({ voucherNo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch voucher number" });
  }
}

export async function getJournalVoucher(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const voucher = await journalService.getJournalVoucher(id);
    if (!voucher) return res.status(404).json({ error: "Voucher not found" });
    res.json(voucher);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch voucher" });
  }
}

export async function createJournalVoucher(req: Request, res: Response) {
  try {
    const parsed = journalVoucherInputSchema.parse(req.body);
    const voucher = await journalService.createJournalVoucher(parsed);
    res.status(201).json(voucher);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create journal voucher" });
  }
}

export async function updateJournalVoucher(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const parsed = journalVoucherInputSchema.parse(req.body);
    const voucher = await journalService.updateJournalVoucher(id, parsed);
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
    res.status(500).json({ error: "Failed to update journal voucher" });
  }
}

export async function approveJournalVoucher(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const approverIdRaw = req.body?.approvedBy;
    const approverId = approverIdRaw ? parseInt(approverIdRaw) : undefined;
    const voucher = await journalService.approveJournalVoucher(id, approverId);
    if (!voucher) return res.status(404).json({ error: "Voucher not found" });
    res.json(voucher);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to approve journal voucher" });
  }
}

export async function deleteJournalVoucher(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const ok = await journalService.deleteJournalVoucher(id);
    if (!ok) return res.status(404).json({ error: "Voucher not found" });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to delete journal voucher" });
  }
}

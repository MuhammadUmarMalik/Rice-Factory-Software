import type { Request, Response } from "express";
import * as ledgerService from "../services/ledger.service";
import * as ledgerModel from "../models/ledger.model";

function parseDateQuery(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00`;
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt;
}

export async function getLedger(req: Request, res: Response) {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }
    const scope = (req.query.scope as string) || "";
    const voucherType = typeof req.query.voucherType == "string" ? req.query.voucherType : undefined;
    const narration = typeof req.query.narration == "string" ? req.query.narration : undefined;
    const startDate = parseDateQuery(typeof req.query.startDate === "string" ? req.query.startDate : undefined);
    const endDate = parseDateQuery(typeof req.query.endDate === "string" ? req.query.endDate : undefined);
    const report = await ledgerService.getLedgerReport({
      accountId,
      scope,
      voucherType,
      startDate,
      endDate,
      narration,
    });
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch ledger entries" });
  }
}

export async function toggleCleared(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id as string);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const cleared = await ledgerModel.toggleLedgerEntryCleared(id);
    res.json({ id, cleared });
  } catch (error: any) {
    if (error?.message === "Ledger entry not found") {
      return res.status(404).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to update cleared status" });
  }
}

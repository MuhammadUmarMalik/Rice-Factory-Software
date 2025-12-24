import type { Request, Response } from "express";
import * as ledgerService from "../services/ledger.service";

export async function getLedger(req: Request, res: Response) {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }
    const scope = (req.query.scope as string) || "";
    const voucherType = typeof req.query.voucherType == "string" ? req.query.voucherType : undefined;
    const narration = typeof req.query.narration == "string" ? req.query.narration : undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
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

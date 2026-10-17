import type { Request, Response } from "express";
import { getProductLedger } from "../models/product-ledger.model";

export function getProductLedgerReport(req: Request, res: Response) {
  const { productId, type, startDate, endDate } = req.query;

  const report = getProductLedger({
    productId: productId ? Number(productId) : undefined,
    type: type === "raw" || type === "bio" ? type : undefined,
    startDate: startDate ? String(startDate) : undefined,
    endDate: endDate ? String(endDate) : undefined,
  });

  res.json(report);
}

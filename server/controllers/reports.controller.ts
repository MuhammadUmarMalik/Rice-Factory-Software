import type { Request, Response } from "express";
import * as reportsService from "../services/reports.service";
import { parseOptionalDate, parseOptionalInt } from "../utils/parse";

export async function stockReport(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const productId = parseOptionalInt(req.query.productId);
    const category = typeof req.query.category == "string" ? req.query.category : undefined;
    const unit = typeof req.query.unit == "string" ? req.query.unit : undefined;
    const report = await reportsService.getStockReport({ fromDate, toDate, productId, category, unit });
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch stock report" });
  }
}

export async function trialBalance(req: Request, res: Response) {
  try {
    const asOfDate = parseOptionalDate(req.query.asOfDate);
    const report = await reportsService.getTrialBalance(asOfDate);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch trial balance" });
  }
}

export async function profitLoss(req: Request, res: Response) {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const report = await reportsService.getProfitLoss(startDate, endDate);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch profit/loss report" });
  }
}

export async function purchaseReport(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const supplierId = parseOptionalInt(req.query.supplierId);
    const productId = parseOptionalInt(req.query.productId);
    const status = typeof req.query.paymentStatus == "string" ? req.query.paymentStatus : undefined;
    const report = await reportsService.getPurchaseReport({
      fromDate,
      toDate,
      supplierId,
      productId,
      paymentStatus: status as any,
    });
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch purchase report" });
  }
}

export async function salesReport(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const customerId = parseOptionalInt(req.query.customerId);
    const productId = parseOptionalInt(req.query.productId);
    const status = typeof req.query.paymentStatus == "string" ? req.query.paymentStatus : undefined;
    const report = await reportsService.getSalesReport({
      fromDate,
      toDate,
      customerId,
      productId,
      paymentStatus: status as any,
    });
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch sales report" });
  }
}

export async function periodPurchases(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate) ?? new Date(0);
    const toDate = parseOptionalDate(req.query.toDate) ?? new Date(9999, 11, 31);
    const supplierId = parseOptionalInt(req.query.supplierId);
    const groupBy = typeof req.query.groupBy == "string" ? (req.query.groupBy as any) : "month";
    const report = await reportsService.getPeriodPurchases(fromDate, toDate, supplierId, groupBy);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function periodSales(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate) ?? new Date(0);
    const toDate = parseOptionalDate(req.query.toDate) ?? new Date(9999, 11, 31);
    const customerId = parseOptionalInt(req.query.customerId);
    const groupBy = typeof req.query.groupBy == "string" ? (req.query.groupBy as any) : "month";
    const report = await reportsService.getPeriodSales(fromDate, toDate, customerId, groupBy);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function grossProfit(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate) ?? new Date(0);
    const toDate = parseOptionalDate(req.query.toDate) ?? new Date(9999, 11, 31);
    const report = await reportsService.getGrossProfit(fromDate, toDate);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function dayBook(req: Request, res: Response) {
  try {
    const date = parseOptionalDate(req.query.date)
      ?? parseOptionalDate(req.query.fromDate)
      ?? new Date();
    const report = await reportsService.getDayBook(date);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function outstandingCustomers(req: Request, res: Response) {
  try {
    const asOfDate = parseOptionalDate(req.query.asOfDate) ?? new Date();
    const customerId = parseOptionalInt(req.query.customerId);
    const report = await reportsService.getOutstandingCustomers(asOfDate, customerId);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function outstandingSuppliers(req: Request, res: Response) {
  try {
    const asOfDate = parseOptionalDate(req.query.asOfDate) ?? new Date();
    const supplierId = parseOptionalInt(req.query.supplierId);
    const report = await reportsService.getOutstandingSuppliers(asOfDate, supplierId);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function bardanaReport(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const supplierId = parseOptionalInt(req.query.supplierId);
    const report = await reportsService.getBardanaReport({ fromDate, toDate, supplierId });
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch bardana report" });
  }
}

export async function lessReport(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const supplierId = parseOptionalInt(req.query.supplierId);
    const report = await reportsService.getLessReport({ fromDate, toDate, supplierId });
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch less report" });
  }
}

export async function reportDetail(req: Request, res: Response) {
  try {
    const type = (req.query.type as string) || "";
    const id = parseOptionalInt(req.query.id);
    if (!id) return res.status(400).json({ error: "id is required" });
    const detail = await reportsService.getReportDetail(type, id);
    if (!detail) return res.status(404).json({ error: "Detail not found" });
    res.json(detail);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

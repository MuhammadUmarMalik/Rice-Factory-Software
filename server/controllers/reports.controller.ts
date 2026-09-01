import type { Request, Response } from "express";
import * as reportsService from "../services/reports.service";
import { parseOptionalDate, parseOptionalInt } from "../utils/parse";
import { z } from "zod";
import { isBusinessRuleError } from "../utils/errors";

const paymentStatusSchema = z.enum(["paid", "unpaid", "partial"]);
const groupBySchema = z.enum(["day", "week", "month", "year"]);
function assertDateRange(fromDate?: Date, toDate?: Date) {
  if (fromDate && toDate && fromDate > toDate) throw new Error("fromDate must be before or equal to toDate");
}

/**
 * Every report handler used to answer 400 with the raw error text, which
 * mislabelled genuine server faults as client errors and leaked internals.
 * Only invalid input (zod / business rule) is a 400; anything else is a 500.
 */
function respondReportError(res: Response, error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors });
  }
  if (isBusinessRuleError(error)) {
    return res.status(400).json({ error: error.message });
  }
  console.error(error);
  return res.status(500).json({ error: fallback });
}

export async function stockReport(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const productId = parseOptionalInt(req.query.productId);
    const category = typeof req.query.category == "string" ? req.query.category : undefined;
    const unit = typeof req.query.unit == "string" ? req.query.unit : undefined;
    assertDateRange(fromDate, toDate);
    const report = await reportsService.getStockReport({ fromDate, toDate, productId, category, unit });
    res.json(report);
  } catch (error) {
    return respondReportError(res, error, "Failed to build stock report");
  }
}

export async function trialBalance(req: Request, res: Response) {
  try {
    const asOfDate = parseOptionalDate(req.query.asOfDate);
    const report = await reportsService.getTrialBalance(asOfDate);
    res.json(report);
  } catch (error) {
    return respondReportError(res, error, "Failed to build trial balance");
  }
}

export async function profitLoss(req: Request, res: Response) {
  try {
    const startDate = parseOptionalDate(req.query.startDate);
    const endDate = parseOptionalDate(req.query.endDate);
    assertDateRange(startDate, endDate);
    const report = await reportsService.getProfitLoss(startDate, endDate);
    res.json(report);
  } catch (error) {
    return respondReportError(res, error, "Failed to build profit and loss report");
  }
}

export async function purchaseReport(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const supplierId = parseOptionalInt(req.query.supplierId);
    const productId = parseOptionalInt(req.query.productId);
    const status = req.query.paymentStatus ? paymentStatusSchema.parse(req.query.paymentStatus) : undefined;
    assertDateRange(fromDate, toDate);
    const report = await reportsService.getPurchaseReport({
      fromDate,
      toDate,
      supplierId,
      productId,
      paymentStatus: status,
    });
    res.json(report);
  } catch (error) {
    return respondReportError(res, error, "Failed to build purchase report");
  }
}

export async function salesReport(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const customerId = parseOptionalInt(req.query.customerId);
    const productId = parseOptionalInt(req.query.productId);
    const status = req.query.paymentStatus ? paymentStatusSchema.parse(req.query.paymentStatus) : undefined;
    assertDateRange(fromDate, toDate);
    const report = await reportsService.getSalesReport({
      fromDate,
      toDate,
      customerId,
      productId,
      paymentStatus: status,
    });
    res.json(report);
  } catch (error) {
    return respondReportError(res, error, "Failed to build sales report");
  }
}

export async function periodPurchases(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate) ?? new Date(0);
    const toDate = parseOptionalDate(req.query.toDate) ?? new Date(9999, 11, 31);
    const supplierId = parseOptionalInt(req.query.supplierId);
    const groupBy = groupBySchema.parse(req.query.groupBy ?? "month");
    assertDateRange(fromDate, toDate);
    const report = await reportsService.getPeriodPurchases(fromDate, toDate, supplierId, groupBy);
    res.json(report);
  } catch (error) {
    return respondReportError(res, error, "Failed to build period purchases report");
  }
}

export async function periodSales(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate) ?? new Date(0);
    const toDate = parseOptionalDate(req.query.toDate) ?? new Date(9999, 11, 31);
    const customerId = parseOptionalInt(req.query.customerId);
    const groupBy = groupBySchema.parse(req.query.groupBy ?? "month");
    assertDateRange(fromDate, toDate);
    const report = await reportsService.getPeriodSales(fromDate, toDate, customerId, groupBy);
    res.json(report);
  } catch (error) {
    return respondReportError(res, error, "Failed to build period sales report");
  }
}

export async function grossProfit(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate) ?? new Date(0);
    const toDate = parseOptionalDate(req.query.toDate) ?? new Date(9999, 11, 31);
    const report = await reportsService.getGrossProfit(fromDate, toDate);
    res.json(report);
  } catch (error) {
    return respondReportError(res, error, "Failed to build gross profit report");
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
    return respondReportError(res, error, "Failed to build day book");
  }
}

export async function outstandingCustomers(req: Request, res: Response) {
  try {
    const asOfDate = parseOptionalDate(req.query.asOfDate) ?? new Date();
    const customerId = parseOptionalInt(req.query.customerId);
    const report = await reportsService.getOutstandingCustomers(asOfDate, customerId);
    res.json(report);
  } catch (error) {
    return respondReportError(res, error, "Failed to build outstanding customers report");
  }
}

export async function outstandingSuppliers(req: Request, res: Response) {
  try {
    const asOfDate = parseOptionalDate(req.query.asOfDate) ?? new Date();
    const supplierId = parseOptionalInt(req.query.supplierId);
    const report = await reportsService.getOutstandingSuppliers(asOfDate, supplierId);
    res.json(report);
  } catch (error) {
    return respondReportError(res, error, "Failed to build outstanding suppliers report");
  }
}

export async function bardanaReport(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const supplierId = parseOptionalInt(req.query.supplierId);
    assertDateRange(fromDate, toDate);
    const report = await reportsService.getBardanaReport({ fromDate, toDate, supplierId });
    res.json(report);
  } catch (error) {
    return respondReportError(res, error, "Failed to build bardana report");
  }
}

export async function lessReport(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const supplierId = parseOptionalInt(req.query.supplierId);
    assertDateRange(fromDate, toDate);
    const report = await reportsService.getLessReport({ fromDate, toDate, supplierId });
    res.json(report);
  } catch (error) {
    return respondReportError(res, error, "Failed to build less report");
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
    return respondReportError(res, error, "Failed to fetch report detail");
  }
}

import type { Request, Response } from "express";
import { z } from "zod";
import {
  cashBookInputSchema,
  daybookQuerySchema,
  generalJournalInputSchema,
  migrationPayloadSchema,
  purchaseReturnsDaybookInputSchema,
  purchasesDaybookInputSchema,
  salesDaybookInputSchema,
  salesReturnsDaybookInputSchema,
} from "../schemas/daybooks.schema";
import * as service from "../services/daybooks.service";
import { getUserId } from "../utils/auth";
import { parseRequiredInt } from "../utils/parse";

function sendZodError(error: unknown, res: Response) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors });
  }
  return null;
}

function parseFilters(req: Request) {
  const parsed = daybookQuerySchema.parse(req.query);
  return {
    ...parsed,
    limit: parsed.limit ? Number(parsed.limit) : undefined,
    offset: parsed.offset ? Number(parsed.offset) : undefined,
  };
}

async function listHandler(req: Request, res: Response, fn: (filters: any) => any) {
  try {
    const rows = fn(parseFilters(req));
    res.json(rows);
  } catch (error) {
    const handled = sendZodError(error, res);
    if (handled) return handled;
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch entries" });
  }
}

async function getHandler(req: Request, res: Response, fn: (id: number) => any) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const row = fn(id);
    if (!row) return res.status(404).json({ error: "Entry not found" });
    return res.json(row);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch entry" });
  }
}

async function createHandler(req: Request, res: Response, schema: z.ZodTypeAny, fn: (input: any, userId?: number) => any) {
  try {
    const parsed = schema.parse(req.body);
    const row = fn(parsed, getUserId(req));
    return res.status(201).json(row);
  } catch (error) {
    const handled = sendZodError(error, res);
    if (handled) return handled;
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: "Failed to create entry" });
  }
}

async function updateHandler(req: Request, res: Response, schema: z.ZodTypeAny, fn: (id: number, input: any, userId?: number) => any) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const parsed = (schema as z.AnyZodObject).partial().parse(req.body);
    const row = fn(id, parsed, getUserId(req));
    if (!row) return res.status(404).json({ error: "Entry not found" });
    return res.json(row);
  } catch (error) {
    const handled = sendZodError(error, res);
    if (handled) return handled;
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: "Failed to update entry" });
  }
}

async function deleteHandler(req: Request, res: Response, fn: (id: number, userId?: number) => boolean) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const ok = fn(id, getUserId(req));
    if (!ok) return res.status(404).json({ error: "Entry not found" });
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete entry" });
  }
}

export const listSalesDaybook = (req: Request, res: Response) => listHandler(req, res, service.listSalesDaybook);
export const getSalesDaybook = (req: Request, res: Response) => getHandler(req, res, service.getSalesDaybook);
export const createSalesDaybook = (req: Request, res: Response) => createHandler(req, res, salesDaybookInputSchema, service.createSalesDaybook);
export const updateSalesDaybook = (req: Request, res: Response) => updateHandler(req, res, salesDaybookInputSchema, service.updateSalesDaybook);
export const deleteSalesDaybook = (req: Request, res: Response) => deleteHandler(req, res, service.deleteSalesDaybook);

export async function salesCustomerSummary(req: Request, res: Response) {
  try {
    const rows = service.getSalesCustomerSummary(parseFilters(req));
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load summary" });
  }
}

export async function salesAging(req: Request, res: Response) {
  try {
    const asOf = req.query.asOf ? String(req.query.asOf) : undefined;
    const rows = service.getSalesAging(asOf);
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load aging report" });
  }
}

export const listPurchasesDaybook = (req: Request, res: Response) => listHandler(req, res, service.listPurchasesDaybook);
export const getPurchasesDaybook = (req: Request, res: Response) => getHandler(req, res, service.getPurchasesDaybook);
export const createPurchasesDaybook = (req: Request, res: Response) => createHandler(req, res, purchasesDaybookInputSchema, service.createPurchasesDaybook);
export const updatePurchasesDaybook = (req: Request, res: Response) => updateHandler(req, res, purchasesDaybookInputSchema, service.updatePurchasesDaybook);
export const deletePurchasesDaybook = (req: Request, res: Response) => deleteHandler(req, res, service.deletePurchasesDaybook);

export async function purchasesSupplierSummary(req: Request, res: Response) {
  try {
    const rows = service.getPurchasesSupplierSummary(parseFilters(req));
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load summary" });
  }
}

export async function outstandingPayables(req: Request, res: Response) {
  try {
    const rows = service.getOutstandingPayables(parseFilters(req));
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load payables" });
  }
}

export const listCashBook = (req: Request, res: Response) => listHandler(req, res, service.listCashBook);
export const getCashBook = (req: Request, res: Response) => getHandler(req, res, service.getCashBook);
export const createCashBook = (req: Request, res: Response) => createHandler(req, res, cashBookInputSchema, service.createCashBook);
export const updateCashBook = (req: Request, res: Response) => updateHandler(req, res, cashBookInputSchema, service.updateCashBook);
export const deleteCashBook = (req: Request, res: Response) => deleteHandler(req, res, service.deleteCashBook);

export async function cashBalances(_req: Request, res: Response) {
  try {
    return res.json(service.getCashBookBalances());
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load balances" });
  }
}

export const listSalesReturnsDaybook = (req: Request, res: Response) => listHandler(req, res, service.listSalesReturnsDaybook);
export const getSalesReturnsDaybook = (req: Request, res: Response) => getHandler(req, res, service.getSalesReturnsDaybook);
export const createSalesReturnsDaybook = (req: Request, res: Response) => createHandler(req, res, salesReturnsDaybookInputSchema, service.createSalesReturnsDaybook);
export const updateSalesReturnsDaybook = (req: Request, res: Response) => updateHandler(req, res, salesReturnsDaybookInputSchema, service.updateSalesReturnsDaybook);
export const deleteSalesReturnsDaybook = (req: Request, res: Response) => deleteHandler(req, res, service.deleteSalesReturnsDaybook);

export const listPurchaseReturnsDaybook = (req: Request, res: Response) => listHandler(req, res, service.listPurchaseReturnsDaybook);
export const getPurchaseReturnsDaybook = (req: Request, res: Response) => getHandler(req, res, service.getPurchaseReturnsDaybook);
export const createPurchaseReturnsDaybook = (req: Request, res: Response) => createHandler(req, res, purchaseReturnsDaybookInputSchema, service.createPurchaseReturnsDaybook);
export const updatePurchaseReturnsDaybook = (req: Request, res: Response) => updateHandler(req, res, purchaseReturnsDaybookInputSchema, service.updatePurchaseReturnsDaybook);
export const deletePurchaseReturnsDaybook = (req: Request, res: Response) => deleteHandler(req, res, service.deletePurchaseReturnsDaybook);

export const listGeneralJournal = (req: Request, res: Response) => listHandler(req, res, service.listGeneralJournal);
export const getGeneralJournal = (req: Request, res: Response) => getHandler(req, res, service.getGeneralJournal);
export const createGeneralJournal = (req: Request, res: Response) => createHandler(req, res, generalJournalInputSchema, service.createGeneralJournal);
export const updateGeneralJournal = (req: Request, res: Response) => updateHandler(req, res, generalJournalInputSchema, service.updateGeneralJournal);
export const deleteGeneralJournal = (req: Request, res: Response) => deleteHandler(req, res, service.deleteGeneralJournal);

export async function reverseGeneralJournal(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const row = service.reverseGeneralJournal(id, getUserId(req));
    if (!row) return res.status(404).json({ error: "Entry not found" });
    return res.json(row);
  } catch (error) {
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: "Failed to reverse entry" });
  }
}

export async function cancelGeneralJournal(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const row = service.cancelGeneralJournal(id, getUserId(req));
    if (!row) return res.status(404).json({ error: "Entry not found" });
    return res.json(row);
  } catch (error) {
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: "Failed to cancel entry" });
  }
}

export async function exportDaybook(req: Request, res: Response) {
  try {
    const kind = String(req.params.kind) as any;
    const csv = service.exportDaybookCsv(kind, parseFilters(req));
    const safeKind = kind.replace(/[^a-zA-Z0-9-]/g, "");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeKind}_daybook_export.csv"`);
    return res.send(csv);
  } catch (error) {
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: "Failed to export daybook" });
  }
}

export async function daybookAudit(req: Request, res: Response) {
  try {
    const daybookType = req.query.daybookType ? String(req.query.daybookType) : undefined;
    const recordId = req.query.recordId ? Number(req.query.recordId) : undefined;
    return res.json(service.getDaybookAudit(daybookType, recordId));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load audit logs" });
  }
}

export async function daybookDashboardSummary(_req: Request, res: Response) {
  try {
    return res.json(service.getDaybookDashboardSummary());
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load daybook dashboard" });
  }
}

export async function migrateLegacyDaybook(req: Request, res: Response) {
  try {
    const parsed = migrationPayloadSchema.parse(req.body || {});
    const result = service.migrateLegacyDayBook(parsed.migrationDate, getUserId(req));
    return res.json(result);
  } catch (error) {
    const handled = sendZodError(error, res);
    if (handled) return handled;
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: "Failed to migrate data" });
  }
}

import type { Request, Response } from "express";
import * as fiscalService from "../services/fiscal-years.service";
import { parseRequiredDate, parseRequiredInt } from "../utils/parse";
import { getUserId, getUserRole } from "../utils/auth";

export async function listFiscalYears(_req: Request, res: Response) {
  try {
    const years = await fiscalService.listFiscalYears();
    res.json(years);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch fiscal years" });
  }
}

export async function listFiscalPeriods(req: Request, res: Response) {
  try {
    const fiscalYearId = parseRequiredInt(req.params.id, "id");
    if (fiscalYearId === undefined) return res.status(400).json({ error: "Invalid fiscal year id" });
    const periods = await fiscalService.listFiscalPeriods(fiscalYearId);
    res.json(periods);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch fiscal periods" });
  }
}

export async function createFiscalYear(req: Request, res: Response) {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "name is required" });
    const startDate = parseRequiredDate(req.body?.startDate, "startDate");
    const endDate = parseRequiredDate(req.body?.endDate, "endDate");
    const status = req.body?.status as "draft" | "open" | "closed" | undefined;
    const created = await fiscalService.createFiscalYear(
      { name, startDate, endDate, status },
      { userId: getUserId(req), role: getUserRole(req) },
    );
    res.json(created);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message || "Failed to create fiscal year" });
  }
}

export async function updateFiscalYearStatus(req: Request, res: Response) {
  try {
    const fiscalYearId = parseRequiredInt(req.params.id, "id");
    if (fiscalYearId === undefined) return res.status(400).json({ error: "Invalid fiscal year id" });
    const status = req.body?.status as "draft" | "open" | "closed" | undefined;
    if (!status || !["draft", "open", "closed"].includes(status)) {
      return res.status(400).json({ error: "status is required" });
    }
    const updated = await fiscalService.setFiscalYearStatus(
      fiscalYearId,
      status,
      { userId: getUserId(req), role: getUserRole(req) },
    );
    if (!updated) return res.status(404).json({ error: "Fiscal year not found" });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message || "Failed to update fiscal year status" });
  }
}

export async function updateFiscalPeriodClosed(req: Request, res: Response) {
  try {
    const periodId = parseRequiredInt(req.params.id, "id");
    if (periodId === undefined) return res.status(400).json({ error: "Invalid fiscal period id" });
    const isClosed = req.body?.isClosed;
    if (typeof isClosed !== "boolean") {
      return res.status(400).json({ error: "isClosed is required" });
    }
    const updated = await fiscalService.setFiscalPeriodClosed(
      periodId,
      isClosed,
      { userId: getUserId(req), role: getUserRole(req) },
    );
    if (!updated) return res.status(404).json({ error: "Fiscal period not found" });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message || "Failed to update fiscal period" });
  }
}

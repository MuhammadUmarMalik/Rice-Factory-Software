import type { Request, Response } from "express";
import * as financialService from "../services/financial.service";
import { parseOptionalDate, parseRequiredDate } from "../utils/parse";

export async function incomeStatement(req: Request, res: Response) {
  try {
    const fromDate = parseRequiredDate(req.query.fromDate, "fromDate");
    const toDate = parseRequiredDate(req.query.toDate, "toDate");
    const report = await financialService.getIncomeStatement(fromDate, toDate);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function balanceSheet(req: Request, res: Response) {
  try {
    const asOfDate = parseOptionalDate(req.query.asOfDate) ?? new Date();
    const report = await financialService.getBalanceSheet(asOfDate);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function capitalStatement(req: Request, res: Response) {
  try {
    const fromDate = parseRequiredDate(req.query.fromDate, "fromDate");
    const toDate = parseRequiredDate(req.query.toDate, "toDate");
    const report = await financialService.getCapitalStatement(fromDate, toDate);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function salaryStatement(req: Request, res: Response) {
  try {
    const fromDate = parseRequiredDate(req.query.fromDate, "fromDate");
    const toDate = parseRequiredDate(req.query.toDate, "toDate");
    const report = await financialService.getSalaryAccount(fromDate, toDate);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

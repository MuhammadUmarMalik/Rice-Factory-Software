import type { Request, Response } from "express";
import * as financialService from "../services/financial.service";
import { parseOptionalDate } from "../utils/parse";

export async function incomeStatement(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate) ?? new Date(0);
    const toDate = parseOptionalDate(req.query.toDate) ?? new Date(9999, 11, 31);
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
    const fromDate = parseOptionalDate(req.query.fromDate) ?? new Date(0);
    const toDate = parseOptionalDate(req.query.toDate) ?? new Date(9999, 11, 31);
    const report = await financialService.getCapitalStatement(fromDate, toDate);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function salaryStatement(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate) ?? new Date(0);
    const toDate = parseOptionalDate(req.query.toDate) ?? new Date(9999, 11, 31);
    const report = await financialService.getSalaryAccount(fromDate, toDate);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

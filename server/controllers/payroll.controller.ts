import type { Request, Response } from "express";
import { z } from "zod";
import { payrollMonthSchema, payrollPaymentSchema } from "../schemas/payroll.schema";
import * as payrollService from "../services/payroll.service";
import { getUserId, getUserRole } from "../utils/auth";
import { parseOptionalDate, parseOptionalInt, parseRequiredInt } from "../utils/parse";

export async function listPayrolls(req: Request, res: Response) {
  try {
    const month = typeof req.query.month == "string" ? req.query.month : undefined;
    const status = typeof req.query.status == "string" ? req.query.status : undefined;
    const employeeId = parseOptionalInt(req.query.employeeId);
    const rows = await payrollService.listPayrolls({ month, status, employeeId });
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch payrolls" });
  }
}

export async function generatePayroll(req: Request, res: Response) {
  try {
    const { payrollMonth } = payrollMonthSchema.parse(req.body);
    const result = await payrollService.generatePayroll(payrollMonth, {
      userId: getUserId(req),
      role: getUserRole(req),
    });
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error(error);
    res.status(500).json({ error: "Failed to generate payroll" });
  }
}

export async function approvePayroll(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid payroll id" });
    const postingDate = parseOptionalDate(req.body?.postingDate);
    const updated = await payrollService.approvePayroll(
      id,
      { userId: getUserId(req), role: getUserRole(req) },
      postingDate,
    );
    if (!updated) return res.status(404).json({ error: "Payroll not found" });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to approve payroll" });
  }
}

export async function paySalary(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid payroll id" });
    const payload = payrollPaymentSchema.parse(req.body);
    const paymentDate = parseOptionalDate(payload.paymentDate);
    const updated = await payrollService.paySalary(
      id,
      { method: payload.method, paymentAccountId: payload.paymentAccountId, paymentDate },
      { userId: getUserId(req), role: getUserRole(req) },
    );
    if (!updated) return res.status(404).json({ error: "Payroll not found" });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error(error);
    res.status(500).json({ error: "Failed to pay salary" });
  }
}

export async function getPayrollAudit(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid payroll id" });
    const rows = await payrollService.getPayrollAudit(id);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch audit trail" });
  }
}

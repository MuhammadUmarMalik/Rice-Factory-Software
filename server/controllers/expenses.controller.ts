import type { Request, Response } from "express";
import { z } from "zod";
import { expenseEntrySchema, expenseEntryUpdateSchema } from "../schemas/expenses.schema";
import { createExpense, deleteExpense, listExpenses, updateExpense } from "../services/expenses.service";
import { getUserId, getUserRole } from "../utils/auth";
import { parseRequiredInt } from "../utils/parse";
import { isBusinessRuleError } from "../utils/errors";

export async function listExpensesHandler(_req: Request, res: Response) {
  try {
    const rows = await listExpenses();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
}

export async function createExpenseHandler(req: Request, res: Response) {
  try {
    const parsed = expenseEntrySchema.parse(req.body);
    const created = await createExpense(parsed, { userId: getUserId(req), role: getUserRole(req) });
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (isBusinessRuleError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create expense" });
  }
}

export async function updateExpenseHandler(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid expense id" });
    const parsed = expenseEntryUpdateSchema.parse(req.body);
    const updated = await updateExpense(id, parsed, { userId: getUserId(req), role: getUserRole(req) });
    if (!updated) return res.status(404).json({ error: "Expense not found" });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (isBusinessRuleError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to update expense" });
  }
}

export async function deleteExpenseHandler(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid expense id" });
    const ok = await deleteExpense(id);
    if (!ok) return res.status(404).json({ error: "Expense not found" });
    res.status(204).send();
  } catch (error) {
    if (isBusinessRuleError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
}

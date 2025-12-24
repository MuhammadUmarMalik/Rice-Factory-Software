import type { Request, Response } from "express";
import { z } from "zod";
import { expenseEntrySchema } from "../schemas/expenses.schema";
import { createExpense, listExpenses } from "../services/expenses.service";
import { getUserId, getUserRole } from "../utils/auth";

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
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create expense" });
  }
}

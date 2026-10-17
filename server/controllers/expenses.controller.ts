import type { Request, Response } from "express";
import { z } from "zod";
import { expenseEntrySchema, expenseEntryUpdateSchema } from "../schemas/expenses.schema";
import { createExpense, deleteExpense, listExpenses, updateExpense } from "../services/expenses.service";
import { getUserId, getUserRole } from "../utils/auth";
import { parseRequiredInt } from "../utils/parse";
import { isBusinessRuleError } from "../utils/errors";
import { db } from "../models/db";
import { accounts, expenseEntries } from "../db/schema";
import { eq, and } from "drizzle-orm";

export async function listExpenseCategoriesHandler(_req: Request, res: Response) {
  try {
    const categories = db.select().from(accounts).where(eq(accounts.type, "expense")).all();
    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch expense categories" });
  }
}

export async function createExpenseCategoryHandler(req: Request, res: Response) {
  try {
    const schema = z.object({
      name: z.string().min(1, "Category name is required").trim(),
      openingBalance: z.string().default("0"),
      openingBalanceType: z.enum(["debit", "credit"]).default("debit"),
    });
    const parsed = schema.parse(req.body);
    const existing = db.select().from(accounts).where(
      and(eq(accounts.type, "expense"), eq(accounts.name, parsed.name))
    ).all();
    if (existing.length > 0) {
      return res.status(409).json({ error: "A category with this name already exists" });
    }
    const ob = parseFloat(parsed.openingBalance) || 0;
    const effectiveOb = ob > 0 && parsed.openingBalanceType === "credit" ? (-ob).toString() : ob > 0 ? ob.toString() : "0";
    const [created] = db.insert(accounts).values({
      name: parsed.name,
      type: "expense",
      openingBalance: effectiveOb,
      currentBalance: effectiveOb,
    }).returning().all();
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create expense category" });
  }
}

export async function updateExpenseCategoryHandler(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid category id" });
    const schema = z.object({
      name: z.string().min(1, "Category name is required").trim(),
    });
    const parsed = schema.parse(req.body);
    const existing = db.select().from(accounts).where(
      and(eq(accounts.type, "expense"), eq(accounts.name, parsed.name))
    ).all();
    if (existing.length > 0 && existing[0].id !== id) {
      return res.status(409).json({ error: "A category with this name already exists" });
    }
    const [updated] = db.update(accounts).set({ name: parsed.name }).where(eq(accounts.id, id)).returning().all();
    if (!updated) return res.status(404).json({ error: "Category not found" });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to update expense category" });
  }
}

export async function deleteExpenseCategoryHandler(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid category id" });
    const linkedExpenses = db.select({ id: expenseEntries.id }).from(expenseEntries).where(
      eq(expenseEntries.expenseAccountId, id)
    ).all();
    if (linkedExpenses.length > 0) {
      return res.status(409).json({ error: "Cannot delete category that is linked to expenses" });
    }
    const [deleted] = db.delete(accounts).where(eq(accounts.id, id)).returning().all();
    if (!deleted) return res.status(404).json({ error: "Category not found" });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete expense category" });
  }
}

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

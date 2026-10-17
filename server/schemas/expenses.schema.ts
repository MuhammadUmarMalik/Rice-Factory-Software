import { z } from "zod";
import { insertExpenseEntrySchema } from "../db/schema";
import { numericString } from "./common";

export const expenseEntrySchema = insertExpenseEntrySchema.extend({
  expenseDate: z.union([z.string(), z.date(), z.number()]).transform((val) => new Date(val)),
  amount: numericString,
  expenseAccountId: z.number().int().positive(),
  payFromAccountId: z.number().int().positive(),
  direction: z.enum(["debit", "credit"]).default("debit"),
  description: z.string().optional(),
  purpose: z.string().optional(),
});

export const expenseEntryUpdateSchema = expenseEntrySchema.partial();

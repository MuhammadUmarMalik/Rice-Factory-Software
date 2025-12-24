import { z } from "zod";
import { insertExpenseEntrySchema } from "@shared/schema";
import { numericString } from "./common";

export const expenseEntrySchema = insertExpenseEntrySchema.extend({
  expenseDate: z.union([z.string(), z.date(), z.number()]).transform((val) => new Date(val)),
  amount: numericString,
  expenseAccountId: z.number().int().positive(),
  payFromAccountId: z.number().int().positive(),
  description: z.string().optional(),
});

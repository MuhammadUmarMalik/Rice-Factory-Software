import { z } from "zod";
import { insertJournalVoucherSchema } from "../db/schema";
import { numericString } from "./common";

export const journalVoucherInputSchema = insertJournalVoucherSchema.extend({
  voucherDate: z.union([z.string(), z.date(), z.number()]).transform((val) => new Date(val)),
  status: z.enum(["draft", "approved"]).default("draft"),
  narration: z.string().optional(),
  createdBy: z.number().int().positive().optional(),
  approvedBy: z.number().int().positive().optional(),
  debitAccountId: z.number().int().positive(),
  debitAmount: numericString,
  creditAccountId: z.number().int().positive(),
  creditAmount: numericString,
});

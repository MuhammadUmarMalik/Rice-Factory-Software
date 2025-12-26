import { z } from "zod";
import { insertReceiptVoucherSchema, insertReceiptVoucherLineSchema } from "@shared/schema";
import { numericString } from "./common";

export const receiptLinesSchema = z
  .array(
    insertReceiptVoucherLineSchema
      .omit({ voucherId: true })
      .extend({
        debit: numericString.default("0"),
        credit: numericString.default("0"),
        amount: numericString.optional(),
        narration: z.string().optional(),
        accountId: z.number().int().positive(),
      })
  )
  .min(1);

export const receiptHeaderSchema = insertReceiptVoucherSchema.extend({
  voucherDate: z.union([z.string(), z.date(), z.number()]).transform((val) => new Date(val)),
});

export const receiptHeaderSchemaPartial = receiptHeaderSchema.partial();

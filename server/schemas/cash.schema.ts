import { z } from "zod";
import { numericString } from "./common";

/**
 * Body of PUT /api/cash/opening-balance.
 *
 * `numericString` on its own maps a missing or empty value to "0". That is the
 * right default for a line item on a larger document, but here it would turn a
 * malformed request into a silent wipe of the opening balance, so the field is
 * required before the shared numeric rules (non-negative, complete numeric
 * literal) apply.
 */
export const cashOpeningBalanceSchema = z.object({
  openingBalance: z
    .union([z.string().trim().min(1, "Opening balance is required"), z.number()])
    .pipe(numericString),
  cashAccountId: z.coerce.number().int().positive().optional(),
});

export type CashOpeningBalanceInput = z.infer<typeof cashOpeningBalanceSchema>;

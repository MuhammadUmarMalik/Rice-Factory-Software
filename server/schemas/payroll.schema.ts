import { z } from "zod";

/**
 * The opening balance type for an employee: "debit" means the business has a
 * receivable (the employee owes the business, e.g. an advance), "credit" means
 * the business has a liability (salary paid in advance). Stored alongside the
 * amount so the figure flows into ledgers, reports and balance calculations
 * with its sign convention intact.
 */
export const openingBalanceTypeSchema = z.enum(["debit", "credit"]).default("debit");

export const payrollMonthSchema = z.object({
  payrollMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

export const payrollPaymentSchema = z.object({
  method: z.enum(["Cash", "Bank"]),
  paymentAccountId: z.number().int().positive().optional(),
  paymentDate: z.string().optional(),
});

export const payrollUpdateSchema = z.object({
  basicSalary: z.coerce.number().min(0).optional(),
  allowances: z.coerce.number().min(0).optional(),
  deductions: z.coerce.number().min(0).optional(),
});

export default payrollMonthSchema;

/**
 * Coerce a client-supplied opening balance type into the enum, or undefined
 * when the payload is absent. Anything other than "debit"/"credit" (or the
 * aliases "dr"/"cr") is rejected so a garbage payload cannot silently flip the
 * sign convention mid-calculation.
 */
export function normalizeOpeningBalanceType(value: unknown): "debit" | "credit" | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "debit" || normalized === "dr") return "debit";
  if (normalized === "credit" || normalized === "cr") return "credit";
  return undefined;
}

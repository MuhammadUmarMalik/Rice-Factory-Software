import { z } from "zod";

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

import { z } from "zod";

/**
 * Gate pass request schemas.
 *
 * Kept free of database imports so the same shapes can be reused by the
 * client (validation + types) and the server (request parsing). All weight
 * values arrive in integer grams and all bag counts as integers; anything
 * non-numeric or negative is rejected with a message that says what to fix.
 */

export const GATE_PASS_DIRECTIONS = ["IN", "OUT"] as const;
export const GATE_PASS_STATUSES = ["ISSUED", "COMPLETED", "CANCELLED"] as const;
export const GATE_PASS_SOURCE_TYPES = ["PURCHASE", "SALE", "JOB_RECEIVE", "JOB_RETURN"] as const;

export type GatePassDirection = (typeof GATE_PASS_DIRECTIONS)[number];
export type GatePassStatus = (typeof GATE_PASS_STATUSES)[number];
export type GatePassSourceType = (typeof GATE_PASS_SOURCE_TYPES)[number];

const nonNegativeInt = (label: string, fallbackNull = false) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((value, ctx) => {
      if (value == null || value === "") return fallbackNull ? null : 0;
      const num = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isFinite(num)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a number` });
        return z.NEVER;
      }
      if (num < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must not be negative` });
        return z.NEVER;
      }
      return Math.round(num);
    });

export const gatePassItemSchema = z.object({
  productId: z.number().int().positive(),
  bags: nonNegativeInt("Bags"),
  weightG: nonNegativeInt("Weight"),
  saleItemId: z.number().int().positive().nullable().optional(),
  purchaseItemId: z.number().int().positive().nullable().optional(),
});

export type GatePassItemInput = z.infer<typeof gatePassItemSchema>;

export const gatePassCreateSchema = z.object({
  direction: z.enum(GATE_PASS_DIRECTIONS),
  vehicleNo: z.string().trim().max(50).nullable().optional(),
  driverName: z.string().trim().max(120).nullable().optional(),
  driverPhone: z.string().trim().max(40).nullable().optional(),
  partyId: z.number().int().positive().nullable().optional(),
  sourceType: z.enum(GATE_PASS_SOURCE_TYPES).nullable().optional(),
  sourceId: z.number().int().positive().nullable().optional(),
  grossG: nonNegativeInt("Gross weight", true).optional(),
  tareG: nonNegativeInt("Tare weight", true).optional(),
  netG: nonNegativeInt("Net weight", true).optional(),
  remarks: z.string().trim().max(1000).nullable().optional(),
  issuedAt: z.union([z.string(), z.date()]).nullable().optional(),
  items: z.array(gatePassItemSchema).max(100).default([]),
});

export type GatePassCreateInput = z.infer<typeof gatePassCreateSchema>;

export const gatePassCancelSchema = z.object({
  reason: z.string().trim().min(1, "A cancellation reason is required").max(500),
});

export type GatePassCancelInput = z.infer<typeof gatePassCancelSchema>;

export const gatePassListQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  direction: z.enum(GATE_PASS_DIRECTIONS).optional(),
  status: z.enum(GATE_PASS_STATUSES).optional(),
  partyId: z.coerce.number().int().positive().optional(),
  vehicleNo: z.string().trim().optional(),
});

export type GatePassListQuery = z.infer<typeof gatePassListQuerySchema>;

import { z } from "zod";
import { numericString } from "./common";

const asDate = z.preprocess((v) => (v == null || v === "" ? undefined : new Date(v as any)), z.date());

export const daybookQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  party: z.string().optional(),
  status: z.string().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

export const cashBookInputSchema = z.object({
  transactionDate: asDate,
  transactionType: z.enum(["Receipt", "Payment"]),
  accountType: z.enum(["Cash", "Bank"]),
  bankAccountId: z.number().int().positive().optional(),
  bankAccountName: z.string().optional(),
  referenceNumber: z.string().optional(),
  partyName: z.string().optional(),
  description: z.string().optional(),
  amount: numericString,
  category: z.string().optional(),
  notes: z.string().optional(),
});

export const salesReturnsDaybookInputSchema = z.object({
  returnDate: asDate,
  creditNoteNumber: z.string().min(1),
  originalInvoiceReference: z.string().optional(),
  customerId: z.number().int().positive().optional(),
  customerName: z.string().min(1),
  description: z.string().optional(),
  quantityReturned: numericString,
  reason: z.string().optional(),
  returnAmount: numericString,
  taxAdjustment: numericString.optional().default("0"),
  totalCreditAmount: numericString,
  status: z.enum(["Pending", "Processed", "Refunded"]).default("Pending"),
  notes: z.string().optional(),
});

export const purchaseReturnsDaybookInputSchema = z.object({
  returnDate: asDate,
  debitNoteNumber: z.string().min(1),
  originalPurchaseReference: z.string().optional(),
  supplierId: z.number().int().positive().optional(),
  supplierName: z.string().min(1),
  description: z.string().optional(),
  quantityReturned: numericString,
  reason: z.string().optional(),
  returnAmount: numericString,
  taxAdjustment: numericString.optional().default("0"),
  totalDebitAmount: numericString,
  status: z.enum(["Pending", "Processed", "Credited"]).default("Pending"),
  notes: z.string().optional(),
});

export const migrationPayloadSchema = z.object({
  migrationDate: asDate.optional(),
});


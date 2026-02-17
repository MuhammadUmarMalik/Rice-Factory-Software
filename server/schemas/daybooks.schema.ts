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

export const salesDaybookInputSchema = z.object({
  transactionDate: asDate,
  invoiceNumber: z.string().min(1),
  customerId: z.number().int().positive().optional(),
  customerName: z.string().min(1),
  customerAccountDetails: z.string().optional(),
  description: z.string().optional(),
  quantity: numericString,
  unitPrice: numericString,
  subtotalAmount: numericString,
  taxAmount: numericString.optional().default("0"),
  totalAmount: numericString,
  paymentTerms: z.string().optional(),
  dueDate: asDate.optional(),
  paidAmount: numericString.optional().default("0"),
  status: z.enum(["Pending", "Partially Paid", "Fully Paid"]).default("Pending"),
  notes: z.string().optional(),
});

export const purchasesDaybookInputSchema = z.object({
  transactionDate: asDate,
  invoiceNumber: z.string().min(1),
  supplierId: z.number().int().positive().optional(),
  supplierName: z.string().min(1),
  supplierAccountDetails: z.string().optional(),
  description: z.string().optional(),
  quantity: numericString,
  unitPrice: numericString,
  subtotalAmount: numericString,
  taxAmount: numericString.optional().default("0"),
  totalAmount: numericString,
  paymentTerms: z.string().optional(),
  dueDate: asDate.optional(),
  paidAmount: numericString.optional().default("0"),
  status: z.enum(["Pending", "Partially Paid", "Fully Paid"]).default("Pending"),
  notes: z.string().optional(),
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

export const journalLineInputSchema = z.object({
  accountId: z.number().int().positive().optional(),
  accountName: z.string().min(1),
  debitAmount: numericString.optional().default("0"),
  creditAmount: numericString.optional().default("0"),
  lineDescription: z.string().optional(),
  notes: z.string().optional(),
});

export const generalJournalInputSchema = z.object({
  transactionDate: asDate,
  journalEntryNumber: z.string().min(1).optional(),
  description: z.string().min(1),
  entryType: z.string().optional(),
  status: z.enum(["Draft", "Approved", "Reversed", "Cancelled"]).optional(),
  approvedBy: z.number().int().positive().optional(),
  attachmentPaths: z.array(z.string()).optional(),
  notes: z.string().optional(),
  lines: z.array(journalLineInputSchema).min(2),
});

export const migrationPayloadSchema = z.object({
  migrationDate: asDate.optional(),
});


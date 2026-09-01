import { z } from "zod";

export const DocTypeEnum = z.enum(["REPORT", "VOUCHER", "INVOICE", "STATEMENT"]);
export type DocType = z.infer<typeof DocTypeEnum>;

export const TableAlignEnum = z.enum(["left", "right", "center"]);
export type TableAlign = z.infer<typeof TableAlignEnum>;

export const PrintableTableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  align: TableAlignEnum.optional(),
  width: z.string().optional(),
});
export type PrintableTableColumn = z.infer<typeof PrintableTableColumnSchema>;

export const PrintableTableSchema = z.object({
  columns: z.array(PrintableTableColumnSchema),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  totalsRow: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  groupBy: z.string().optional(),
});
export type PrintableTable = z.infer<typeof PrintableTableSchema>;

export const PrintableSectionSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  highlight: z.boolean().optional(),
});
export type PrintableSection = z.infer<typeof PrintableSectionSchema>;

export const PrintableMetaSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  filters: z.record(z.string()).optional(),
  createdBy: z.string().optional(),
  createdAt: z.string().optional(),
});
export type PrintableMeta = z.infer<typeof PrintableMetaSchema>;

export const PrintableCompanySchema = z.object({
  name: z.string(),
  address: z.string().optional(),
  phone: z.string().optional(),
  logoUrl: z.string().optional(),
  ntn: z.string().optional(),
  strn: z.string().optional(),
});
export type PrintableCompany = z.infer<typeof PrintableCompanySchema>;

export const PrintableSignatureSchema = z.object({
  label: z.string(),
  name: z.string().optional(),
});
export type PrintableSignature = z.infer<typeof PrintableSignatureSchema>;

export const PrintableSettingsSchema = z.object({
  currency: z.string().default("PKR"),
  showWatermark: z.boolean().optional(),
  watermarkText: z.string().optional(),
});
export type PrintableSettings = z.infer<typeof PrintableSettingsSchema>;

export const PrintableDocumentPayloadSchema = z.object({
  docType: DocTypeEnum,
  docKey: z.string(),
  title: z.string(),
  docNo: z.string().optional(),
  company: PrintableCompanySchema,
  meta: PrintableMetaSchema.optional(),
  sections: z.array(PrintableSectionSchema).optional(),
  table: PrintableTableSchema.optional(),
  notes: z.string().optional(),
  signatures: z.array(PrintableSignatureSchema).optional(),
  settings: PrintableSettingsSchema.optional(),
});
export type PrintableDocumentPayload = z.infer<typeof PrintableDocumentPayloadSchema>;


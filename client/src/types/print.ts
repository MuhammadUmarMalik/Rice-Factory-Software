/**
 * Print payload types - matches what the print API returns.
 */

export type DocType = "REPORT" | "VOUCHER" | "INVOICE" | "STATEMENT";

export type TableAlign = "left" | "right" | "center";

export type PrintableTableColumn = {
  key: string;
  label: string;
  align?: TableAlign;
  width?: string;
};

export type PrintableTable = {
  columns: PrintableTableColumn[];
  rows: Record<string, string | number | boolean | null>[];
  totalsRow?: Record<string, string | number | boolean | null>;
  groupBy?: string;
};

export type PrintableSection = {
  label: string;
  value: string | number;
  highlight?: boolean;
};

export type PrintableMeta = {
  dateFrom?: string;
  dateTo?: string;
  filters?: Record<string, string>;
  createdBy?: string;
  createdAt?: string;
};

export type PrintableCompany = {
  name: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  ntn?: string;
  strn?: string;
};

export type PrintableSignature = {
  label: string;
  name?: string;
};

export type PrintableSettings = {
  currency?: string;
  showWatermark?: boolean;
  watermarkText?: string;
};

export type PrintableDocumentPayload = {
  docType: DocType;
  docKey: string;
  title: string;
  docNo?: string;
  company: PrintableCompany;
  meta?: PrintableMeta;
  sections?: PrintableSection[];
  table?: PrintableTable;
  notes?: string;
  signatures?: PrintableSignature[];
  settings?: PrintableSettings;
};

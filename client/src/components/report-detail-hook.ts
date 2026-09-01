import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "@/lib/authFetch";

export type ReportReference = { type: string; id: number };

export type LedgerEntry = {
  entryDate?: string | number | Date;
  description?: string;
  referenceType?: string | null;
  referenceId?: number | null;
  accountId?: number | null;
  accountName?: string | null;
  debit?: string;
  credit?: string;
};

export type SaleDetail = {
  type: "sale";
  sale: any;
  items?: any[];
  customer?: any;
  ledgerEntries?: LedgerEntry[];
};
export type PurchaseDetail = {
  type: "purchase";
  purchase: any;
  supplier?: any;
  ledgerEntries?: LedgerEntry[];
};
export type ProductDetail = { type: "product"; product: any; movements?: any[] };
export type AccountDetail = { type: "account"; account: any; ledgerEntries?: LedgerEntry[] };
export type VoucherDetail = {
  type: "receipt" | "payment" | "journal_voucher";
  voucher: any;
  ledgerEntries?: LedgerEntry[];
};
export type ExpenseDetail = {
  type: "expense";
  expense: any;
  expenseAccount?: any;
  payFromAccount?: any;
  ledgerEntries?: LedgerEntry[];
};
export type GenericDetail = Record<string, unknown>;

export type ReportDetail =
  | SaleDetail
  | PurchaseDetail
  | ProductDetail
  | AccountDetail
  | VoucherDetail
  | ExpenseDetail
  | GenericDetail
  | null;

export function useReportDetail() {
  const [reference, setReference] = useState<ReportReference | null>(null);

  const query = useQuery<ReportDetail>({
    queryKey: ["report-detail", reference?.type, reference?.id],
    enabled: !!reference,
    queryFn: async () => {
      if (!reference) return null;
      const params = new URLSearchParams({ type: reference.type, id: reference.id.toString() });
      const res = await fetchWithAuth(`/api/reports/detail?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load detail");
      return res.json();
    },
  });

  return {
    reference,
    detail: query.data,
    isLoading: query.isFetching,
    error: query.error,
    openDetail: (ref: ReportReference) => setReference(ref),
    closeDetail: () => setReference(null),
  };
}

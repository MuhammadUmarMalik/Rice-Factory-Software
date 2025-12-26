import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { ReportDetailDialog, useReportDetail } from "@/components/report-detail";
import { Input } from "@/components/ui/input";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";

type DayBookRow = {
  entryId: number;
  date: string | number | Date;
  accountName: string;
  voucherType: string;
  voucherNo: string;
  narration: string;
  debit: string;
  credit: string;
  balance: string;
  referenceType?: string | null;
  referenceId?: number | null;
};

type DayBookReport = {
  rows: DayBookRow[];
  openingBalance: string;
  totals: { debit: string; credit: string };
  validation: { balanced: boolean; difference: string };
  dayTotals: Array<{ date: string; debit: string; credit: string; balanced: boolean }>;
};

export default function DayBookPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();

  const { data, isLoading } = useQuery<DayBookReport>({
    queryKey: ["/api/reports/day-book", fromDate, toDate],
    enabled: !!fromDate && !!toDate,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("fromDate", fromDate);
      params.set("toDate", toDate);
      const res = await fetchWithAuth(`/api/reports/day-book?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load day book");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || { debit: "0", credit: "0" };
  const balanced = data?.validation.balanced ?? true;
  const dayMismatches = (data?.dayTotals || []).filter((d) => !d.balanced);
  const openingBalance = data?.openingBalance || "0";

  const formatAmount = (value?: string | number) => {
    const num = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
    if (!Number.isFinite(num)) return "0.00";
    return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatBalance = (value?: string | number) => {
    const num = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
    if (!Number.isFinite(num) || num === 0) return "0.00";
    const side = num >= 0 ? "DR" : "CR";
    return `${Math.abs(num).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${side}`;
  };

  const displayRows: Array<DayBookRow & { isOpening?: boolean }> = useMemo(
    () => [
      {
        entryId: 0,
        date: fromDate || today,
        accountName: "OPENING BALANCE",
        voucherType: "",
        voucherNo: "",
        narration: "",
        debit: "0",
        credit: "0",
        balance: openingBalance,
        isOpening: true,
      },
      ...rows,
    ],
    [fromDate, openingBalance, rows, today],
  );

  const columns: Column<DayBookRow & { isOpening?: boolean }>[] = useMemo(
    () => [
      {
        key: "srNo",
        title: "Sr.No",
        render: (r, index) => (r.isOpening ? "" : <span className="font-mono">{index}</span>),
        align: "center",
      },
      {
        key: "voucherNo",
        title: "ID",
        render: (r) => <span className="font-mono text-sm">{r.voucherNo || "-"}</span>,
      },
      { key: "voucherType", title: "Type", align: "center" },
      {
        key: "particulars",
        title: "Particulars",
        render: (r) => (
          <div className="whitespace-pre-line">
            {r.accountName}
            {r.narration ? `\n${r.narration}` : ""}
          </div>
        ),
      },
      {
        key: "debit",
        title: "Receipt",
        align: "right",
        render: (r) => <span className="font-mono">{formatAmount(r.debit)}</span>,
      },
      {
        key: "credit",
        title: "Payment",
        align: "right",
        render: (r) => <span className="font-mono">{formatAmount(r.credit)}</span>,
      },
      {
        key: "balance",
        title: "Balance",
        align: "right",
        render: (r) => <span className="font-mono">{formatBalance(r.balance)}</span>,
      },
    ],
    [formatAmount, formatBalance],
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Day Book</h1>
          <p className="text-sm text-muted-foreground">Posted ledger entries by date. Total debit equals total credit.</p>
        </div>
        <PrintActions
          docKey={docKeys.dayBook}
          params={{ fromDate: fromDate || undefined, toDate: toDate || undefined }}
          title="Day Book"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex items-end justify-end gap-6 text-sm text-muted-foreground">
              <div>
                Totals - Debit: <span className="font-mono text-emerald-600">{Number(totals.debit || 0).toLocaleString()}</span>, Credit:{" "}
                <span className="font-mono text-red-600">{Number(totals.credit || 0).toLocaleString()}</span>
              </div>
              <div className={balanced ? "text-emerald-700" : "text-destructive"}>
                {balanced ? "Balanced" : "Mismatch"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {dayMismatches.length > 0 && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {dayMismatches.length} day(s) have debit/credit mismatches. Review postings.
            </div>
          )}
          <DataTable
            columns={columns}
            data={displayRows}
            isLoading={isLoading}
            searchable
            emptyMessage="No entries found"
            onRowClick={(row) => {
              if ("isOpening" in row && row.isOpening) return;
              const allowed = ["purchase", "sale", "receipt", "payment", "journal_voucher"];
              if (row.referenceType && row.referenceId && allowed.includes(row.referenceType)) {
                openDetail({ type: row.referenceType as any, id: Number(row.referenceId) });
              }
            }}
          />
        </CardContent>
      </Card>

      <ReportDetailDialog
        reference={reference}
        open={!!reference}
        onOpenChange={(open) => (!open ? closeDetail() : null)}
        detail={detail || null}
        isLoading={isDetailLoading}
      />
    </div>
  );
}

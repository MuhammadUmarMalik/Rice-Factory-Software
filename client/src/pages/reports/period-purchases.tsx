import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data-table";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import type { Account } from "@/types/schema";
import { downloadCsv } from "@/lib/export";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";

type PeriodPurchaseRow = {
  period: string;
  periodStart: string | number | Date;
  periodEnd: string | number | Date;
  totalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  invoiceCount: number;
};

type PeriodPurchaseReport = {
  rows: PeriodPurchaseRow[];
  totals: { totalAmount: string; paidAmount: string; balanceAmount: string; invoiceCount: number };
};

export default function PeriodPurchasesPage() {
  const { range, setRange, fromDate, toDate, isReady } = useReportDateRange({ preset: "all" });
  const [supplierId, setSupplierId] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<string>("month");

  const { data: suppliers = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=supplier"],
  });

  const { data, isLoading } = useQuery<PeriodPurchaseReport>({
    queryKey: ["/api/reports/period-purchases", fromDate, toDate, supplierId, groupBy],
    enabled: isReady,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      params.set("groupBy", groupBy);
      if (supplierId !== "all") params.set("supplierId", supplierId);
      const res = await fetchWithAuth(`/api/reports/period-purchases?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load period purchases");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || { totalAmount: "0", paidAmount: "0", balanceAmount: "0", invoiceCount: 0 };

  const columns: Column<PeriodPurchaseRow>[] = useMemo(
    () => [
      { key: "period", title: "Period" },
      {
        key: "totalAmount",
        title: "Total Purchases",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {Number(r.totalAmount || 0).toLocaleString()}</span>,
      },
      {
        key: "paidAmount",
        title: "Paid",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {Number(r.paidAmount || 0).toLocaleString()}</span>,
      },
      {
        key: "balanceAmount",
        title: "Balance",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {Number(r.balanceAmount || 0).toLocaleString()}</span>,
      },
      { key: "invoiceCount", title: "Invoices", align: "right" },
    ],
    [],
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Period-wise Purchases</h1>
          <p className="text-sm text-muted-foreground">Purchases grouped by day, week, or month.</p>
        </div>
        <div className="flex gap-2">
          <PrintActions
            docKey={docKeys.periodPurchases}
            params={{
              fromDate: fromDate || undefined,
              toDate: toDate || undefined,
              supplierId: supplierId !== "all" ? supplierId : undefined,
              groupBy,
            }}
            title="Period-wise Purchases"
            disabled={!isReady}
          />
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(
                `period-purchases_${fromDate}_${toDate}`,
                [
                  { header: "Period", value: (r) => r.period },
                  { header: "Total Purchases", value: (r) => r.totalAmount },
                  { header: "Paid", value: (r) => r.paidAmount },
                  { header: "Balance", value: (r) => r.balanceAmount },
                  { header: "Invoices", value: (r) => r.invoiceCount.toString() },
                ],
                rows,
              )
            }
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="md:col-span-2">
              <Label>Date Range</Label>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
            <div>
              <Label>Group By</Label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Total Purchases" value={totals.totalAmount} />
        <SummaryCard label="Paid" value={totals.paidAmount} />
        <SummaryCard label="Balance" value={totals.balanceAmount} />
        <SummaryCard label="Invoices" value={totals.invoiceCount.toString()} highlight />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            searchable
            emptyMessage="No purchases found"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/30 shadow-sm" : ""}>
      <CardContent className="pt-4 space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold font-mono ${highlight ? "text-primary" : ""}`}>
          {Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
      </CardContent>
    </Card>
  );
}

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

type PeriodSalesRow = {
  period: string;
  periodStart: string | number | Date;
  periodEnd: string | number | Date;
  totalAmount: string;
  receivedAmount: string;
  balanceAmount: string;
  invoiceCount: number;
};

type PeriodSalesReport = {
  rows: PeriodSalesRow[];
  totals: { totalAmount: string; receivedAmount: string; balanceAmount: string; invoiceCount: number };
};

export default function PeriodSalesPage() {
  const { range, setRange, fromDate, toDate, isReady } = useReportDateRange({ preset: "all" });
  const [customerId, setCustomerId] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<string>("month");

  const { data: customers = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=customer"],
  });

  const { data, isLoading } = useQuery<PeriodSalesReport>({
    queryKey: ["/api/reports/period-sales", fromDate, toDate, customerId, groupBy],
    enabled: isReady,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      params.set("groupBy", groupBy);
      if (customerId !== "all") params.set("customerId", customerId);
      const res = await fetchWithAuth(`/api/reports/period-sales?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load period sales");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          acc.totalAmount += Number(r.totalAmount || 0);
          acc.receivedAmount += Number(r.receivedAmount || 0);
          acc.balanceAmount += Number(r.balanceAmount || 0);
          acc.invoiceCount += Number(r.invoiceCount || 0);
          return acc;
        },
        { totalAmount: 0, receivedAmount: 0, balanceAmount: 0, invoiceCount: 0 },
      ),
    [rows],
  );

  const columns: Column<PeriodSalesRow>[] = useMemo(
    () => [
      { key: "period", title: "Period" },
      {
        key: "totalAmount",
        title: "Total Sales",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {Number(r.totalAmount || 0).toLocaleString()}</span>,
      },
      {
        key: "receivedAmount",
        title: "Received",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {Number(r.receivedAmount || 0).toLocaleString()}</span>,
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
          <h1 className="text-2xl font-semibold tracking-tight">Period-wise Sales</h1>
          <p className="text-sm text-muted-foreground">Sales grouped by day, week, or month.</p>
        </div>
        <div className="flex gap-2">
          <PrintActions
            docKey={docKeys.periodSales}
            params={{
              fromDate: fromDate || undefined,
              toDate: toDate || undefined,
              customerId: customerId !== "all" ? customerId : undefined,
              groupBy,
            }}
            title="Period-wise Sales"
            disabled={!isReady}
          />
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(
                `period-sales_${fromDate}_${toDate}`,
                [
                  { header: "Period", value: (r) => r.period },
                  { header: "Total Sales", value: (r) => r.totalAmount },
                  { header: "Received", value: (r) => r.receivedAmount },
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
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Total Sales" value={totals.totalAmount.toString()} />
        <SummaryCard label="Received" value={totals.receivedAmount.toString()} />
        <SummaryCard label="Balance" value={totals.balanceAmount.toString()} />
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
            emptyMessage="No sales found"
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

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import type { Account } from "@shared/schema";
import { downloadCsv } from "@/lib/export";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";

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
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customerId, setCustomerId] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<string>("month");

  const { data: customers = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=customer"],
  });

  const { data, isLoading } = useQuery<PeriodSalesReport>({
    queryKey: ["/api/reports/period-sales", fromDate, toDate, customerId, groupBy],
    enabled: !!fromDate && !!toDate,
    queryFn: async () => {
      const role = typeof window !== "undefined" ? localStorage.getItem("role") || "admin" : "admin";
      const params = new URLSearchParams();
      params.set("fromDate", fromDate);
      params.set("toDate", toDate);
      params.set("groupBy", groupBy);
      if (customerId !== "all") params.set("customerId", customerId);
      const res = await fetch(`/api/reports/period-sales?${params.toString()}`, {
        credentials: "include",
        headers: role ? { "x-user-role": role } : {},
      });
      if (!res.ok) throw new Error("Failed to load period sales");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || { totalAmount: "0", receivedAmount: "0", balanceAmount: "0", invoiceCount: 0 };

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
            disabled={!fromDate || !toDate}
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
            <div>
              <Label>From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
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
        <SummaryCard label="Total Sales" value={totals.totalAmount} />
        <SummaryCard label="Received" value={totals.receivedAmount} />
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

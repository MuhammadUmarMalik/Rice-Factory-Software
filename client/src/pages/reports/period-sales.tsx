import { useMemo, useState } from "react";
import { Download, Calendar } from "lucide-react";
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
import { format } from "date-fns";
import { downloadCsv } from "@/lib/export";

type PeriodSalesRow = {
  id: number;
  invoiceNumber: string;
  saleDate: string | number | Date;
  customerId: number;
  customerName: string;
  salesAmount: string;
  tax: string;
  netAmount: string;
};

type PeriodSalesReport = {
  rows: PeriodSalesRow[];
  totals: { salesAmount: string; tax: string; netAmount: string };
};

export default function PeriodSalesPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customerId, setCustomerId] = useState<string>("all");

  const { data: customers = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=customer"],
  });

  const { data, isLoading } = useQuery<PeriodSalesReport>({
    queryKey: ["/api/reports/period-sales", fromDate, toDate, customerId],
    enabled: !!fromDate && !!toDate,
    queryFn: async () => {
      const role = typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";
      const params = new URLSearchParams();
      params.set("fromDate", fromDate);
      params.set("toDate", toDate);
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
  const totals = data?.totals || { salesAmount: "0", tax: "0", netAmount: "0" };

  const columns: Column<PeriodSalesRow>[] = useMemo(
    () => [
      {
        key: "invoiceNumber",
        title: "Invoice #",
        render: (r) => <span className="font-mono text-sm">{r.invoiceNumber}</span>,
      },
      {
        key: "saleDate",
        title: "Date",
        render: (r) => (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span className="font-mono">{format(new Date(r.saleDate), "dd-MM-yyyy")}</span>
          </div>
        ),
      },
      { key: "customerName", title: "Customer" },
      {
        key: "salesAmount",
        title: "Sales Amount",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {Number(r.salesAmount || 0).toLocaleString()}</span>,
      },
      {
        key: "tax",
        title: "Tax/Charges",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {Number(r.tax || 0).toLocaleString()}</span>,
      },
      {
        key: "netAmount",
        title: "Net Amount",
        align: "right",
        render: (r) => <span className="font-mono font-semibold">Rs. {Number(r.netAmount || 0).toLocaleString()}</span>,
      },
    ],
    [],
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Period-wise Sales</h1>
          <p className="text-sm text-muted-foreground">Approved posting-based sales totals by customer.</p>
        </div>
        <Button
          variant="outline"
          disabled={!rows.length}
          onClick={() =>
            downloadCsv(
              `period-sales_${fromDate}_${toDate}`,
              [
                { header: "Invoice #", value: (r) => r.invoiceNumber },
                { header: "Date", value: (r) => format(new Date(r.saleDate), "yyyy-MM-dd") },
                { header: "Customer", value: (r) => r.customerName },
                { header: "Sales Amount", value: (r) => r.salesAmount },
                { header: "Tax/Charges", value: (r) => r.tax },
                { header: "Net Amount", value: (r) => r.netAmount },
              ],
              rows,
            )
          }
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
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

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Sales Amount" value={totals.salesAmount} />
        <SummaryCard label="Tax/Charges" value={totals.tax} />
        <SummaryCard label="Net Amount" value={totals.netAmount} highlight />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={rows} isLoading={isLoading} searchable emptyMessage="No sales found" />
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
          Rs. {Number(value || 0).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}


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

type PeriodPurchaseRow = {
  id: number;
  invoiceNumber: string;
  purchaseDate: string | number | Date;
  supplierId: number;
  supplierName: string;
  purchaseAmount: string;
  tax: string;
  netAmount: string;
};

type PeriodPurchaseReport = {
  rows: PeriodPurchaseRow[];
  totals: { purchaseAmount: string; tax: string; netAmount: string };
};

export default function PeriodPurchasesPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [supplierId, setSupplierId] = useState<string>("all");

  const { data: suppliers = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=supplier"],
  });

  const { data, isLoading } = useQuery<PeriodPurchaseReport>({
    queryKey: ["/api/reports/period-purchases", fromDate, toDate, supplierId],
    enabled: !!fromDate && !!toDate,
    queryFn: async () => {
      const role = typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";
      const params = new URLSearchParams();
      params.set("fromDate", fromDate);
      params.set("toDate", toDate);
      if (supplierId !== "all") params.set("supplierId", supplierId);
      const res = await fetch(`/api/reports/period-purchases?${params.toString()}`, {
        credentials: "include",
        headers: role ? { "x-user-role": role } : {},
      });
      if (!res.ok) throw new Error("Failed to load period purchases");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || { purchaseAmount: "0", tax: "0", netAmount: "0" };

  const columns: Column<PeriodPurchaseRow>[] = useMemo(
    () => [
      {
        key: "invoiceNumber",
        title: "Invoice #",
        render: (r) => <span className="font-mono text-sm">{r.invoiceNumber}</span>,
      },
      {
        key: "purchaseDate",
        title: "Date",
        render: (r) => (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span className="font-mono">{format(new Date(r.purchaseDate), "dd-MM-yyyy")}</span>
          </div>
        ),
      },
      { key: "supplierName", title: "Supplier" },
      {
        key: "purchaseAmount",
        title: "Purchase Amount",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {Number(r.purchaseAmount || 0).toLocaleString()}</span>,
      },
      {
        key: "tax",
        title: "Tax/Fees",
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
          <h1 className="text-2xl font-semibold tracking-tight">Period-wise Purchases</h1>
          <p className="text-sm text-muted-foreground">Approved posting-based purchase totals by supplier.</p>
        </div>
        <Button
          variant="outline"
          disabled={!rows.length}
          onClick={() =>
            downloadCsv(
              `period-purchases_${fromDate}_${toDate}`,
              [
                { header: "Invoice #", value: (r) => r.invoiceNumber },
                { header: "Date", value: (r) => format(new Date(r.purchaseDate), "yyyy-MM-dd") },
                { header: "Supplier", value: (r) => r.supplierName },
                { header: "Purchase Amount", value: (r) => r.purchaseAmount },
                { header: "Tax/Fees", value: (r) => r.tax },
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

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Purchase Amount" value={totals.purchaseAmount} />
        <SummaryCard label="Tax/Fees" value={totals.tax} />
        <SummaryCard label="Net Amount" value={totals.netAmount} highlight />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={rows} isLoading={isLoading} searchable emptyMessage="No purchases found" />
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


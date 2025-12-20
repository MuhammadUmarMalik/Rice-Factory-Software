import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/data-table";
import { ReportDetailDialog, useReportDetail } from "@/components/report-detail";
import { format } from "date-fns";

type GrossProfitReport = {
  totalSales: string;
  costOfGoodsSold: string;
  grossProfit: string;
  rows?: Array<{ saleId: number; invoiceNumber: string; saleDate: string | number | Date; salesAmount: string; costOfGoodsSold: string; grossProfit: string }>;
};
type GrossProfitRow = NonNullable<GrossProfitReport["rows"]>[number];

export default function GrossProfitPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();

  const { data, isLoading, error } = useQuery<GrossProfitReport>({
    queryKey: ["/api/reports/gross-profit", fromDate, toDate],
    enabled: !!fromDate && !!toDate,
    queryFn: async () => {
      const role = typeof window !== "undefined" ? localStorage.getItem("role") || "admin" : "admin";
      const params = new URLSearchParams();
      params.set("fromDate", fromDate);
      params.set("toDate", toDate);
      const res = await fetch(`/api/reports/gross-profit?${params.toString()}`, {
        credentials: "include",
        headers: role ? { "x-user-role": role } : {},
      });
      if (!res.ok) throw new Error("Failed to load gross profit");
      return res.json();
    },
  });

  const totalSales = Number(data?.totalSales || 0);
  const cogs = Number(data?.costOfGoodsSold || 0);
  const grossProfit = Number(data?.grossProfit || 0);
  const rows = data?.rows || [];

  const columns: Column<GrossProfitRow>[] = useMemo(
    () => [
      {
        key: "invoiceNumber",
        title: "Invoice",
        render: (r) => <span className="font-mono text-sm">{r.invoiceNumber}</span>,
      },
      {
        key: "saleDate",
        title: "Date",
        render: (r) => <span className="font-mono text-xs text-muted-foreground">{format(new Date(r.saleDate), "dd-MM-yyyy")}</span>,
      },
      {
        key: "salesAmount",
        title: "Sales",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {Number(r.salesAmount || 0).toLocaleString()}</span>,
      },
      {
        key: "costOfGoodsSold",
        title: "COGS",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {Number(r.costOfGoodsSold || 0).toLocaleString()}</span>,
      },
      {
        key: "grossProfit",
        title: "Gross Profit",
        align: "right",
        render: (r) => <span className="font-mono font-semibold">Rs. {Number(r.grossProfit || 0).toLocaleString()}</span>,
      },
    ],
    [],
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Period-wise Gross Profit</h1>
        <p className="text-sm text-muted-foreground">
          Gross Profit = Sales – COGS (COGS estimated using current average purchase price per product).
        </p>
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
            <div className="md:col-span-2 flex items-end">
              {isLoading && <p className="text-sm text-muted-foreground">Calculating…</p>}
              {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Total Sales" value={totalSales} />
        <MetricCard title="Cost of Goods Sold" value={cogs} />
        <MetricCard title="Gross Profit" value={grossProfit} highlight={grossProfit >= 0} />
      </div>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sale Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns as any}
              data={rows as any}
              isLoading={isLoading}
              searchable
              emptyMessage="No sales in this period"
              onRowClick={(row) => openDetail({ type: "sale", id: row.saleId })}
            />
          </CardContent>
        </Card>
      )}

      <ReportDetailDialog
        open={!!reference}
        onOpenChange={(open) => (!open ? closeDetail() : null)}
        detail={detail || null}
        isLoading={isDetailLoading}
      />
    </div>
  );
}

function MetricCard({ title, value, highlight }: { title: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/30 shadow-sm" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold font-mono ${highlight ? "text-primary" : ""}`}>Rs. {value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

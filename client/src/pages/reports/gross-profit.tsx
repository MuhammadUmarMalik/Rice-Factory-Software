import { Suspense, lazy, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/data-table";
import { useReportDetail } from "@/components/report-detail-hook";
import { format } from "date-fns";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";
import { SkeletonBox } from "@/components/ui/skeletons";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";

const ReportDetailDialog = lazy(() =>
  import("@/components/report-detail-dialog").then((mod) => ({
    default: mod.ReportDetailDialog,
  })),
);

type GrossProfitReport = {
  netSales: string;
  costOfGoodsSold: string;
  grossProfit: string;
  grossMarginPercent: string;
  rows?: Array<{ saleId: number; invoiceNumber: string; saleDate: string | number | Date; netSales: string; costOfGoodsSold: string; grossProfit: string }>;
};
type GrossProfitRow = NonNullable<GrossProfitReport["rows"]>[number];

const money = (value: string | number | null | undefined) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function GrossProfitPage() {
  const { range, setRange, fromDate, toDate, isReady } = useReportDateRange({ preset: "all" });
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();

  const { data, isLoading, error } = useQuery<GrossProfitReport>({
    queryKey: ["/api/reports/gross-profit", fromDate, toDate],
    enabled: isReady,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await fetchWithAuth(`/api/reports/gross-profit?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load gross profit");
      return res.json();
    },
  });

  const netSales = Number(data?.netSales || 0);
  const cogs = Number(data?.costOfGoodsSold || 0);
  const grossProfit = Number(data?.grossProfit || 0);
  const margin = Number(data?.grossMarginPercent || 0);
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
        key: "netSales",
        title: "Net Sales",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {money(r.netSales)}</span>,
      },
      {
        key: "costOfGoodsSold",
        title: "COGS",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {money(r.costOfGoodsSold)}</span>,
      },
      {
        key: "grossProfit",
        title: "Gross Profit",
        align: "right",
        render: (r) => <span className="font-mono font-semibold">Rs. {money(r.grossProfit)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gross Profit</h1>
          <p className="text-sm text-muted-foreground">
            Gross Profit = Net Sales - COGS (moving average cost).
          </p>
        </div>
        <PrintActions
          docKey={docKeys.grossProfit}
          params={{ fromDate: fromDate || undefined, toDate: toDate || undefined }}
          title="Gross Profit"
          disabled={!isReady}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Date Range</Label>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
            <div className="md:col-span-2 flex items-end">
              {isLoading && <SkeletonBox className="h-4 w-28" />}
              {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Net Sales" value={netSales} loading={isLoading} />
        <MetricCard title="Cost of Goods Sold" value={cogs} loading={isLoading} />
        <MetricCard title="Gross Profit" value={grossProfit} loading={isLoading} highlight={grossProfit >= 0} />
        <MetricCard title="Margin %" value={margin} loading={isLoading} suffix="%" highlight={margin >= 0} />
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

      {reference ? (
        <Suspense fallback={null}>
          <ReportDetailDialog
            reference={reference}
            open={!!reference}
            onOpenChange={(open) => (!open ? closeDetail() : null)}
            detail={detail || null}
            isLoading={isDetailLoading}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function MetricCard({
  title,
  value,
  suffix,
  highlight,
  loading,
}: {
  title: string;
  value: number;
  suffix?: string;
  highlight?: boolean;
  loading?: boolean;
}) {
  return (
    <Card className={highlight && !loading ? "border-primary/30 shadow-sm" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <SkeletonBox className="h-6 w-24" />
        ) : (
          <div className={`text-2xl font-bold font-mono ${highlight ? "text-primary" : ""}`}>
            {Number.isFinite(value) ? money(value) : "0.00"}
            {suffix ? ` ${suffix}` : ""}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

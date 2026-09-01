import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/language-context";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";
import { apiRequest } from "@/lib/queryClient";
import { SkeletonBox } from "@/components/ui/skeletons";
import type { Account } from "@/types/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const reportTitle = "Bardana / Kaat Report";

type BardanaReport = {
  totals: {
    totalKg: string;
    totalBags: string;
    avgPerBag: string;
    purchaseCount: number;
  };
};

export default function BardanaReportPage() {
  const { t } = useLanguage();
  const { range, setRange, fromDate, toDate, isReady } = useReportDateRange({ preset: "all" });
  const [supplierId, setSupplierId] = useState<string>("all");

  const { data: suppliers = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=supplier"],
  });

  const { data, isLoading, error } = useQuery<BardanaReport>({
    queryKey: ["/api/reports/bardana", fromDate, toDate, supplierId],
    enabled: isReady,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (supplierId !== "all") params.set("supplierId", supplierId);
      const res = await apiRequest("GET", `/api/reports/bardana?${params.toString()}`);
      return res.json();
    },
  });

  const totalKg = Number(data?.totals.totalKg || 0);
  const totalBags = Number(data?.totals.totalBags || 0);
  const avgPerBag = Number(data?.totals.avgPerBag || 0);
  const purchaseCount = Number(data?.totals.purchaseCount || 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("bardanaReport")}</h1>
          <p className="text-sm text-muted-foreground">
            Summary totals for Bardana / Kaat deductions.
          </p>
        </div>
        <PrintActions
          docKey={docKeys.bardanaReport}
          params={{
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            supplierId: supplierId !== "all" ? supplierId : undefined,
          }}
          title={reportTitle}
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
            <div>
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All suppliers</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              {isLoading && <SkeletonBox className="h-4 w-28" />}
              {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Total Bardana / Kaat" value={totalKg} loading={isLoading} suffix="kg" highlight />
        <MetricCard title="Total Bags" value={totalBags} loading={isLoading} />
        <MetricCard title="Avg / Bag" value={avgPerBag} loading={isLoading} suffix="kg" />
        <MetricCard title="Purchases" value={purchaseCount} loading={isLoading} decimals={0} />
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  suffix,
  highlight,
  loading,
  // Weights print with 2 decimals in the PDF mapper; counts are whole numbers.
  // Pinning the precision here keeps the screen and the print identical.
  decimals = 2,
}: {
  title: string;
  value: number;
  suffix?: string;
  highlight?: boolean;
  loading?: boolean;
  decimals?: number;
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
            {Number.isFinite(value)
              ? value.toLocaleString(undefined, {
                  minimumFractionDigits: decimals,
                  maximumFractionDigits: decimals,
                })
              : "0"}
            {suffix ? ` ${suffix}` : ""}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";
import { SkeletonBox, SkeletonText } from "@/components/ui/skeletons";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";

type CapitalStatement = {
  openingCapital: string;
  additionalCapital: string;
  drawings: string;
  netProfit: string;
  closingCapital: string;
};

export default function CapitalPage() {
  const { range, setRange, fromDate, toDate, isReady } = useReportDateRange({ preset: "thisMonth" });

  const { data, isLoading, error } = useQuery<CapitalStatement>({
    queryKey: ["/api/financial/capital", fromDate, toDate],
    enabled: isReady,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await fetchWithAuth(`/api/financial/capital?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load capital statement");
      return res.json();
    },
  });

  const opening = Number(data?.openingCapital || 0);
  const add = Number(data?.additionalCapital || 0);
  const drawings = Number(data?.drawings || 0);
  const netProfit = Number(data?.netProfit || 0);
  const closing = Number(data?.closingCapital || 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Capital Account</h1>
          <p className="text-sm text-muted-foreground">Opening + Additions - Drawings = Closing.</p>
        </div>
        <PrintActions
          docKey={docKeys.capital}
          params={{ fromDate: fromDate || undefined, toDate: toDate || undefined }}
          title="Capital Statement"
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
            <div className="md:col-span-2 flex items-end justify-end">
              {isLoading && <SkeletonBox className="h-4 w-28" />}
              {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Statement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <SkeletonText lines={6} />
          ) : (
            <>
              <Line label="Opening Capital" value={opening} />
              <Line label="Additional Capital" value={add} />
              <Line label="Net Profit" value={netProfit} />
              <Line label="Drawings" value={drawings} negative />
              <div className="border-t border-border" />
              <Line label="Closing Capital" value={closing} emphasize />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Line({ label, value, negative, emphasize }: { label: string; value: number; negative?: boolean; emphasize?: boolean }) {
  const display = negative ? -Math.abs(value) : value;
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`font-mono ${emphasize ? "text-lg font-semibold text-primary" : "text-sm"}`}>
        Rs. {display.toLocaleString()}
      </div>
    </div>
  );
}

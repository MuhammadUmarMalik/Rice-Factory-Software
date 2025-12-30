import { TrendingUp, TrendingDown, DollarSign, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";

type ProfitLossResponse = {
  period: { fromDate: string | number | Date; toDate: string | number | Date };
  revenue: string;
  costOfSales: string;
  grossProfit: string;
  operatingExpenses: string;
  netProfit: string;
};

export default function ProfitLossPage() {
  const { t, isRTL, language } = useLanguage();
  const { range, setRange, fromDate, toDate, isReady } = useReportDateRange({ preset: "thisMonth" });

  const { data: profitLoss } = useQuery<ProfitLossResponse>({
    queryKey: ["/api/reports/profit-loss", fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("startDate", fromDate);
      if (toDate) params.set("endDate", toDate);
      const res = await fetchWithAuth(`/api/reports/profit-loss?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch profit/loss");
      return res.json();
    },
  });

  const revenue = parseFloat(profitLoss?.revenue || "0");
  const costOfSales = parseFloat(profitLoss?.costOfSales || "0");
  const operatingExpenses = parseFloat(profitLoss?.operatingExpenses || "0");
  const grossProfit = parseFloat(profitLoss?.grossProfit || "0");
  const netProfit = parseFloat(profitLoss?.netProfit || "0");
  const grossMargin = revenue !== 0 ? (grossProfit / revenue) * 100 : 0;
  const netMargin = revenue !== 0 ? (netProfit / revenue) * 100 : 0;
  const money = (value: number) =>
    `Rs. ${value.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("profitLoss")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "Profit & Loss statement" : "Profit & Loss statement"}
          </p>
        </div>
        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <PrintActions
            docKey={docKeys.profitLoss}
            params={{ startDate: fromDate || undefined, endDate: toDate || undefined }}
            title="Profit & Loss"
            disabled={!isReady}
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className={`grid gap-4 md:grid-cols-2 ${isRTL ? "direction-rtl" : ""}`}>
            <div className="md:col-span-2">
              <Label className={isRTL ? "font-urdu" : ""}>Date Range</Label>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className={`border-b ${isRTL ? "text-right" : ""}`}>
            <CardTitle className="text-base font-semibold">Profit &amp; Loss Statement</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className={`flex items-center justify-between border-b pb-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div className={isRTL ? "text-right" : ""}>
                    <p className="font-medium">Net Sales</p>
                    <p className="text-xs text-muted-foreground">Revenue from ledger</p>
                  </div>
                </div>
                <span className="font-mono font-semibold text-primary">{money(revenue)}</span>
              </div>

              <div className={`flex items-center justify-between border-b pb-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-chart-2/10">
                    <Package className="h-4 w-4 text-chart-2" />
                  </div>
                  <div className={isRTL ? "text-right" : ""}>
                    <p className="font-medium">Cost of Sales (COGS)</p>
                    <p className="text-xs text-muted-foreground">Inventory cost of sales</p>
                  </div>
                </div>
                <span className="font-mono font-semibold text-destructive">- {money(costOfSales)}</span>
              </div>

              <div className={`flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={isRTL ? "text-right" : ""}>
                  <p className="font-semibold">Gross Profit / Loss</p>
                  <p className="text-xs text-muted-foreground">Net Sales - COGS</p>
                </div>
                <span className={`font-mono text-lg font-bold ${grossProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                  {grossProfit < 0 ? "-" : ""}{money(Math.abs(grossProfit))}
                </span>
              </div>

              <div className={`flex items-center justify-between border-b pb-3 pt-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-chart-3/10">
                    <DollarSign className="h-4 w-4 text-chart-3" />
                  </div>
                  <div className={isRTL ? "text-right" : ""}>
                    <p className="font-medium">Operating Expenses</p>
                    <p className="text-xs text-muted-foreground">Expense and salary accounts</p>
                  </div>
                </div>
                <span className="font-mono font-semibold text-destructive">- {money(operatingExpenses)}</span>
              </div>

              <div className={`flex items-center justify-between rounded-lg px-4 py-4 ${
                netProfit >= 0 ? "bg-primary/10" : "bg-destructive/10"
              } ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={isRTL ? "text-right" : ""}>
                  <p className="text-lg font-bold">Net Profit / Loss</p>
                  <p className="text-xs text-muted-foreground">Gross Profit - Operating Expenses</p>
                </div>
                <span className={`font-mono text-2xl font-bold ${netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                  {netProfit < 0 ? "-" : ""}{money(Math.abs(netProfit))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`border-b ${isRTL ? "text-right" : ""}`}>
            <CardTitle className="text-base font-semibold">Key Metrics</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className={`rounded-lg border p-4 ${isRTL ? "text-right" : ""}`}>
              <p className="text-xs text-muted-foreground">Gross Margin</p>
              <p className="text-xl font-bold font-mono">{grossMargin.toFixed(2)}%</p>
              <p className="text-xs text-muted-foreground">Gross Profit ÷ Net Sales</p>
            </div>
            <div className={`rounded-lg border p-4 ${isRTL ? "text-right" : ""}`}>
              <p className="text-xs text-muted-foreground">Net Margin</p>
              <p className="text-xl font-bold font-mono">{netMargin.toFixed(2)}%</p>
              <p className="text-xs text-muted-foreground">Net Profit ÷ Net Sales</p>
            </div>
            <div className={`rounded-lg border p-4 ${isRTL ? "text-right" : ""}`}>
              <p className="text-xs text-muted-foreground">Period</p>
              <p className="text-sm font-medium">
                {profitLoss?.period?.fromDate ? new Date(profitLoss.period.fromDate).toLocaleDateString() : "-"}{" "}
                to{" "}
                {profitLoss?.period?.toDate ? new Date(profitLoss.period.toDate).toLocaleDateString() : "-"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

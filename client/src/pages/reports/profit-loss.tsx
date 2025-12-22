import { Download, TrendingUp, TrendingDown, DollarSign, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

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
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const { data: profitLoss } = useQuery<ProfitLossResponse>({
    queryKey: ["/api/reports/profit-loss", dateFrom, dateTo],
    queryFn: async () => {
      const role = typeof window !== "undefined" ? localStorage.getItem("role") || "admin" : "admin";
      const params = new URLSearchParams();
      if (dateFrom) params.set("startDate", dateFrom);
      if (dateTo) params.set("endDate", dateTo);
      const res = await fetch(`/api/reports/profit-loss?${params.toString()}`, {
        credentials: "include",
        headers: role ? { "x-user-role": role } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch profit/loss");
      return res.json();
    },
  });

  const revenue = parseFloat(profitLoss?.revenue || "0");
  const costOfSales = parseFloat(profitLoss?.costOfSales || "0");
  const operatingExpenses = parseFloat(profitLoss?.operatingExpenses || "0");
  const grossProfit = parseFloat(profitLoss?.grossProfit || "0");
  const netProfit = parseFloat(profitLoss?.netProfit || "0");

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
          <Button variant="outline" data-testid="button-export">
            <Download className="h-4 w-4" />
            {t("export")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className={`grid gap-4 md:grid-cols-4 ${isRTL ? "direction-rtl" : ""}`}>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>From Date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>To Date</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className={`border-b ${isRTL ? "text-right" : ""}`}>
            <CardTitle className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <TrendingUp className="h-5 w-5 text-primary" />
              {language === "ur" ? "Revenue" : "Revenue"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className={`flex items-center justify-between p-4 rounded-lg bg-muted/30 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div className={isRTL ? "text-right" : ""}>
                    <p className="font-medium">Net Sales</p>
                    <p className="text-sm text-muted-foreground">Revenue from ledger</p>
                  </div>
                </div>
                <span className="text-xl font-bold font-mono text-primary">
                  Rs. {revenue.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`border-b ${isRTL ? "text-right" : ""}`}>
            <CardTitle className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <TrendingDown className="h-5 w-5 text-destructive" />
              {language === "ur" ? "Expenditure" : "Expenditure"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className={`flex items-center justify-between p-4 rounded-lg bg-muted/30 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-2/10">
                    <Package className="h-4 w-4 text-chart-2" />
                  </div>
                  <div className={isRTL ? "text-right" : ""}>
                    <p className="font-medium">COGS</p>
                    <p className="text-sm text-muted-foreground">Inventory cost of sales</p>
                  </div>
                </div>
                <span className="text-xl font-bold font-mono">
                  Rs. {costOfSales.toLocaleString()}
                </span>
              </div>

              <div className={`flex items-center justify-between p-4 rounded-lg bg-muted/30 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-3/10">
                    <DollarSign className="h-4 w-4 text-chart-3" />
                  </div>
                  <div className={isRTL ? "text-right" : ""}>
                    <p className="font-medium">Operating Expenses</p>
                    <p className="text-sm text-muted-foreground">Expense and salary accounts</p>
                  </div>
                </div>
                <span className="text-xl font-bold font-mono">
                  Rs. {operatingExpenses.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={grossProfit >= 0 ? "border-primary/20 bg-primary/5" : "border-destructive/20 bg-destructive/5"}>
        <CardContent className="py-6">
          <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
            <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                grossProfit >= 0 ? "bg-primary/10" : "bg-destructive/10"
              }`}>
                {grossProfit >= 0 ? (
                  <TrendingUp className="h-6 w-6 text-primary" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-destructive" />
                )}
              </div>
              <div className={isRTL ? "text-right" : ""}>
                <p className="text-lg font-semibold">Gross Profit/Loss</p>
                <p className="text-sm text-muted-foreground">Net Sales - COGS</p>
              </div>
            </div>
            <span className={`text-3xl font-bold font-mono ${
              grossProfit >= 0 ? "text-primary" : "text-destructive"
            }`}>
              Rs. {Math.abs(grossProfit).toLocaleString()}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className={netProfit >= 0 ? "border-primary bg-primary/10" : "border-destructive bg-destructive/10"}>
        <CardContent className="py-8">
          <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
            <div className={`flex items-center gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${
                netProfit >= 0 ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"
              }`}>
                <DollarSign className="h-7 w-7" />
              </div>
              <div className={isRTL ? "text-right" : ""}>
                <p className="text-xl font-bold">Net Profit/Loss</p>
                <p className="text-sm text-muted-foreground">Gross Profit - Operating Expenses</p>
              </div>
            </div>
            <span className={`text-4xl font-bold font-mono ${
              netProfit >= 0 ? "text-primary" : "text-destructive"
            }`}>
              Rs. {Math.abs(netProfit).toLocaleString()}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

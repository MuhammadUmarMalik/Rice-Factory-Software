import { Download, Printer, TrendingUp, TrendingDown, DollarSign, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

type ProfitLossResponse = {
  totalPurchases: string;
  totalSales: string;
  expenses: string;
  grossProfit: string; // Sales - Purchases
  netProfit: string; // Gross - Expenses
  purchaseCount: number;
  saleCount: number;
};

export default function ProfitLossPage() {
  const { t, isRTL, language } = useLanguage();
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  const { data: profitLoss } = useQuery<ProfitLossResponse>({
    queryKey: ["/api/reports/profit-loss", dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("startDate", dateFrom);
      if (dateTo) params.set("endDate", dateTo);
      const res = await fetch(`/api/reports/profit-loss?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch profit/loss");
      return res.json();
    },
  });

  const totalPurchases = parseFloat(profitLoss?.totalPurchases || "0");
  const totalSales = parseFloat(profitLoss?.totalSales || "0");
  const totalExpenses = parseFloat(profitLoss?.expenses || "0");
  const grossProfit = parseFloat(profitLoss?.grossProfit || "0");
  const netProfit = parseFloat(profitLoss?.netProfit || grossProfit.toString());

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("profitLoss")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "نفع و نقصان کا بیان" : "Profit & Loss statement"}
          </p>
        </div>
        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Button variant="outline" data-testid="button-export">
            <Download className="h-4 w-4" />
            {t("export")}
          </Button>
          <Button variant="outline" onClick={handlePrint} data-testid="button-print">
            <Printer className="h-4 w-4" />
            {t("print")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className={`grid gap-4 md:grid-cols-4 ${isRTL ? "direction-rtl" : ""}`}>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "تاریخ سے" : "From Date"}
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "تاریخ تک" : "To Date"}
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className={`border-b ${isRTL ? "text-right" : ""}`}>
            <CardTitle className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <TrendingUp className="h-5 w-5 text-primary" />
              {language === "ur" ? "آمدنی" : "Revenue"}
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
                    <p className="font-medium">{t("totalSales")}</p>
                    <p className="text-sm text-muted-foreground">
                      {profitLoss?.saleCount ?? 0} {language === "ur" ? "ٹرانزیکشنز" : "transactions"}
                    </p>
                  </div>
                </div>
                <span className="text-xl font-bold font-mono text-primary">
                  Rs. {totalSales.toLocaleString()}
                </span>
              </div>
            </div>

            <div className={`mt-6 pt-4 border-t flex justify-between items-center ${isRTL ? "flex-row-reverse" : ""}`}>
              <span className="font-semibold">{language === "ur" ? "کل آمدنی" : "Total Revenue"}</span>
              <span className="text-2xl font-bold font-mono text-primary">
                Rs. {totalSales.toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`border-b ${isRTL ? "text-right" : ""}`}>
            <CardTitle className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <TrendingDown className="h-5 w-5 text-destructive" />
              {language === "ur" ? "اخراجات" : "Expenditure"}
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
                    <p className="font-medium">{t("purchases")}</p>
                    <p className="text-sm text-muted-foreground">
                      {profitLoss?.purchaseCount ?? 0} {language === "ur" ? "ٹرانزیکشنز" : "transactions"}
                    </p>
                  </div>
                </div>
                <span className="text-xl font-bold font-mono">
                  Rs. {totalPurchases.toLocaleString()}
                </span>
              </div>

              <div className={`flex items-center justify-between p-4 rounded-lg bg-muted/30 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-3/10">
                    <DollarSign className="h-4 w-4 text-chart-3" />
                  </div>
                  <div className={isRTL ? "text-right" : ""}>
                    <p className="font-medium">{t("expenses")}</p>
                    <p className="text-sm text-muted-foreground">
                      1 {language === "ur" ? "زمرہ جات" : "category"}
                    </p>
                  </div>
                </div>
                <span className="text-xl font-bold font-mono">
                  Rs. {totalExpenses.toLocaleString()}
                </span>
              </div>
            </div>

            <div className={`mt-6 pt-4 border-t flex justify-between items-center ${isRTL ? "flex-row-reverse" : ""}`}>
              <span className="font-semibold">{language === "ur" ? "کل اخراجات" : "Total Expenditure"}</span>
              <span className="text-2xl font-bold font-mono">
                Rs. {(totalPurchases + totalExpenses).toLocaleString()}
              </span>
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
                <p className="text-lg font-semibold">
                  {language === "ur" ? "مجموعی نفع/نقصان" : "Gross Profit/Loss"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {language === "ur" ? "فروخت - خریداری" : "Sales - Purchases"}
                </p>
              </div>
            </div>
            <span className={`text-3xl font-bold font-mono ${
              grossProfit >= 0 ? "text-primary" : "text-destructive"
            }`}>
              Rs. {Math.abs(grossProfit).toLocaleString()}
              <span className="text-lg ml-2">
                {grossProfit >= 0 ? (language === "ur" ? "(نفع)" : "(Profit)") : (language === "ur" ? "(نقصان)" : "(Loss)")}
              </span>
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
                <p className="text-xl font-bold">
                  {language === "ur" ? "خالص نفع/نقصان" : "Net Profit/Loss"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {language === "ur" ? "مجموعی نفع - اخراجات" : "Gross Profit - Expenses"}
                </p>
              </div>
            </div>
            <span className={`text-4xl font-bold font-mono ${
              netProfit >= 0 ? "text-primary" : "text-destructive"
            }`}>
              Rs. {Math.abs(netProfit).toLocaleString()}
              <span className="text-xl ml-2">
                {netProfit >= 0 ? (language === "ur" ? "(نفع)" : "(Profit)") : (language === "ur" ? "(نقصان)" : "(Loss)")}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

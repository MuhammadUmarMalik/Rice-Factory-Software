import { useState } from "react";
import { TrendingUp, DollarSign, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";
import { apiRequest } from "@/lib/queryClient";
import { invalidateApi, invalidationGroups } from "@/api/invalidation";
import { useToast } from "@/hooks/use-toast";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";
import type { Account } from "@/types/schema";

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
  const { toast } = useToast();
  const { range, setRange, fromDate, toDate, isReady } = useReportDateRange({ preset: "all" });
  const [obAmount, setObAmount] = useState("");
  const [obType, setObType] = useState<"debit" | "credit">("credit");
  const [obDescription, setObDescription] = useState("");

  const { data: plAccount } = useQuery<Account | null>({
    queryKey: ["/api/accounts?type=income", "pl-opening"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/accounts?type=income");
      if (!res.ok) return null;
      const list: Account[] = await res.json();
      return list.find((a) => a.name === "P&L Opening Balance") || null;
    },
  });

  const savePlOpening = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(obAmount || "0") || 0;
      const effectiveOb = amt > 0 && obType === "debit" ? (-amt).toString() : amt.toString();
      if (plAccount) {
        return apiRequest("PATCH", `/api/accounts/${plAccount.id}`, { openingBalance: effectiveOb, description: obDescription || undefined });
      }
      return apiRequest("POST", "/api/accounts", { name: "P&L Opening Balance", type: "income", openingBalance: effectiveOb, description: obDescription || undefined, isSystemAccount: true });
    },
    onSuccess: () => {
      invalidateApi(invalidationGroups.accounts);
      invalidateApi(["/api/reports/profit-loss"]);
      toast({ title: "Opening balance saved" });
    },
  });

  const { data: profitLoss, isLoading, isError, refetch } = useQuery<ProfitLossResponse>({
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

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading profit and loss…</div>;
  if (isError || !profitLoss) return <div className="p-6"><p className="text-destructive">Unable to load profit and loss.</p><Button className="mt-4" onClick={() => refetch()}>Retry</Button></div>;

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
            <div className="md:col-span-2">
              <Label>P&L Opening Balance</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={plAccount ? String(Math.abs(parseFloat(plAccount.openingBalance || "0"))) : "0"}
                  value={obAmount}
                  onChange={(e) => setObAmount(e.target.value)}
                  className="max-w-[200px]"
                />
                <Select value={obType} onValueChange={(v) => setObType(v as "debit" | "credit")}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit</SelectItem>
                    <SelectItem value="debit">Debit</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savePlOpening.isPending}
                  onClick={() => savePlOpening.mutate()}
                >
                  {savePlOpening.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
              <Input
                placeholder="Description / Narration (optional)"
                value={obDescription}
                onChange={(e) => setObDescription(e.target.value)}
                className="max-w-[440px] mt-1"
              />
              {plAccount && parseFloat(plAccount.openingBalance || "0") !== 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Current: Rs. {Math.abs(parseFloat(plAccount.openingBalance || "0")).toLocaleString()}{" "}
                  ({parseFloat(plAccount.openingBalance || "0") >= 0 ? "Credit" : "Debit"})
                </p>
              )}
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

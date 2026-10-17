import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonBox } from "@/components/ui/skeletons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { formatStock } from "@/lib/units";
import { useLanguage } from "@/contexts/language-context";

type DashboardInsightsSectionProps = {
  charges?: {
    freight: number;
    loading: number;
    marketFee: number;
    brokerage: number;
    bardana: number;
    processing: number;
  };
  stock?: {
    paddyQty: number;
    riceQty: number;
    brokenQty: number;
    bardanaIn: number;
    bardanaOut: number;
    bardanaBalance: number;
    lowStock: Array<{ id: number; name: string; stock: number; unit: string }>;
    valuation: number;
  };
  isRTL: boolean;
  money: (value?: number) => string;
  loading: boolean;
};

export function DashboardInsightsSection({
  charges,
  stock,
  isRTL,
  money,
  loading,
}: DashboardInsightsSectionProps) {
  const { t } = useLanguage();
  const chargeRows = [
    {
      key: "freight",
      label: t("freight"),
      value: charges?.freight,
      tooltip:
        "From purchase charges with type 'freight'.",
    },
    {
      key: "loading",
      label: t("loadingUnloading"),
      value: charges?.loading,
      tooltip:
        "From purchase charges 'loading_filling/weight' and sale-side loading/weighing charges.",
    },
    {
      key: "marketFee",
      label: t("marketFee"),
      value: charges?.marketFee,
      tooltip:
        "From purchase charges with type 'market_fee'.",
    },
    {
      key: "brokerage",
      label: t("brokerageCommission"),
      value: charges?.brokerage,
      tooltip:
        "From purchase brokerage/commission charges and broker commission amount fields.",
    },
    {
      key: "bardana",
      label: t("bardana"),
      value: charges?.bardana,
      tooltip:
        "From purchase charges with type 'bardana'.",
    },
    {
      key: "processing",
      label: t("processingCost"),
      value: charges?.processing,
      tooltip:
        "From purchase accountant/clerk charges plus sale-side rent charges.",
    },
  ] as const;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className={isRTL ? "text-right" : ""}>
          <CardTitle className="text-base font-semibold">{t("chargesImpact")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("transactionBasedTotals")}</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBox key={index} className="h-4 w-full" />
              ))}
            </div>
          ) : (
            <TooltipProvider>
              {chargeRows.map((row) => (
                <div key={row.key} className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span className={`inline-flex items-center gap-1.5 ${isRTL ? "flex-row-reverse" : ""}`}>
                    {row.label}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`About ${row.label}`}
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side={isRTL ? "left" : "right"} className="max-w-xs">
                        <p>{row.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  <span className="font-mono">{money(row.value)}</span>
                </div>
              ))}
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={isRTL ? "text-right" : ""}>
          <CardTitle className="text-base font-semibold">{t("stockIntelligence")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("closingBalancesAndValuation")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <SkeletonBox key={index} className="h-16 w-full" />
                ))}
              </div>
              <SkeletonBox className="h-14 w-full" />
              <SkeletonBox className="h-14 w-full" />
              <SkeletonBox className="h-20 w-full" />
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{t("paddyStock")}</p>
                  <p className="font-mono font-semibold">{(stock?.paddyQty || 0).toLocaleString()} kg</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{t("riceStock")}</p>
                  <p className="font-mono font-semibold">{(stock?.riceQty || 0).toLocaleString()} kg</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{t("brokenStock")}</p>
                  <p className="font-mono font-semibold">{(stock?.brokenQty || 0).toLocaleString()} kg</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{t("bardanaBalance")}</p>
                  <p className="font-mono font-semibold">{(stock?.bardanaBalance || 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t("bardanaInOut")}</p>
                <p className="font-mono">
                  {(stock?.bardanaIn || 0).toLocaleString()} / {(stock?.bardanaOut || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t("stockValuation")}</p>
                <p className="font-mono font-semibold">{money(stock?.valuation)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t("lowStockWarnings")}</p>
                {stock?.lowStock?.length ? (
                  <div className="mt-2 space-y-1 text-sm">
                    {stock.lowStock.map((item) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <span>{item.name}</span>
                        <span className="font-mono">{formatStock(item.stock, item.unit)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("noLowStockItems")}</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

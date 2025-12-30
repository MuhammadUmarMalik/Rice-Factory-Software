import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonBox } from "@/components/ui/skeletons";

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
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className={isRTL ? "text-right" : ""}>
          <CardTitle className="text-base font-semibold">Charges Impact</CardTitle>
          <p className="text-sm text-muted-foreground">Ledger-based totals</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBox key={index} className="h-4 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                <span>Freight</span>
                <span className="font-mono">{money(charges?.freight)}</span>
              </div>
              <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                <span>Loading/Unloading</span>
                <span className="font-mono">{money(charges?.loading)}</span>
              </div>
              <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                <span>Market Fee</span>
                <span className="font-mono">{money(charges?.marketFee)}</span>
              </div>
              <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                <span>Brokerage / Commission</span>
                <span className="font-mono">{money(charges?.brokerage)}</span>
              </div>
              <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                <span>Bardana</span>
                <span className="font-mono">{money(charges?.bardana)}</span>
              </div>
              <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                <span>Processing Cost</span>
                <span className="font-mono">{money(charges?.processing)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={isRTL ? "text-right" : ""}>
          <CardTitle className="text-base font-semibold">Stock Intelligence</CardTitle>
          <p className="text-sm text-muted-foreground">Closing balances and valuation</p>
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
                  <p className="text-xs text-muted-foreground">Paddy Stock</p>
                  <p className="font-mono font-semibold">{(stock?.paddyQty || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Rice Stock</p>
                  <p className="font-mono font-semibold">{(stock?.riceQty || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Broken Stock</p>
                  <p className="font-mono font-semibold">{(stock?.brokenQty || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Bardana Balance</p>
                  <p className="font-mono font-semibold">{(stock?.bardanaBalance || 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Bardana In / Out</p>
                <p className="font-mono">
                  {(stock?.bardanaIn || 0).toLocaleString()} / {(stock?.bardanaOut || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Stock Valuation</p>
                <p className="font-mono font-semibold">{money(stock?.valuation)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Low Stock Warnings</p>
                {stock?.lowStock?.length ? (
                  <div className="mt-2 space-y-1 text-sm">
                    {stock.lowStock.map((item) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <span>{item.name}</span>
                        <span className="font-mono">{item.stock} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No low stock items.</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

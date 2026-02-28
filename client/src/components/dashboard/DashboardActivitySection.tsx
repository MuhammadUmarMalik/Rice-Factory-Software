import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonBox } from "@/components/ui/skeletons";
import { Link } from "wouter";
import Factory from "lucide-react/dist/esm/icons/factory";

type DayBookRow = {
  id: string;
  type: string;
  partyName: string;
  mode: string;
  receipt: string;
  payment: string;
  referenceType?: string | null;
  referenceId?: number | null;
};

type DashboardActivitySectionProps = {
  dayBookRows: DayBookRow[];
  dayBookLoading: boolean;
  isRTL: boolean;
  money: (value?: number) => string;
  pendingLabel: string;
  inProgressLabel: string;
  onOpenDetail: (reference: { type: string; id: number }) => void;
};

export function DashboardActivitySection({
  dayBookRows,
  dayBookLoading,
  isRTL,
  money,
  pendingLabel,
  inProgressLabel,
  onOpenDetail,
}: DashboardActivitySectionProps) {
  const { data: processingBatches = [], isLoading: processingLoading } = useQuery<any[]>({
    queryKey: ["/api/processing"],
    staleTime: 0,
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const pendingBatches = useMemo(
    () => processingBatches.filter((p: any) => p.status !== "completed"),
    [processingBatches],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className={`flex flex-row items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <CardTitle className="text-base font-semibold">Today's Day Book</CardTitle>
        </CardHeader>
        <CardContent>
          {dayBookLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <SkeletonBox key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : dayBookRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No vouchers posted.</p>
          ) : (
            <div className="space-y-3">
              {dayBookRows.map((row, index) => (
                <button
                  key={`${row.id}-${index}`}
                  type="button"
                  onClick={() => {
                    if (row.referenceType && row.referenceId) {
                      onOpenDetail({ type: row.referenceType, id: Number(row.referenceId) });
                    }
                  }}
                  className={`w-full rounded-lg border p-3 text-left hover:bg-muted/30 ${isRTL ? "text-right" : ""}`}
                >
                  <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                    <div>
                      <p className="text-sm font-medium">{row.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.type} - {row.partyName || "-"}
                      </p>
                    </div>
                    <div className={`${isRTL ? "text-left" : "text-right"}`}>
                      <p className="text-xs text-muted-foreground">Debit</p>
                      <p className="font-mono text-sm">{money(parseFloat(row.receipt || "0"))}</p>
                    </div>
                    <div className={`${isRTL ? "text-left" : "text-right"}`}>
                      <p className="text-xs text-muted-foreground">Credit</p>
                      <p className="font-mono text-sm">{money(parseFloat(row.payment || "0"))}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={`flex flex-row items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <CardTitle className="text-base font-semibold">Pending Items</CardTitle>
          <Link href="/processing">
            <Button variant="ghost" size="sm">View all</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {processingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <SkeletonBox key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {pendingBatches.slice(0, 3).map((item: any, index: number) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-lg bg-muted/30 ${isRTL ? "flex-row-reverse" : ""}`}
                  data-testid={`pending-item-${index}`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-3/10">
                    <Factory className="h-4 w-4 text-chart-3" />
                  </div>
                  <div className={`flex-1 ${isRTL ? "text-right" : ""}`}>
                    <p className="text-sm font-medium">{item.sourceProduct?.name || "-"}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.batchNumber}</p>
                  </div>
                  <div className={`${isRTL ? "text-left" : "text-right"}`}>
                    <p className="text-sm font-mono">
                      {parseFloat(item.sourceQuantity || "0").toLocaleString()} kg
                    </p>
                    <Badge
                      variant={item.status === "in_progress" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {item.status === "in_progress" ? inProgressLabel : pendingLabel}
                    </Badge>
                  </div>
                </div>
              ))}
              {pendingBatches.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No pending processing.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

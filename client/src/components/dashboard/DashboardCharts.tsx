import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonBox } from "@/components/ui/skeletons";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  LabelList,
} from "recharts";

type DashboardChartsProps = {
  chartLoading: boolean;
  chartData?: {
    monthlyTotals: { name: string; purchases: number; sales: number }[];
    productStock: { name: string; stock: number; unit: string }[];
  };
  isRTL: boolean;
  purchasesLabel: string;
  salesLabel: string;
};

function DashboardChartsComponent({
  chartLoading,
  chartData,
  isRTL,
  purchasesLabel,
  salesLabel,
}: DashboardChartsProps) {
  const monthlyData = useMemo(
    () =>
      (chartData?.monthlyTotals || []).map((row) => ({
        ...row,
        net: (row.sales || 0) - (row.purchases || 0),
      })),
    [chartData?.monthlyTotals],
  );

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className={`flex flex-row items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className={isRTL ? "text-right" : ""}>
            <CardTitle className="text-base font-semibold">Purchases vs Sales</CardTitle>
            <p className="text-sm text-muted-foreground">Monthly comparison</p>
          </div>
          <div className={`flex gap-4 text-sm ${isRTL ? "flex-row-reverse" : ""}`}>
            <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className="h-3 w-3 rounded-full bg-chart-2" />
              <span className="text-muted-foreground">{purchasesLabel}</span>
            </div>
            <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className="h-3 w-3 rounded-full bg-primary" />
              <span className="text-muted-foreground">{salesLabel}</span>
            </div>
            <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className="h-[2px] w-4 rounded-full bg-chart-5" />
              <span className="text-muted-foreground">{isRTL ? "خالص فرق" : "Net"}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[420px]">
            {chartLoading ? (
              <SkeletonBox className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyData} margin={{ top: 12, right: 18, left: 6, bottom: 8 }} barCategoryGap={20}>
                  <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border) / 0.55)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    className="text-xs"
                    tickLine={false}
                    axisLine={false}
                    dy={8}
                  />
                  <YAxis
                    className="text-xs"
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border) / 0.9)",
                      borderRadius: "10px",
                      boxShadow: "0 8px 26px hsl(var(--foreground) / 0.12)",
                      padding: "10px 12px",
                    }}
                    cursor={{ stroke: "hsl(var(--border))", strokeDasharray: "4 4" }}
                    formatter={(value: number, name) => {
                      const label = name === "purchases" ? purchasesLabel : name === "sales" ? salesLabel : (isRTL ? "خالص فرق" : "Net");
                      return [`Rs. ${value.toLocaleString()}`, label];
                    }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: "4px" }}
                  />
                  <Bar
                    dataKey="purchases"
                    fill="hsl(var(--chart-2) / 0.85)"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="sales"
                    fill="hsl(var(--primary) / 0.9)"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="hsl(var(--chart-5))"
                    strokeWidth={2.25}
                    dot={monthlyData.length <= 2}
                    activeDot={{ r: 4.5, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={isRTL ? "text-right" : ""}>
          <CardTitle className="text-base font-semibold">Product Stock</CardTitle>
          <p className="text-sm text-muted-foreground">Closing balances</p>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            {chartLoading ? (
              <SkeletonBox className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.productStock || []} barCategoryGap={16}>
                  <defs>
                    <linearGradient id="productStockGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.9} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="name" className="text-xs" interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis className="text-xs" tickFormatter={(value) => value.toLocaleString()} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                    formatter={(value: number) => [`${value.toLocaleString()}`, ""]}
                  />
                  <Bar dataKey="stock" fill="url(#productStockGradient)" radius={[8, 8, 0, 0]}>
                    <LabelList
                      dataKey="stock"
                      position="top"
                      formatter={(value: number) => value.toLocaleString()}
                      className="fill-muted-foreground text-xs"
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const DashboardCharts = memo(DashboardChartsComponent);

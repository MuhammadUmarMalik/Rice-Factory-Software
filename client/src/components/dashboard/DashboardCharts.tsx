import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[420px]">
            {chartLoading ? (
              <div className="flex items-center justify-center h-full">
                <Skeleton className="h-16 w-1/2" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData?.monthlyTotals || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                    formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, ""]}
                  />
                  <Line type="monotone" dataKey="purchases" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
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
              <div className="flex items-center justify-center h-full">
                <Skeleton className="h-36 w-1/2" />
              </div>
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

import { useMemo, useState } from "react";
import {
  ShoppingCart,
  TrendingUp,
  Package,
  DollarSign,
  Factory,
  AlertTriangle,
  Banknote,
  Landmark,
  Users,
  UserMinus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/language-context";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReportDetailDialog, useReportDetail } from "@/components/report-detail";

type DashboardSummary = {
  filters: { fromDate: string; toDate: string; fiscalYearId?: number | null };
  fiscalYears: Array<{ id: number; name: string; startDate: string | number | Date; endDate: string | number | Date }>;
  kpis: {
    totalPurchases: number;
    totalSales: number;
    stockValue: number;
    netProfit: number;
    cashBalance: number;
    bankBalance: number;
    outstandingCustomers: number;
    outstandingSuppliers: number;
  };
  trialBalance: { debitTotal: number; creditTotal: number; difference: number; balanced: boolean };
  charges: {
    freight: number;
    loading: number;
    marketFee: number;
    brokerage: number;
    bardana: number;
    processing: number;
  };
  stock: {
    paddyQty: number;
    riceQty: number;
    brokenQty: number;
    bardanaIn: number;
    bardanaOut: number;
    bardanaBalance: number;
    valuation: number;
    lowStock: Array<{ id: number; name: string; stock: number; unit: string }>;
  };
  dayBook: {
    date: string;
    rows: Array<{
      id: string;
      type: string;
      partyName: string;
      mode: string;
      receipt: string;
      payment: string;
      referenceType?: string | null;
      referenceId?: number | null;
    }>;
  };
};

type DashboardAlerts = {
  alerts: Array<{ key: string; severity: "info" | "warning" | "critical"; message: string }>;
};

export default function Dashboard() {
  const { t, isRTL, language } = useLanguage();
  const { reference, detail, isLoading: detailLoading, openDetail, closeDetail } = useReportDetail();

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [fromDate, setFromDate] = useState(format(monthStart, "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(today, "yyyy-MM-dd"));
  const [fiscalYearId, setFiscalYearId] = useState<string>("all");
  const [godown, setGodown] = useState<string>("all");

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/dashboard/summary", fromDate, toDate, fiscalYearId, godown],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (fiscalYearId !== "all") params.set("fiscalYearId", fiscalYearId);
      const res = await fetch(`/api/dashboard/summary?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard summary");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: alertsData } = useQuery<DashboardAlerts>({
    queryKey: ["/api/dashboard/alerts", fromDate, toDate, fiscalYearId, godown],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (fiscalYearId !== "all") params.set("fiscalYearId", fiscalYearId);
      const res = await fetch(`/api/dashboard/alerts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard alerts");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: chartData, isLoading: chartLoading } = useQuery<{
    monthlyTotals: { name: string; purchases: number; sales: number }[];
    productStock: { name: string; stock: number; unit: string }[];
  }>({
    queryKey: ["/api/dashboard/charts", fromDate, toDate, fiscalYearId, godown],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (fiscalYearId !== "all") params.set("fiscalYearId", fiscalYearId);
      const res = await fetch(`/api/dashboard/charts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch chart data");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: processingBatches = [], isLoading: processingLoading } = useQuery<any[]>({
    queryKey: ["/api/processing"],
    staleTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const money = (value?: number) =>
    `Rs. ${(value || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const statCards = [
    {
      title: t("totalPurchases"),
      value: money(summary?.kpis.totalPurchases),
      icon: ShoppingCart,
      color: "text-chart-2",
      bgColor: "bg-chart-2/10",
      href: `/reports/purchases?fromDate=${fromDate}&toDate=${toDate}`,
    },
    {
      title: t("totalSales"),
      value: money(summary?.kpis.totalSales),
      icon: TrendingUp,
      color: "text-primary",
      bgColor: "bg-primary/10",
      href: `/reports/sales?fromDate=${fromDate}&toDate=${toDate}`,
    },
    {
      title: t("stockValue"),
      value: money(summary?.kpis.stockValue),
      icon: Package,
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
      href: `/reports/stock?fromDate=${fromDate}&toDate=${toDate}`,
    },
    {
      title: "Net Profit",
      value: money(summary?.kpis.netProfit),
      icon: DollarSign,
      color: "text-chart-5",
      bgColor: "bg-chart-5/10",
      href: `/reports/profit-loss?startDate=${fromDate}&endDate=${toDate}`,
    },
  ];

  const kpiCards = [
    {
      title: "Cash Balance",
      value: money(summary?.kpis.cashBalance),
      icon: Banknote,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
      href: `/reports/ledger-cash?startDate=${fromDate}&endDate=${toDate}`,
    },
    {
      title: "Bank Balance",
      value: money(summary?.kpis.bankBalance),
      icon: Landmark,
      color: "text-sky-600",
      bgColor: "bg-sky-500/10",
      href: `/reports/ledger-bank?startDate=${fromDate}&endDate=${toDate}`,
    },
    {
      title: "Outstanding Customers",
      value: money(summary?.kpis.outstandingCustomers),
      icon: Users,
      color: "text-amber-600",
      bgColor: "bg-amber-500/10",
      href: `/reports/outstanding-customers?asOfDate=${toDate}`,
    },
    {
      title: "Outstanding Suppliers",
      value: money(summary?.kpis.outstandingSuppliers),
      icon: UserMinus,
      color: "text-rose-600",
      bgColor: "bg-rose-500/10",
      href: `/reports/outstanding-suppliers?asOfDate=${toDate}`,
    },
  ];

  const quickActions = [
    { title: t("newPurchase"), url: "/purchases", icon: ShoppingCart, color: "bg-chart-2 text-white" },
    { title: t("newSale"), url: "/sales", icon: TrendingUp, color: "bg-primary text-primary-foreground" },
    { title: t("processStock"), url: "/processing", icon: Factory, color: "bg-chart-3 text-white" },
  ];

  const dayBookRows = summary?.dayBook.rows || [];

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("dashboard")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "Accounting-grade overview" : "Accounting-grade overview"}
          </p>
        </div>
        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          {quickActions.map((action) => (
            <Link key={action.url} href={action.url}>
              <Button className={action.color} data-testid={`button-quick-${action.url.split("/").pop()}`}>
                <action.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{action.title}</span>
              </Button>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className={`grid gap-4 md:grid-cols-4 ${isRTL ? "direction-rtl" : ""}`}>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>Financial Year</Label>
              <Select
                value={fiscalYearId}
                onValueChange={(val) => {
                  setFiscalYearId(val);
                  const fy = summary?.fiscalYears.find((f) => String(f.id) === val);
                  if (fy) {
                    setFromDate(format(new Date(fy.startDate), "yyyy-MM-dd"));
                    setToDate(format(new Date(fy.endDate), "yyyy-MM-dd"));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {(summary?.fiscalYears || []).map((fy) => (
                    <SelectItem key={fy.id} value={String(fy.id)}>
                      {fy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>Godown</Label>
              <Select value={godown} onValueChange={setGodown} disabled>
                <SelectTrigger>
                  <SelectValue placeholder="All godowns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => (
          <Link key={index} href={stat.href}>
            <Card className="cursor-pointer hover:shadow-sm" data-testid={`card-stat-${index}`}>
              <CardHeader className={`flex flex-row items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
                    {stat.value}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((stat, index) => (
          <Link key={index} href={stat.href}>
            <Card className="cursor-pointer hover:shadow-sm" data-testid={`card-kpi-${index}`}>
              <CardHeader className={`flex flex-row items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
                    {stat.value}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-base font-semibold">Trial Balance Health</CardTitle>
            <Badge variant={summary?.trialBalance.balanced ? "default" : "destructive"}>
              {summary?.trialBalance.balanced ? "Balanced" : "Mismatch"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
              <span className="text-muted-foreground">Total Debit</span>
              <span className="font-mono">{money(summary?.trialBalance.debitTotal)}</span>
            </div>
            <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
              <span className="text-muted-foreground">Total Credit</span>
              <span className="font-mono">{money(summary?.trialBalance.creditTotal)}</span>
            </div>
            <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
              <span className="text-muted-foreground">Difference</span>
              <span className={`font-mono ${summary?.trialBalance.balanced ? "text-emerald-600" : "text-destructive"}`}>
                {money(summary?.trialBalance.difference)}
              </span>
            </div>
            <div className={`flex items-center justify-between pt-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <span className="text-sm text-muted-foreground">Profit is final</span>
              <Badge variant={summary?.trialBalance.balanced ? "default" : "secondary"}>
                {summary?.trialBalance.balanced ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-base font-semibold">System Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent className="space-y-3">
            {(alertsData?.alerts || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts.</p>
            ) : (
              (alertsData?.alerts || []).map((alert) => (
                <div key={alert.key} className="flex items-start gap-3">
                  <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>
                    {alert.severity.toUpperCase()}
                  </Badge>
                  <p className="text-sm">{alert.message}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

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
                <span className="text-muted-foreground">{t("purchases")}</span>
              </div>
              <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className="h-3 w-3 rounded-full bg-primary" />
                <span className="text-muted-foreground">{t("sales")}</span>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-base font-semibold">Today's Day Book</CardTitle>
            <Link href="/reports/day-book">
              <Button variant="ghost" size="sm">View full</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {dayBookRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No vouchers posted.</p>
            ) : (
              <div className="space-y-3">
                {dayBookRows.map((row, index) => (
                  <button
                    key={`${row.id}-${index}`}
                    type="button"
                    onClick={() => {
                      if (row.referenceType && row.referenceId) {
                        openDetail({ type: row.referenceType, id: Number(row.referenceId) });
                      }
                    }}
                    className={`w-full rounded-lg border p-3 text-left hover:bg-muted/30 ${isRTL ? "text-right" : ""}`}
                  >
                    <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                      <div>
                        <p className="text-sm font-medium">{row.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.type} • {row.partyName || "-"}
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
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {processingBatches.filter((p: any) => p.status !== "completed").slice(0, 3).map((item: any, index: number) => (
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
                        {item.status === "in_progress" ? t("inProgress") : t("pending")}
                      </Badge>
                    </div>
                  </div>
                ))}
                {processingBatches.filter((p: any) => p.status !== "completed").length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No pending processing.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className={isRTL ? "text-right" : ""}>
            <CardTitle className="text-base font-semibold">Charges Impact</CardTitle>
            <p className="text-sm text-muted-foreground">Ledger-based totals</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {summaryLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span>Freight</span>
                  <span className="font-mono">{money(summary?.charges.freight)}</span>
                </div>
                <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span>Loading/Unloading</span>
                  <span className="font-mono">{money(summary?.charges.loading)}</span>
                </div>
                <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span>Market Fee</span>
                  <span className="font-mono">{money(summary?.charges.marketFee)}</span>
                </div>
                <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span>Brokerage / Commission</span>
                  <span className="font-mono">{money(summary?.charges.brokerage)}</span>
                </div>
                <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span>Bardana</span>
                  <span className="font-mono">{money(summary?.charges.bardana)}</span>
                </div>
                <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span>Processing Cost</span>
                  <span className="font-mono">{money(summary?.charges.processing)}</span>
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
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Paddy Stock</p>
                <p className="font-mono font-semibold">{(summary?.stock.paddyQty || 0).toLocaleString()}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Rice Stock</p>
                <p className="font-mono font-semibold">{(summary?.stock.riceQty || 0).toLocaleString()}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Broken Stock</p>
                <p className="font-mono font-semibold">{(summary?.stock.brokenQty || 0).toLocaleString()}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Bardana Balance</p>
                <p className="font-mono font-semibold">{(summary?.stock.bardanaBalance || 0).toLocaleString()}</p>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Bardana In / Out</p>
              <p className="font-mono">{(summary?.stock.bardanaIn || 0).toLocaleString()} / {(summary?.stock.bardanaOut || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Stock Valuation</p>
              <p className="font-mono font-semibold">{money(summary?.stock.valuation)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Low Stock Warnings</p>
              {summary?.stock.lowStock?.length ? (
                <div className="mt-2 space-y-1 text-sm">
                  {summary.stock.lowStock.map((item) => (
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
          </CardContent>
        </Card>
      </div>

      <ReportDetailDialog
        reference={reference}
        open={!!reference}
        onOpenChange={(open) => (!open ? closeDetail() : null)}
        detail={detail || null}
        isLoading={detailLoading}
      />
    </div>
  );
}

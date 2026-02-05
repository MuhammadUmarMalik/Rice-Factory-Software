import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart";
import TrendingUp from "lucide-react/dist/esm/icons/trending-up";
import Package from "lucide-react/dist/esm/icons/package";
import DollarSign from "lucide-react/dist/esm/icons/dollar-sign";
import Factory from "lucide-react/dist/esm/icons/factory";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import Banknote from "lucide-react/dist/esm/icons/banknote";
import Landmark from "lucide-react/dist/esm/icons/landmark";
import Users from "lucide-react/dist/esm/icons/users";
import UserMinus from "lucide-react/dist/esm/icons/user-minus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/language-context";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SkeletonBox } from "@/components/ui/skeletons";
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
import { useReportDetail } from "@/components/report-detail-hook";

const DashboardChartsSection = lazy(() =>
  import("@/components/dashboard/DashboardChartsSection").then((mod) => ({
    default: mod.DashboardChartsSection,
  })),
);
const DashboardActivitySection = lazy(() =>
  import("@/components/dashboard/DashboardActivitySection").then((mod) => ({
    default: mod.DashboardActivitySection,
  })),
);
const DashboardInsightsSection = lazy(() =>
  import("@/components/dashboard/DashboardInsightsSection").then((mod) => ({
    default: mod.DashboardInsightsSection,
  })),
);
const ReportDetailDialog = lazy(() =>
  import("@/components/report-detail-dialog").then((mod) => ({
    default: mod.ReportDetailDialog,
  })),
);

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

type DashboardSummaryCore = {
  filters: { fromDate: string; toDate: string };
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
};

type DashboardSummaryDetails = {
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
    rows: DayBookRow[];
  };
};

type DashboardAlerts = {
  alerts: Array<{ key: string; severity: "info" | "warning" | "critical"; message: string }>;
};

function useLazySection<T extends HTMLElement>(rootMargin = "200px") {
  const ref = useRef<T | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (active) return;
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, rootMargin]);

  return { ref, active };
}

export default function Dashboard() {
  const { t, isRTL, language } = useLanguage();
  const { reference, detail, isLoading: detailLoading, openDetail, closeDetail } = useReportDetail();

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [fromDate, setFromDate] = useState(format(monthStart, "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(today, "yyyy-MM-dd"));
  const [godown, setGodown] = useState<string>("all");

  const chartsSection = useLazySection<HTMLDivElement>("300px");
  const detailsSection = useLazySection<HTMLDivElement>("300px");

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummaryCore>({
    queryKey: ["/api/dashboard/summary", "core", fromDate, toDate, godown],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("scope", "core");
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await fetch(`/api/dashboard/summary?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard summary");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: details, isLoading: detailsLoading } = useQuery<DashboardSummaryDetails>({
    queryKey: ["/api/dashboard/summary", "details", fromDate, toDate, godown],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("scope", "details");
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await fetch(`/api/dashboard/summary?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard details");
      return res.json();
    },
    enabled: detailsSection.active,
    staleTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: alertsData, isLoading: alertsLoading } = useQuery<DashboardAlerts>({
    queryKey: ["/api/dashboard/alerts", fromDate, toDate, godown],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await fetch(`/api/dashboard/alerts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard alerts");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const money = useCallback(
    (value?: number) =>
      `Rs. ${(value || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
    [],
  );

  const statCards = useMemo(
    () => [
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
    ],
    [t, money, summary?.kpis, fromDate, toDate],
  );

  const kpiCards = useMemo(
    () => [
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
    ],
    [money, summary?.kpis, fromDate, toDate],
  );

  const quickActions = useMemo(
    () => [
      { title: t("newPurchase"), url: "/purchases", icon: ShoppingCart, color: "bg-chart-2 text-white" },
      { title: t("newSale"), url: "/sales", icon: TrendingUp, color: "bg-primary text-primary-foreground" },
      { title: t("processStock"), url: "/processing", icon: Factory, color: "bg-chart-3 text-white" },
    ],
    [t],
  );

  const dayBookRows = useMemo(() => details?.dayBook.rows || [], [details?.dayBook.rows]);

  const chartsFallback = (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <SkeletonBox className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <SkeletonBox className="h-[420px] w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SkeletonBox className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <SkeletonBox className="h-96 w-full" />
        </CardContent>
      </Card>
    </div>
  );

  const activityFallback = (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <SkeletonBox className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <SkeletonBox key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SkeletonBox className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <SkeletonBox key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );

  const insightsFallback = (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <SkeletonBox className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <SkeletonBox className="h-24 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SkeletonBox className="h-5 w-44" />
        </CardHeader>
        <CardContent>
          <SkeletonBox className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex min-h-[72px] items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
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
          <div className={`grid gap-4 md:grid-cols-3 ${isRTL ? "direction-rtl" : ""}`}>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
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
            <Card className="min-h-[120px] cursor-pointer hover:shadow-sm" data-testid={`card-stat-${index}`}>
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
                  <SkeletonBox className="h-8 w-32" />
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
            <Card className="min-h-[120px] cursor-pointer hover:shadow-sm" data-testid={`card-kpi-${index}`}>
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
                  <SkeletonBox className="h-8 w-32" />
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
            {summaryLoading ? (
              <SkeletonBox className="h-6 w-20" />
            ) : (
              <Badge variant={summary?.trialBalance.balanced ? "default" : "destructive"}>
                {summary?.trialBalance.balanced ? "Balanced" : "Mismatch"}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {summaryLoading ? (
              <div className="space-y-2">
                <SkeletonBox className="h-4 w-full" />
                <SkeletonBox className="h-4 w-full" />
                <SkeletonBox className="h-4 w-full" />
                <SkeletonBox className="h-4 w-2/3" />
              </div>
            ) : (
              <>
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
                  <span
                    className={`font-mono ${summary?.trialBalance.balanced ? "text-emerald-600" : "text-destructive"}`}
                  >
                    {money(summary?.trialBalance.difference)}
                  </span>
                </div>
                <div className={`flex items-center justify-between pt-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span className="text-sm text-muted-foreground">Profit is final</span>
                  <Badge variant={summary?.trialBalance.balanced ? "default" : "secondary"}>
                    {summary?.trialBalance.balanced ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-base font-semibold">System Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent className="space-y-3">
            {alertsLoading ? (
              <div className="space-y-2">
                <SkeletonBox className="h-4 w-full" />
                <SkeletonBox className="h-4 w-5/6" />
                <SkeletonBox className="h-4 w-2/3" />
              </div>
            ) : (alertsData?.alerts || []).length === 0 ? (
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

      <div ref={chartsSection.ref}>
        {/* Lazy-load chart code + data only when the charts are near the viewport. */}
        {chartsSection.active ? (
          <Suspense fallback={chartsFallback}>
            <DashboardChartsSection
              fromDate={fromDate}
              toDate={toDate}
              godown={godown}
              isRTL={isRTL}
              purchasesLabel={t("purchases")}
              salesLabel={t("sales")}
            />
          </Suspense>
        ) : (
          chartsFallback
        )}
      </div>

      <div ref={detailsSection.ref}>
        {/* Defer lower dashboard panels to keep the initial bundle/data light. */}
        {detailsSection.active ? (
          <Suspense fallback={activityFallback}>
            <DashboardActivitySection
              dayBookRows={dayBookRows}
              dayBookLoading={detailsLoading}
              isRTL={isRTL}
              money={money}
              pendingLabel={t("pending")}
              inProgressLabel={t("inProgress")}
              onOpenDetail={openDetail}
            />
          </Suspense>
        ) : (
          activityFallback
        )}
      </div>

      <div>
        {detailsSection.active ? (
          <Suspense fallback={insightsFallback}>
            <DashboardInsightsSection
              charges={details?.charges}
              stock={details?.stock}
              isRTL={isRTL}
              money={money}
              loading={detailsLoading}
            />
          </Suspense>
        ) : (
          insightsFallback
        )}
      </div>

      {reference ? (
        <Suspense fallback={null}>
          <ReportDetailDialog
            reference={reference}
            open={!!reference}
            onOpenChange={(open) => (!open ? closeDetail() : null)}
            detail={detail || null}
            isLoading={detailLoading}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

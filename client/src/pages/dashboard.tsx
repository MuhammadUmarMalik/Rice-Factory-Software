import { ShoppingCart, TrendingUp, Package, DollarSign, Plus, Factory, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/language-context";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const mockChartData = [
  { name: "Jan", purchases: 400000, sales: 520000 },
  { name: "Feb", purchases: 350000, sales: 480000 },
  { name: "Mar", purchases: 450000, sales: 550000 },
  { name: "Apr", purchases: 380000, sales: 490000 },
  { name: "May", purchases: 420000, sales: 580000 },
  { name: "Jun", purchases: 460000, sales: 620000 },
];

const mockProductData = [
  { name: "Basmati", stock: 25000 },
  { name: "Super", stock: 18000 },
  { name: "Sella", stock: 12000 },
  { name: "Broken", stock: 8000 },
];

export default function Dashboard() {
  const { t, isRTL, language } = useLanguage();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentActivity, isLoading: activityLoading } = useQuery({
    queryKey: ["/api/dashboard/recent"],
  });

  const statCards = [
    {
      title: t("totalPurchases"),
      value: stats?.totalPurchases ?? "Rs. 4,250,000",
      change: "+12.5%",
      trend: "up",
      icon: ShoppingCart,
      color: "text-chart-2",
      bgColor: "bg-chart-2/10",
    },
    {
      title: t("totalSales"),
      value: stats?.totalSales ?? "Rs. 5,820,000",
      change: "+18.2%",
      trend: "up",
      icon: TrendingUp,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: t("stockValue"),
      value: stats?.stockValue ?? "Rs. 2,450,000",
      change: "-2.4%",
      trend: "down",
      icon: Package,
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
    },
    {
      title: t("totalProfit"),
      value: stats?.totalProfit ?? "Rs. 1,570,000",
      change: "+8.7%",
      trend: "up",
      icon: DollarSign,
      color: "text-chart-5",
      bgColor: "bg-chart-5/10",
    },
  ];

  const quickActions = [
    { title: t("newPurchase"), url: "/purchases/new", icon: ShoppingCart, color: "bg-chart-2 text-white" },
    { title: t("newSale"), url: "/sales/new", icon: TrendingUp, color: "bg-primary text-primary-foreground" },
    { title: t("processStock"), url: "/processing/new", icon: Factory, color: "bg-chart-3 text-white" },
  ];

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("dashboard")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "آج کا خلاصہ" : "Today's overview"}
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => (
          <Card key={index} data-testid={`card-stat-${index}`}>
            <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <>
                  <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
                    {stat.value}
                  </div>
                  <div className={`flex items-center gap-1 mt-1 ${isRTL ? "flex-row-reverse justify-end" : ""}`}>
                    {stat.trend === "up" ? (
                      <ArrowUpRight className="h-4 w-4 text-primary" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-destructive" />
                    )}
                    <span className={`text-xs font-medium ${stat.trend === "up" ? "text-primary" : "text-destructive"}`}>
                      {stat.change}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {language === "ur" ? "پچھلے مہینے سے" : "from last month"}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className={`flex flex-row items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <div className={isRTL ? "text-right" : ""}>
              <CardTitle className="text-base font-semibold">
                {language === "ur" ? "خریداری بمقابلہ فروخت" : "Purchases vs Sales"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {language === "ur" ? "ماہانہ موازنہ" : "Monthly comparison"}
              </p>
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
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px"
                    }}
                    formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, ""]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="purchases" 
                    stroke="hsl(var(--chart-2))" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="sales" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={isRTL ? "text-right" : ""}>
            <CardTitle className="text-base font-semibold">
              {language === "ur" ? "مصنوعات کا سٹاک" : "Product Stock"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {language === "ur" ? "کلوگرام میں" : "in kilograms"}
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mockProductData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" className="text-xs" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" className="text-xs" width={60} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px"
                    }}
                    formatter={(value: number) => [`${value.toLocaleString()} kg`, ""]}
                  />
                  <Bar dataKey="stock" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-base font-semibold">
              {t("recentActivity")}
            </CardTitle>
            <Link href="/reports/ledger">
              <Button variant="ghost" size="sm" data-testid="button-view-all-activity">
                {language === "ur" ? "سب دیکھیں" : "View all"}
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { type: "purchase", party: "Ahmed Rice Traders", amount: "Rs. 125,000", time: "2 hours ago" },
                  { type: "sale", party: "Karachi Wholesalers", amount: "Rs. 245,000", time: "4 hours ago" },
                  { type: "processing", party: "Batch #PRO-2024-156", amount: "5,000 kg", time: "6 hours ago" },
                  { type: "purchase", party: "Punjab Farmers Coop", amount: "Rs. 180,000", time: "Yesterday" },
                ].map((item, index) => (
                  <div 
                    key={index} 
                    className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}
                    data-testid={`activity-item-${index}`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      item.type === "purchase" ? "bg-chart-2/10" : 
                      item.type === "sale" ? "bg-primary/10" : "bg-chart-3/10"
                    }`}>
                      {item.type === "purchase" ? (
                        <ShoppingCart className="h-4 w-4 text-chart-2" />
                      ) : item.type === "sale" ? (
                        <TrendingUp className="h-4 w-4 text-primary" />
                      ) : (
                        <Factory className="h-4 w-4 text-chart-3" />
                      )}
                    </div>
                    <div className={`flex-1 ${isRTL ? "text-right" : ""}`}>
                      <p className="text-sm font-medium">{item.party}</p>
                      <p className="text-xs text-muted-foreground">{item.time}</p>
                    </div>
                    <div className={`${isRTL ? "text-left" : "text-right"}`}>
                      <p className="text-sm font-mono font-medium">{item.amount}</p>
                      <Badge variant="secondary" className="text-xs">
                        {item.type === "purchase" ? t("purchases") : 
                         item.type === "sale" ? t("sales") : t("processing")}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-base font-semibold">
              {language === "ur" ? "زیر التواء آئٹمز" : "Pending Items"}
            </CardTitle>
            <Link href="/processing">
              <Button variant="ghost" size="sm" data-testid="button-view-all-pending">
                {language === "ur" ? "سب دیکھیں" : "View all"}
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { batch: "PRO-2024-157", product: "Basmati Rice", quantity: "3,500 kg", status: "pending" },
                { batch: "PRO-2024-158", product: "Super Rice", quantity: "2,200 kg", status: "in_progress" },
                { batch: "PRO-2024-159", product: "Sella Rice", quantity: "4,100 kg", status: "pending" },
              ].map((item, index) => (
                <div 
                  key={index} 
                  className={`flex items-center gap-3 p-3 rounded-lg bg-muted/30 ${isRTL ? "flex-row-reverse" : ""}`}
                  data-testid={`pending-item-${index}`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-3/10">
                    <Factory className="h-4 w-4 text-chart-3" />
                  </div>
                  <div className={`flex-1 ${isRTL ? "text-right" : ""}`}>
                    <p className="text-sm font-medium">{item.product}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.batch}</p>
                  </div>
                  <div className={`${isRTL ? "text-left" : "text-right"}`}>
                    <p className="text-sm font-mono">{item.quantity}</p>
                    <Badge 
                      variant={item.status === "in_progress" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {item.status === "in_progress" ? t("inProgress") : t("pending")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

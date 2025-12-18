import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";

type GrossProfitReport = {
  totalSales: string;
  costOfGoodsSold: string;
  grossProfit: string;
};

export default function GrossProfitPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data, isLoading, error } = useQuery<GrossProfitReport>({
    queryKey: ["/api/reports/gross-profit", fromDate, toDate],
    enabled: !!fromDate && !!toDate,
    queryFn: async () => {
      const role = typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";
      const params = new URLSearchParams();
      params.set("fromDate", fromDate);
      params.set("toDate", toDate);
      const res = await fetch(`/api/reports/gross-profit?${params.toString()}`, {
        credentials: "include",
        headers: role ? { "x-user-role": role } : {},
      });
      if (!res.ok) throw new Error("Failed to load gross profit");
      return res.json();
    },
  });

  const totalSales = Number(data?.totalSales || 0);
  const cogs = Number(data?.costOfGoodsSold || 0);
  const grossProfit = Number(data?.grossProfit || 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Period-wise Gross Profit</h1>
        <p className="text-sm text-muted-foreground">
          Gross Profit = Sales – COGS (COGS estimated using current average purchase price per product).
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex items-end">
              {isLoading && <p className="text-sm text-muted-foreground">Calculating…</p>}
              {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Total Sales" value={totalSales} />
        <MetricCard title="Cost of Goods Sold" value={cogs} />
        <MetricCard title="Gross Profit" value={grossProfit} highlight={grossProfit >= 0} />
      </div>
    </div>
  );
}

function MetricCard({ title, value, highlight }: { title: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/30 shadow-sm" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold font-mono ${highlight ? "text-primary" : ""}`}>Rs. {value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}


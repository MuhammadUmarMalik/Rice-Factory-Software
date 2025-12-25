import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";

type IncomeStatement = {
  period: { fromDate: string | number | Date; toDate: string | number | Date };
  revenue: string;
  costOfSales: string;
  grossProfit: string;
  operatingExpenses: string;
  netProfit: string;
};

export default function IncomeStatementPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data, isLoading, error } = useQuery<IncomeStatement>({
    queryKey: ["/api/financial/income-statement", fromDate, toDate],
    enabled: !!fromDate && !!toDate,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("fromDate", fromDate);
      params.set("toDate", toDate);
      const res = await fetchWithAuth(`/api/financial/income-statement?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load income statement");
      return res.json();
    },
  });

  const revenue = Number(data?.revenue || 0);
  const costOfSales = Number(data?.costOfSales || 0);
  const grossProfit = Number(data?.grossProfit || 0);
  const operatingExpenses = Number(data?.operatingExpenses || 0);
  const netProfit = Number(data?.netProfit || 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Income Statement</h1>
          <p className="text-sm text-muted-foreground">Period-based statement derived from transactions.</p>
        </div>
        <PrintActions
          docKey={docKeys.incomeStatement}
          params={{ fromDate: fromDate || undefined, toDate: toDate || undefined }}
          title="Income Statement"
          disabled={!fromDate || !toDate}
        />
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
              {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Statement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Line label="Revenue" value={revenue} />
          <Line label="Cost of Sales (COGS)" value={costOfSales} negative />
          <Divider />
          <Line label="Gross Profit" value={grossProfit} emphasize />
          <Divider />
          <Line label="Operating Expenses" value={operatingExpenses} negative />
          <Divider />
          <Line label="Net Profit" value={netProfit} emphasize tone={netProfit >= 0 ? "good" : "bad"} />
        </CardContent>
      </Card>
    </div>
  );
}

function Line({
  label,
  value,
  negative,
  emphasize,
  tone,
}: {
  label: string;
  value: number;
  negative?: boolean;
  emphasize?: boolean;
  tone?: "good" | "bad";
}) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-destructive" : "text-foreground";
  const display = negative ? -Math.abs(value) : value;
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`font-mono ${emphasize ? "text-lg font-semibold" : "text-sm"} ${color}`}>
        Rs. {display.toLocaleString()}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border" />;
}

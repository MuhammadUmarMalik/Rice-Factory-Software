import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";

type BalanceSheet = {
  asOfDate: string | number | Date;
  assets: { cash: string; bank: string; receivables: string; inventory: string; total: string };
  liabilities: { payables: string; expensesPayable: string; total: string };
  equity: { capital: string; retainedEarnings: string; total: string };
  totals: { assets: string; liabilitiesAndEquity: string };
};

export default function BalanceSheetPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOfDate, setAsOfDate] = useState(today);

  const { data, isLoading, error } = useQuery<BalanceSheet>({
    queryKey: ["/api/financial/balance-sheet", asOfDate],
    enabled: !!asOfDate,
    queryFn: async () => {
      const role = typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";
      const params = new URLSearchParams();
      params.set("asOfDate", asOfDate);
      const res = await fetch(`/api/financial/balance-sheet?${params.toString()}`, {
        credentials: "include",
        headers: role ? { "x-user-role": role } : {},
      });
      if (!res.ok) throw new Error("Failed to load balance sheet");
      return res.json();
    },
  });

  const assets = data?.assets;
  const liabilities = data?.liabilities;
  const equity = data?.equity;

  const assetsTotal = Number(data?.totals.assets || 0);
  const leTotal = Number(data?.totals.liabilitiesAndEquity || 0);
  const balanced = Math.abs(assetsTotal - leTotal) < 0.01;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Balance Sheet</h1>
        <p className="text-sm text-muted-foreground">As-of financial position derived from transactions.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>As of Date</Label>
              <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            </div>
            <div className="md:col-span-3 flex items-end justify-end">
              {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Section
          title="Assets"
          lines={[
            { label: "Cash", value: assets?.cash },
            { label: "Bank", value: assets?.bank },
            { label: "Receivables", value: assets?.receivables },
            { label: "Inventory", value: assets?.inventory },
          ]}
          total={assets?.total}
        />

        <Section
          title="Liabilities"
          lines={[
            { label: "Payables", value: liabilities?.payables },
            { label: "Expenses Payable", value: liabilities?.expensesPayable },
          ]}
          total={liabilities?.total}
        />

        <Section
          title="Equity"
          lines={[
            { label: "Capital", value: equity?.capital },
            { label: "Retained Earnings", value: equity?.retainedEarnings },
          ]}
          total={equity?.total}
        />

        <Card className={balanced ? "border-emerald-500/30" : "border-destructive/30"}>
          <CardHeader>
            <CardTitle className="text-lg">Totals Check</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <KV label="Total Assets" value={data?.totals.assets} />
            <KV label="Total Liabilities + Equity" value={data?.totals.liabilitiesAndEquity} />
            <div className={`text-sm font-medium ${balanced ? "text-emerald-700" : "text-destructive"}`}>
              {balanced ? "Balanced" : "Not balanced (review mappings / postings)"}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Section({
  title,
  lines,
  total,
}: {
  title: string;
  lines: Array<{ label: string; value?: string }>;
  total?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {lines.map((l) => (
          <KV key={l.label} label={l.label} value={l.value} />
        ))}
        <div className="border-t border-border my-2" />
        <KV label="Total" value={total} emphasize />
      </CardContent>
    </Card>
  );
}

function KV({ label, value, emphasize }: { label: string; value?: string; emphasize?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`font-mono ${emphasize ? "text-base font-semibold" : "text-sm"}`}>
        Rs. {Number(value || 0).toLocaleString()}
      </div>
    </div>
  );
}


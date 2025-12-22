import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";

type CapitalStatement = {
  openingCapital: string;
  additionalCapital: string;
  drawings: string;
  netProfit: string;
  closingCapital: string;
};

export default function CapitalPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data, isLoading, error } = useQuery<CapitalStatement>({
    queryKey: ["/api/financial/capital", fromDate, toDate],
    enabled: !!fromDate && !!toDate,
    queryFn: async () => {
      const role = typeof window !== "undefined" ? localStorage.getItem("role") || "admin" : "admin";
      const params = new URLSearchParams();
      params.set("fromDate", fromDate);
      params.set("toDate", toDate);
      const res = await fetch(`/api/financial/capital?${params.toString()}`, {
        credentials: "include",
        headers: role ? { "x-user-role": role } : {},
      });
      if (!res.ok) throw new Error("Failed to load capital statement");
      return res.json();
    },
  });

  const opening = Number(data?.openingCapital || 0);
  const add = Number(data?.additionalCapital || 0);
  const drawings = Number(data?.drawings || 0);
  const netProfit = Number(data?.netProfit || 0);
  const closing = Number(data?.closingCapital || 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Capital Account</h1>
        <p className="text-sm text-muted-foreground">Opening + Additions − Drawings = Closing.</p>
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
            <div className="md:col-span-2 flex items-end justify-end">
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
          <Line label="Opening Capital" value={opening} />
          <Line label="Additional Capital" value={add} />
          <Line label="Net Profit" value={netProfit} />
          <Line label="Drawings" value={drawings} negative />
          <div className="border-t border-border" />
          <Line label="Closing Capital" value={closing} emphasize />
        </CardContent>
      </Card>
    </div>
  );
}

function Line({ label, value, negative, emphasize }: { label: string; value: number; negative?: boolean; emphasize?: boolean }) {
  const display = negative ? -Math.abs(value) : value;
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`font-mono ${emphasize ? "text-lg font-semibold text-primary" : "text-sm"}`}>
        Rs. {display.toLocaleString()}
      </div>
    </div>
  );
}

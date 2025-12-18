import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

type DayBookRow = {
  date: string | number | Date;
  openingBalance: string;
  voucherType: string;
  voucherNo: string;
  debit: string;
  credit: string;
  closingBalance: string;
  referenceType?: string | null;
  referenceId?: number | null;
  narration?: string | null;
};

type DayBookReport = {
  openingBalance: string;
  rows: DayBookRow[];
  closingBalance: string;
};

export default function DayBookPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);

  const { data, isLoading } = useQuery<DayBookReport>({
    queryKey: ["/api/reports/day-book", fromDate, toDate],
    enabled: !!fromDate && !!toDate,
    queryFn: async () => {
      const role = typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";
      const params = new URLSearchParams();
      params.set("fromDate", fromDate);
      params.set("toDate", toDate);
      const res = await fetch(`/api/reports/day-book?${params.toString()}`, {
        credentials: "include",
        headers: role ? { "x-user-role": role } : {},
      });
      if (!res.ok) throw new Error("Failed to load day book");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.debit += Number(r.debit || 0);
        acc.credit += Number(r.credit || 0);
        return acc;
      },
      { debit: 0, credit: 0 },
    );
  }, [rows]);

  const columns: Column<DayBookRow>[] = useMemo(
    () => [
      {
        key: "date",
        title: "Date",
        render: (r) => <span className="font-mono">{format(new Date(r.date), "dd-MM-yyyy")}</span>,
      },
      {
        key: "openingBalance",
        title: "Opening",
        align: "right",
        render: (r) => <span className="font-mono">Rs. {Number(r.openingBalance || 0).toLocaleString()}</span>,
      },
      { key: "voucherType", title: "Voucher Type" },
      {
        key: "voucherNo",
        title: "Voucher No",
        render: (r) => <span className="font-mono text-sm">{r.voucherNo}</span>,
      },
      {
        key: "debit",
        title: "Debit",
        align: "right",
        render: (r) => <span className="font-mono text-emerald-600">Rs. {Number(r.debit || 0).toLocaleString()}</span>,
      },
      {
        key: "credit",
        title: "Credit",
        align: "right",
        render: (r) => <span className="font-mono text-red-600">Rs. {Number(r.credit || 0).toLocaleString()}</span>,
      },
      {
        key: "closingBalance",
        title: "Closing",
        align: "right",
        render: (r) => <span className="font-mono font-semibold">Rs. {Number(r.closingBalance || 0).toLocaleString()}</span>,
      },
    ],
    [],
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Day Book (Cash)</h1>
        <p className="text-sm text-muted-foreground">Cash day book derived from system cash transactions.</p>
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
            <div className="md:col-span-2 flex items-end justify-end gap-4">
              <div className="text-sm text-muted-foreground">
                Totals — Debit: <span className="font-mono text-emerald-600">{totals.debit.toLocaleString()}</span>, Credit:{" "}
                <span className="font-mono text-red-600">{totals.credit.toLocaleString()}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Closing: <span className="font-mono font-semibold">{Number(data?.closingBalance || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={rows} isLoading={isLoading} searchable emptyMessage="No cash entries found" />
        </CardContent>
      </Card>
    </div>
  );
}


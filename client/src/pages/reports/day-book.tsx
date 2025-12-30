import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";
import { format } from "date-fns";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";

type DayBookRow = {
  srNo: number;
  id: string;
  type: string;
  partyName: string;
  mode: string;
  receipt: string;
  payment: string;
  balanceAmount: string;
  balanceType: "DR" | "CR" | "";
  date: string | number | Date;
};

type DayBookReport = {
  openingBalance: { amount: string; type: "DR" | "CR" | "" };
  rows: DayBookRow[];
  totals: { receipt: string; payment: string };
};

type DayBookDisplayRow = {
  srNo: string;
  id: string;
  type: string;
  particulars: string;
  receipt: string;
  payment: string;
  balance: string;
  isOpening?: boolean;
  isTotal?: boolean;
};

export default function DayBookPage() {
  const { range, setRange, fromDate, toDate } = useReportDateRange({ preset: "today" });
  const selectedDate = toDate || fromDate;

  const { data, isLoading } = useQuery<DayBookReport>({
    queryKey: ["/api/reports/day-book", selectedDate],
    enabled: !!selectedDate,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedDate) params.set("date", selectedDate);
      const res = await fetchWithAuth(`/api/reports/day-book?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load day book");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const openingBalance = data?.openingBalance || { amount: "0", type: "" };
  const totals = data?.totals || { receipt: "0", payment: "0" };

  const formatAmount = (value?: string | number) => {
    const num = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
    if (!Number.isFinite(num)) return "0.00";
    return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatBalance = (amount?: string | number, type?: string) => {
    const num = typeof amount === "number" ? amount : parseFloat(String(amount ?? "0"));
    if (!Number.isFinite(num) || num === 0) return "0.00";
    const side = type || (num >= 0 ? "DR" : "CR");
    return `${Math.abs(num).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${side}`;
  };

  const displayRows = useMemo(() => {
    const openingRow: DayBookDisplayRow = {
      srNo: "",
      id: "",
      type: "",
      particulars: "OPENING BALANCE",
      receipt: "0.00",
      payment: "0.00",
      balance: formatBalance(openingBalance.amount, openingBalance.type),
      isOpening: true,
    };

    const voucherRows = rows.map((row) => ({
      srNo: String(row.srNo),
      id: row.id || "-",
      type: row.type || "-",
      particulars: [`[${row.partyName || "-"}]`, row.mode || ""].filter(Boolean).join("\n"),
      receipt: formatAmount(row.receipt),
      payment: formatAmount(row.payment),
      balance: formatBalance(row.balanceAmount, row.balanceType),
    }));

    const totalRow: DayBookDisplayRow = {
      srNo: "",
      id: "",
      type: "",
      particulars: "Total:",
      receipt: formatAmount(totals.receipt),
      payment: formatAmount(totals.payment),
      balance: "",
      isTotal: true,
    };

    return [openingRow, ...voucherRows, totalRow];
  }, [openingBalance.amount, openingBalance.type, rows, totals.payment, totals.receipt]);

  const columns: Column<DayBookDisplayRow>[] = [
    { key: "srNo", title: "Sr.No", align: "center" },
    { key: "id", title: "ID", align: "center" },
    { key: "type", title: "Type", align: "center" },
    {
      key: "particulars",
      title: "Particulars",
      render: (row) => (
        <div className={row.isTotal ? "font-semibold whitespace-pre-line" : "whitespace-pre-line"}>
          {row.particulars}
        </div>
      ),
    },
    {
      key: "receipt",
      title: "Receipt",
      align: "right",
      render: (row) => <span className={row.isTotal ? "font-mono font-semibold" : "font-mono"}>{row.receipt}</span>,
    },
    {
      key: "payment",
      title: "Payment",
      align: "right",
      render: (row) => <span className={row.isTotal ? "font-mono font-semibold" : "font-mono"}>{row.payment}</span>,
    },
    {
      key: "balance",
      title: "Balance",
      align: "right",
      render: (row) => <span className={row.isTotal ? "font-mono font-semibold" : "font-mono"}>{row.balance}</span>,
    },
  ];

  const selectedDateLabel = selectedDate ? format(new Date(selectedDate), "dd MMM yyyy") : "";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Day Book</h1>
          <p className="text-sm text-muted-foreground">
            {selectedDateLabel ? `Day Book (${selectedDateLabel})` : "Daily voucher summary"}
          </p>
        </div>
        <PrintActions
          docKey={docKeys.dayBook}
          params={{ date: selectedDate || undefined }}
          title="Day Book"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Date Range</Label>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={displayRows}
            isLoading={isLoading}
            searchable={false}
            emptyMessage="No entries found"
          />
        </CardContent>
      </Card>
    </div>
  );
}

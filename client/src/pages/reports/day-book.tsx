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

type DayBookTab = "sales" | "purchases" | "cash" | "sales-returns" | "purchase-returns" | "general-journal";

const DAYBOOK_API_MAP: Record<DayBookTab, string> = {
  sales: "/api/daybooks/sales",
  purchases: "/api/daybooks/purchases",
  cash: "/api/daybooks/cash",
  "sales-returns": "/api/daybooks/sales-returns",
  "purchase-returns": "/api/daybooks/purchase-returns",
  "general-journal": "/api/daybooks/general-journal",
};

type DayBookPageProps = {
  initialTab?: DayBookTab;
  singleTab?: boolean;
  pageTitle?: string;
};

export default function DayBookPage(props: any = {}) {
  const { initialTab, singleTab, pageTitle } = props as DayBookPageProps;
  const { range, setRange, fromDate, toDate } = useReportDateRange({ preset: "all" });
  const selectedDate = toDate || fromDate;
  const dateForApi = selectedDate || format(new Date(), "yyyy-MM-dd");
  const isSpecialized = Boolean(initialTab && DAYBOOK_API_MAP[initialTab]);

  const readErrorMessage = async (res: Response, fallback: string) => {
    const text = await res.text();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      if (typeof parsed?.error === "string" && parsed.error.trim()) return parsed.error;
    } catch {
      // Ignore JSON parse failure and use raw text.
    }
    return text;
  };

  const { data: combinedData, isLoading: combinedLoading, isError: combinedError, error: combinedErrorObj } = useQuery<DayBookReport>({
    queryKey: ["/api/reports/day-book", dateForApi],
    enabled: !isSpecialized,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("date", dateForApi);
      const res = await fetchWithAuth(`/api/reports/day-book?${params.toString()}`);
      if (!res.ok) {
        const msg = await readErrorMessage(res, "Failed to load day book");
        throw new Error(msg || "Failed to load day book");
      }
      return res.json();
    },
  });

  const {
    data: specializedDataRaw,
    isLoading: specializedLoading,
    isError: specializedError,
    error: specializedErrorObj,
  } = useQuery<Record<string, unknown>[] | { rows?: Record<string, unknown>[] }>({
    queryKey: [DAYBOOK_API_MAP[initialTab!], fromDate, toDate],
    enabled: isSpecialized && !!initialTab,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) {
        params.set("dateFrom", fromDate);
        params.set("fromDate", fromDate);
      }
      if (toDate) {
        params.set("dateTo", toDate);
        params.set("toDate", toDate);
      }
      const url = `${DAYBOOK_API_MAP[initialTab!]}?${params.toString()}`;
      const res = await fetchWithAuth(url);
      if (!res.ok) {
        const msg = await readErrorMessage(res, `Failed to load ${pageTitle || initialTab}`);
        throw new Error(msg || `Failed to load ${pageTitle || initialTab}`);
      }
      return res.json();
    },
  });
  const specializedData = Array.isArray(specializedDataRaw)
    ? specializedDataRaw
    : Array.isArray((specializedDataRaw as { rows?: Record<string, unknown>[] } | undefined)?.rows)
      ? ((specializedDataRaw as { rows?: Record<string, unknown>[] }).rows ?? [])
      : [];

  const isLoading = isSpecialized ? specializedLoading : combinedLoading;
  const queryError = isSpecialized ? specializedErrorObj : combinedErrorObj;
  const hasError = isSpecialized ? specializedError : combinedError;

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

  const mapSpecializedToDisplay = (): DayBookDisplayRow[] => {
    if (!initialTab || !specializedData?.length) return [];
    const rows = specializedData as any[];
    switch (initialTab) {
      case "sales":
        return rows.map((r, i) => ({
          srNo: String(i + 1),
          id: r.invoice_number || String(r.id || "-"),
          type: "Sale",
          particulars: [r.customer_name || "-", r.description || "-"].join("\n"),
          receipt: formatAmount(r.total_amount),
          payment: formatAmount(r.paid_amount),
          balance: formatBalance(parseFloat(r.total_amount || "0") - parseFloat(r.paid_amount || "0")),
          isTotal: false,
        }));
      case "purchases":
        return rows.map((r, i) => ({
          srNo: String(i + 1),
          id: r.invoice_number || String(r.id || "-"),
          type: "Purchase",
          particulars: [r.supplier_name || "-", r.description || "-"].join("\n"),
          receipt: "0.00",
          payment: formatAmount(r.total_amount),
          balance: formatBalance(parseFloat(r.total_amount || "0") - parseFloat(r.paid_amount || "0")),
          isTotal: false,
        }));
      case "cash":
        return rows.map((r, i) => ({
          srNo: String(i + 1),
          id: r.reference_number || String(r.id || "-"),
          type: r.transaction_type || "-",
          particulars: [r.party_name || "-", r.description || r.notes || "-"].join("\n"),
          receipt: (r.transaction_type || "").toLowerCase() === "receipt" ? formatAmount(r.amount) : "0.00",
          payment: (r.transaction_type || "").toLowerCase() === "payment" ? formatAmount(r.amount) : "0.00",
          balance: "",
          isTotal: false,
        }));
      case "sales-returns":
        return rows.map((r, i) => ({
          srNo: String(i + 1),
          id: r.credit_note_number || String(r.id || "-"),
          type: "Sales Return",
          particulars: [r.customer_name || "-", r.description || r.reason || r.notes || "-"].join("\n"),
          receipt: "0.00",
          payment: formatAmount(r.total_credit_amount),
          balance: "",
          isTotal: false,
        }));
      case "purchase-returns":
        return rows.map((r, i) => ({
          srNo: String(i + 1),
          id: r.debit_note_number || String(r.id || "-"),
          type: "Purchase Return",
          particulars: [r.supplier_name || "-", r.description || r.reason || r.notes || "-"].join("\n"),
          receipt: formatAmount(r.total_debit_amount),
          payment: "0.00",
          balance: "",
          isTotal: false,
        }));
      case "general-journal":
        return rows.map((r, i) => ({
          srNo: String(i + 1),
          id: r.journal_entry_number || String(r.id || "-"),
          type: "Journal",
          particulars: r.description || "-",
          receipt: formatAmount(r.total_debits),
          payment: formatAmount(r.total_credits),
          balance: "",
          isTotal: false,
        }));
      default:
        return [];
    }
  };

  const specializedTotals = useMemo(() => {
    if (!initialTab || !specializedData?.length) return { receipt: "0.00", payment: "0.00" };
    const rows = specializedData as any[];
    if (initialTab === "sales") {
      const total = rows.reduce((s, r) => s + parseFloat(r.total_amount || "0"), 0);
      const paid = rows.reduce((s, r) => s + parseFloat(r.paid_amount || "0"), 0);
      return { receipt: formatAmount(total), payment: formatAmount(paid) };
    }
    if (initialTab === "purchases") {
      const total = rows.reduce((s, r) => s + parseFloat(r.total_amount || "0"), 0);
      return { receipt: "0.00", payment: formatAmount(total) };
    }
    if (initialTab === "cash") {
      const receipt = rows.filter((r) => (r.transaction_type || "").toLowerCase() === "receipt").reduce((s, r) => s + parseFloat(r.amount || "0"), 0);
      const payment = rows.filter((r) => (r.transaction_type || "").toLowerCase() === "payment").reduce((s, r) => s + parseFloat(r.amount || "0"), 0);
      return { receipt: formatAmount(receipt), payment: formatAmount(payment) };
    }
    if (initialTab === "sales-returns") {
      const total = rows.reduce((s, r) => s + parseFloat(r.total_credit_amount || "0"), 0);
      return { receipt: "0.00", payment: formatAmount(total) };
    }
    if (initialTab === "purchase-returns") {
      const total = rows.reduce((s, r) => s + parseFloat(r.total_debit_amount || "0"), 0);
      return { receipt: formatAmount(total), payment: "0.00" };
    }
    if (initialTab === "general-journal") {
      const debit = rows.reduce((s, r) => s + parseFloat(r.total_debits || "0"), 0);
      const credit = rows.reduce((s, r) => s + parseFloat(r.total_credits || "0"), 0);
      return { receipt: formatAmount(debit), payment: formatAmount(credit) };
    }
    return { receipt: "0.00", payment: "0.00" };
  }, [initialTab, specializedData]);

  const displayRows = useMemo((): DayBookDisplayRow[] => {
    if (isSpecialized) {
      const mapped = mapSpecializedToDisplay();
      const totalRow: DayBookDisplayRow = {
        srNo: "",
        id: "",
        type: "",
        particulars: "Total:",
        receipt: specializedTotals.receipt,
        payment: specializedTotals.payment,
        balance: "",
        isTotal: true,
      };
      return [...mapped, totalRow];
    }
    const rows = combinedData?.rows || [];
    const totals = combinedData?.totals || { receipt: "0", payment: "0" };
    const voucherRows = rows.map((row) => ({
      srNo: String(row.srNo),
      id: row.id || "-",
      type: row.type || "-",
      particulars: [`[${row.partyName || "-"}]`, row.mode || ""].filter(Boolean).join("\n"),
      receipt: formatAmount(row.receipt),
      payment: formatAmount(row.payment),
      balance: formatBalance(row.balanceAmount, row.balanceType),
      isTotal: false,
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
    return [...voucherRows, totalRow];
  }, [isSpecialized, combinedData, specializedData, initialTab, specializedTotals]);

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

  const title = pageTitle || "Day Book";
  const selectedDateLabel = (selectedDate || dateForApi) ? format(new Date(selectedDate || dateForApi), "dd MMM yyyy") : "";
  const subtitle = isSpecialized
    ? (fromDate || toDate ? `${title} (${fromDate ? format(new Date(fromDate), "dd MMM yy") : "..."} - ${toDate ? format(new Date(toDate), "dd MMM yy") : "..."})` : title)
    : selectedDateLabel ? `Day Book (${selectedDateLabel})` : "Daily voucher summary";

  const printParams = isSpecialized
    ? {
        daybookType: initialTab,
        dateFrom: fromDate || undefined,
        dateTo: toDate || undefined,
      }
    : {
        daybookType: "legacy",
        date: dateForApi,
      };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <PrintActions
          docKey={docKeys.dayBook}
          params={printParams}
          title={title}
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
          {hasError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {queryError instanceof Error ? queryError.message : "Failed to load daybook report"}
            </div>
          ) : null}
          <DataTable
            columns={columns}
            data={hasError ? [] : displayRows}
            isLoading={isLoading}
            searchable={false}
            emptyMessage="No entries found"
          />
        </CardContent>
      </Card>
    </div>
  );
}

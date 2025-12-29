import { Suspense, lazy, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import type { Account } from "@shared/schema";
import { format } from "date-fns";
import { useReportDetail } from "@/components/report-detail-hook";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";

const ReportDetailDialog = lazy(() =>
  import("@/components/report-detail-dialog").then((mod) => ({
    default: mod.ReportDetailDialog,
  })),
);

type OutstandingCustomerRow = {
  saleId: number;
  invoiceNumber: string;
  saleDate: string | number | Date;
  customerId: number;
  customerName: string;
  invoiceAmount: string;
  receivedAmount: string;
  outstandingAmount: string;
  dueDate: string | number | Date | null;
  daysOutstanding: number;
  bucket0To30: string;
  bucket31To60: string;
  bucket61To90: string;
  bucket91Plus: string;
};

type OutstandingCustomersReport = {
  rows: OutstandingCustomerRow[];
  totals: {
    invoiceAmount: string;
    receivedAmount: string;
    outstandingAmount: string;
    bucket0To30: string;
    bucket31To60: string;
    bucket61To90: string;
    bucket91Plus: string;
  };
};

export default function OutstandingCustomersPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOfDate, setAsOfDate] = useState(today);
  const [customerId, setCustomerId] = useState<string>("all");
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();

  const { data: customers = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=customer"],
  });

  const { data, isLoading } = useQuery<OutstandingCustomersReport>({
    queryKey: ["/api/reports/outstanding-customers", asOfDate, customerId],
    enabled: !!asOfDate,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("asOfDate", asOfDate);
      if (customerId !== "all") params.set("customerId", customerId);
      const res = await fetchWithAuth(`/api/reports/outstanding-customers?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load outstanding customers");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {
    invoiceAmount: "0",
    receivedAmount: "0",
    outstandingAmount: "0",
    bucket0To30: "0",
    bucket31To60: "0",
    bucket61To90: "0",
    bucket91Plus: "0",
  };

  const columns: Column<OutstandingCustomerRow>[] = useMemo(
    () => [
      { key: "invoiceNumber", title: "Invoice #", render: (r) => <span className="font-mono">{r.invoiceNumber}</span> },
      { key: "saleDate", title: "Date", render: (r) => <span className="font-mono">{format(new Date(r.saleDate), "dd-MM-yyyy")}</span> },
      { key: "customerName", title: "Customer" },
      { key: "invoiceAmount", title: "Invoice", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.invoiceAmount || 0).toLocaleString()}</span> },
      { key: "receivedAmount", title: "Received", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.receivedAmount || 0).toLocaleString()}</span> },
      { key: "outstandingAmount", title: "Outstanding", align: "right", render: (r) => <span className="font-mono font-semibold text-destructive">Rs. {Number(r.outstandingAmount || 0).toLocaleString()}</span> },
      { key: "daysOutstanding", title: "Days", align: "right" },
      { key: "bucket0To30", title: "0-30", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.bucket0To30 || 0).toLocaleString()}</span> },
      { key: "bucket31To60", title: "31-60", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.bucket31To60 || 0).toLocaleString()}</span> },
      { key: "bucket61To90", title: "61-90", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.bucket61To90 || 0).toLocaleString()}</span> },
      { key: "bucket91Plus", title: "91+", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.bucket91Plus || 0).toLocaleString()}</span> },
      { key: "dueDate", title: "Due Date", render: (r) => (r.dueDate ? format(new Date(r.dueDate), "dd-MM-yyyy") : "-") },
    ],
    [],
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outstanding Customers</h1>
          <p className="text-sm text-muted-foreground">Outstanding = Invoice Amount - Receipts/Adjustments.</p>
        </div>
        <PrintActions
          docKey={docKeys.outstandingCustomers}
          params={{ asOfDate: asOfDate || undefined, customerId: customerId !== "all" ? customerId : undefined }}
          title="Outstanding Customers"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>As of Date</Label>
              <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Invoice" value={totals.invoiceAmount} />
        <SummaryCard label="Received" value={totals.receivedAmount} />
        <SummaryCard label="Outstanding" value={totals.outstandingAmount} highlight />
        <SummaryCard label="91+ Days" value={totals.bucket91Plus} highlight />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            searchable
            emptyMessage="No outstanding invoices"
            onRowClick={(row) => openDetail({ type: "sale", id: row.saleId })}
          />
        </CardContent>
      </Card>

      {reference ? (
        <Suspense fallback={null}>
          <ReportDetailDialog
            reference={reference}
            open={!!reference}
            onOpenChange={(open) => (!open ? closeDetail() : null)}
            detail={detail || null}
            isLoading={isDetailLoading}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-destructive/30 shadow-sm" : ""}>
      <CardContent className="pt-4 space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold font-mono ${highlight ? "text-destructive" : ""}`}>
          Rs. {Number(value || 0).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

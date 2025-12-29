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

type OutstandingSupplierRow = {
  purchaseId: number;
  invoiceNumber: string;
  purchaseDate: string | number | Date;
  supplierId: number;
  supplierName: string;
  billAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  dueDate: string | number | Date | null;
  daysOutstanding: number;
  bucket0To30: string;
  bucket31To60: string;
  bucket61To90: string;
  bucket91Plus: string;
};

type OutstandingSuppliersReport = {
  rows: OutstandingSupplierRow[];
  totals: {
    billAmount: string;
    paidAmount: string;
    outstandingAmount: string;
    bucket0To30: string;
    bucket31To60: string;
    bucket61To90: string;
    bucket91Plus: string;
  };
};

export default function OutstandingSuppliersPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOfDate, setAsOfDate] = useState(today);
  const [supplierId, setSupplierId] = useState<string>("all");
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();

  const { data: suppliers = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=supplier"],
  });

  const { data, isLoading } = useQuery<OutstandingSuppliersReport>({
    queryKey: ["/api/reports/outstanding-suppliers", asOfDate, supplierId],
    enabled: !!asOfDate,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("asOfDate", asOfDate);
      if (supplierId !== "all") params.set("supplierId", supplierId);
      const res = await fetchWithAuth(`/api/reports/outstanding-suppliers?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load outstanding suppliers");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {
    billAmount: "0",
    paidAmount: "0",
    outstandingAmount: "0",
    bucket0To30: "0",
    bucket31To60: "0",
    bucket61To90: "0",
    bucket91Plus: "0",
  };

  const columns: Column<OutstandingSupplierRow>[] = useMemo(
    () => [
      { key: "invoiceNumber", title: "Bill #", render: (r) => <span className="font-mono">{r.invoiceNumber}</span> },
      { key: "purchaseDate", title: "Date", render: (r) => <span className="font-mono">{format(new Date(r.purchaseDate), "dd-MM-yyyy")}</span> },
      { key: "supplierName", title: "Supplier" },
      { key: "billAmount", title: "Bill", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.billAmount || 0).toLocaleString()}</span> },
      { key: "paidAmount", title: "Paid", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.paidAmount || 0).toLocaleString()}</span> },
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
          <h1 className="text-2xl font-semibold tracking-tight">Outstanding Suppliers</h1>
          <p className="text-sm text-muted-foreground">Outstanding = Bill Amount - Payments/Adjustments.</p>
        </div>
        <PrintActions
          docKey={docKeys.outstandingSuppliers}
          params={{ asOfDate: asOfDate || undefined, supplierId: supplierId !== "all" ? supplierId : undefined }}
          title="Outstanding Suppliers"
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
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Bills" value={totals.billAmount} />
        <SummaryCard label="Paid" value={totals.paidAmount} />
        <SummaryCard label="Outstanding" value={totals.outstandingAmount} highlight />
        <SummaryCard label="91+ Days" value={totals.bucket91Plus} highlight />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bills</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            searchable
            emptyMessage="No outstanding bills"
            onRowClick={(row) => openDetail({ type: "purchase", id: row.purchaseId })}
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

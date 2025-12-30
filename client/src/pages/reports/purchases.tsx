import { Suspense, lazy, useState } from "react";
import { Download, ShoppingCart, Truck, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import type { Account, Product } from "@shared/schema";
import { format } from "date-fns";
import { useReportDetail } from "@/components/report-detail-hook";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ReportDetailDialog = lazy(() =>
  import("@/components/report-detail-dialog").then((mod) => ({
    default: mod.ReportDetailDialog,
  })),
);

type PurchaseReportRow = {
  id: number;
  invoiceNumber: string;
  purchaseDate: string | number | Date;
  supplierId: number;
  supplierName: string;
  subtotal: string;
  discount: string;
  tax: string;
  otherCharges: string;
  total: string;
  paid: string;
  balance: string;
};

type PurchaseReport = {
  rows: PurchaseReportRow[];
  totals: {
    subtotal: string;
    discount: string;
    tax: string;
    otherCharges: string;
    total: string;
    paid: string;
    balance: string;
  };
};

export default function PurchaseReportPage() {
  const { t, isRTL, language } = useLanguage();
  const { range, setRange, fromDate, toDate } = useReportDateRange({ preset: "thisMonth" });
  const [supplierId, setSupplierId] = useState<string>("all");
  const [productId, setProductId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();

  const { data: suppliers = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=supplier"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data, isLoading } = useQuery<PurchaseReport>({
    queryKey: ["/api/reports/purchases", fromDate, toDate, supplierId, productId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (supplierId !== "all") params.set("supplierId", supplierId);
      if (productId !== "all") params.set("productId", productId);
      if (status !== "all") params.set("paymentStatus", status);
      const res = await fetch(`/api/reports/purchases?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch purchase report");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {
    subtotal: "0",
    discount: "0",
    tax: "0",
    otherCharges: "0",
    total: "0",
    paid: "0",
    balance: "0",
  };

  const columns: Column<PurchaseReportRow>[] = [
    {
      key: "invoiceNumber",
      title: "Purchase No",
      render: (item) => (
        <span className="font-mono text-sm font-medium">{item.invoiceNumber}</span>
      ),
    },
    {
      key: "purchaseDate",
      title: "Date",
      render: (item) => (
        <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span className="text-sm">
            {format(new Date(item.purchaseDate), "dd MMM yyyy")}
          </span>
        </div>
      ),
    },
    {
      key: "supplierName",
      title: "Supplier",
    },
    {
      key: "subtotal",
      title: "Subtotal",
      align: "right",
      render: (item) => (
        <span className="font-mono">
          Rs. {parseFloat(item.subtotal || "0").toLocaleString()}
        </span>
      ),
    },
    {
      key: "discount",
      title: "Discount",
      align: "right",
      render: (item) => (
        <span className="font-mono">
          Rs. {parseFloat(item.discount || "0").toLocaleString()}
        </span>
      ),
    },
    {
      key: "tax",
      title: "Tax",
      align: "right",
      render: (item) => (
        <span className="font-mono">
          Rs. {parseFloat(item.tax || "0").toLocaleString()}
        </span>
      ),
    },
    {
      key: "otherCharges",
      title: "Other",
      align: "right",
      render: (item) => (
        <span className="font-mono">
          Rs. {parseFloat(item.otherCharges || "0").toLocaleString()}
        </span>
      ),
    },
    {
      key: "total",
      title: "Total",
      align: "right",
      render: (item) => (
        <span className="font-mono font-medium">
          Rs. {parseFloat(item.total || "0").toLocaleString()}
        </span>
      ),
    },
    {
      key: "paid",
      title: "Paid",
      align: "right",
      render: (item) => (
        <span className="font-mono text-sm">
          Rs. {parseFloat(item.paid || "0").toLocaleString()}
        </span>
      ),
    },
    {
      key: "balance",
      title: "Balance",
      align: "right",
      render: (item) => (
        <span className="font-mono text-sm text-destructive">
          Rs. {parseFloat(item.balance || "0").toLocaleString()}
        </span>
      ),
    },
    {
      key: "status",
      title: "Status",
      align: "center",
      render: (item) => {
        const total = parseFloat(item.total || "0");
        const paid = parseFloat(item.paid || "0");
        const isPaid = paid >= total && total > 0;
        const isPartial = paid > 0 && paid < total;
        return (
          <Badge variant={isPaid ? "default" : isPartial ? "secondary" : "outline"} className="text-xs">
            {isPaid ? "Paid" : isPartial ? "Partial" : "Unpaid"}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("purchaseReport")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "Purchase transaction report" : "Purchase transaction report"}
          </p>
        </div>
        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <PrintActions
            docKey={docKeys.purchaseReport}
            params={{
              fromDate: fromDate || undefined,
              toDate: toDate || undefined,
              supplierId: supplierId !== "all" ? supplierId : undefined,
              productId: productId !== "all" ? productId : undefined,
              paymentStatus: status !== "all" ? status : undefined,
            }}
            title="Purchase Report"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className={`grid gap-4 md:grid-cols-6 ${isRTL ? "direction-rtl" : ""}`}>
            <div className="md:col-span-2">
              <Label>Date Range</Label>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
            <div>
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
            <div>
              <Label>Item</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="All items" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Purchases</CardTitle>
            <ShoppingCart className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              Rs. {parseFloat(totals.total || "0").toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{rows.length} transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle>
            <ShoppingCart className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono text-primary ${isRTL ? "text-right" : ""}`}>
              Rs. {parseFloat(totals.paid || "0").toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
            <Truck className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono text-destructive ${isRTL ? "text-right" : ""}`}>
              Rs. {parseFloat(totals.balance || "0").toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            onRowClick={(row) => openDetail({ type: "purchase", id: row.id })}
            testIdPrefix="purchases-report"
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

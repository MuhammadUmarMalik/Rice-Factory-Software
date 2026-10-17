import { Suspense, lazy, useEffect, useState } from "react";
import { Package, Scale, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import type { Product } from "@/types/schema";
import { useReportDetail } from "@/components/report-detail-hook";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { Label } from "@/components/ui/label";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";
import { apiRequest } from "@/lib/queryClient";
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

type StockReportRow = {
  productId: number;
  itemCode: string;
  itemName: string;
  category: string;
  unit: string;
  openingQty: string;
  openingValue: string;
  inQty: string;
  inValue: string;
  outQty: string;
  outValue: string;
  closingQty: string;
  closingValue: string;
  avgCost: string;
  currentStock: string;
};

type StockReport = {
  rows: StockReportRow[];
  totals: { openingQty: string; inQty: string; outQty: string; closingQty: string; closingValue: string };
  validation: {
    rollForwardOk: boolean;
    rollForwardDifference: string;
    // null when the selected window does not cover every movement up to now,
    // in which case closing qty cannot be compared to live product stock.
    stockMatchesLedger: boolean | null;
    stockDifference: string | null;
    mismatchedProducts: Array<{ productId: number; itemName: string; closingQty: string; currentStock: string }>;
  };
};

const qty = (value: string | number | null | undefined) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = (value: string | number | null | undefined) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function StockReportPage() {
  const { t, isRTL, language } = useLanguage();
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();
  const { range, setRange, fromDate, toDate } = useReportDateRange({ preset: "all" });
  const [productId, setProductId] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [unit, setUnit] = useState<string>("all");

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data, isLoading, error } = useQuery<StockReport>({
    queryKey: ["/api/reports/stock", fromDate, toDate, productId, category, unit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (productId !== "all") params.set("productId", productId);
      if (category !== "all") params.set("category", category);
      if (unit !== "all") params.set("unit", unit);
      const res = await apiRequest("GET", `/api/reports/stock?${params.toString()}`);
      return res.json();
    },
  });

  useEffect(() => {
    if (!error) return;
    const message = error instanceof Error ? error.message : String(error);
    window.electronLog?.write(`stock report error: ${message}`);
  }, [error]);

  const rows = data?.rows || [];
  const totalStockValue = parseFloat(data?.totals.closingValue || "0");
  const totalQuantity = parseFloat(data?.totals.closingQty || "0");
  const rollForwardOk = data?.validation.rollForwardOk ?? true;
  // Only comparable when the window covers every movement to date; otherwise the
  // backend returns null and there is nothing to warn about.
  const stockMatchesLedger = data?.validation.stockMatchesLedger ?? null;
  const mismatchedProducts = data?.validation.mismatchedProducts ?? [];
  const validationOk = rollForwardOk && stockMatchesLedger !== false;
  const validationLabel = !rollForwardOk
    ? "Inventory roll-forward mismatch"
    : stockMatchesLedger === false
      ? `Closing qty differs from live stock on ${mismatchedProducts.length} item(s)`
      : stockMatchesLedger === true
        ? "Closing qty matches live stock"
        : "Inventory roll-forward OK";

  // Figures stay on one line; "Rs." lives in the header and the unit has its own
  // column, so cells carry plain numbers that line up digit for digit.
  const figureCell = "px-3 text-sm";
  const figure = (
    key: keyof StockReportRow,
    title: string,
    format: (value: string) => string,
    emphasis = false,
  ): Column<StockReportRow> => ({
    key,
    title,
    align: "right",
    className: figureCell,
    render: (item) => (
      <span
        className={`whitespace-nowrap tabular-nums ${
          emphasis ? "font-semibold" : Number(item[key]) === 0 ? "text-muted-foreground" : ""
        }`}
      >
        {format(String(item[key] ?? "0"))}
      </span>
    ),
  });

  const columns: Column<StockReportRow>[] = [
    {
      key: "name",
      title: "Product",
      className: "min-w-[180px] px-3",
      render: (item) => (
        <div className={isRTL ? "text-right" : ""}>
          <p className="font-medium leading-tight">{item.itemName}</p>
          <p className="text-xs text-muted-foreground">Code: {item.itemCode}</p>
        </div>
      ),
    },
    {
      key: "unit",
      title: "Unit",
      align: "center",
      className: "whitespace-nowrap px-2",
      render: (item) => (
        <Badge variant="secondary" className="font-normal">
          {item.unit}
        </Badge>
      ),
    },
    {
      key: "category",
      title: "Category",
      align: "center",
      className: "whitespace-nowrap px-2",
      render: (item) => (
        <Badge variant="outline" className="font-normal capitalize">
          {item.category || "-"}
        </Badge>
      ),
    },
    figure("openingQty", "Opening Qty", qty),
    figure("openingValue", "Opening Value (Rs.)", money),
    figure("inQty", "In Qty", qty),
    figure("inValue", "In Value (Rs.)", money),
    figure("outQty", "Out Qty", qty),
    figure("outValue", "Out Value (Rs.)", money),
    figure("closingQty", "Closing Qty", qty, true),
    figure("avgCost", "Avg Cost (Rs.)", money),
    figure("closingValue", "Closing Value (Rs.)", money, true),
  ];

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("stockReport")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "Inventory roll-forward view" : "Inventory roll-forward view"}
          </p>
        </div>
        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <PrintActions
            docKey={docKeys.stockReport}
            params={{
              fromDate: fromDate || undefined,
              toDate: toDate || undefined,
              productId: productId !== "all" ? productId : undefined,
              category: category !== "all" ? category : undefined,
              unit: unit !== "all" ? unit : undefined,
            }}
            title="Stock Report"
            orientation="landscape"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              {rows.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Quantity</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              {qty(totalQuantity)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("stockValue")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono text-primary ${isRTL ? "text-right" : ""}`}>
              Rs. {money(totalStockValue)}
            </div>
            <p className={`text-xs mt-1 ${validationOk ? "text-muted-foreground" : "text-destructive"}`}>
              {validationLabel}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className={`grid gap-4 md:grid-cols-5 ${isRTL ? "direction-rtl" : ""}`}>
            <div className="md:col-span-2">
              <Label>Date Range</Label>
              <DateRangeFilter value={range} onChange={setRange} />
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
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {Array.from(new Set(products.map((p) => p.productType).filter(Boolean))).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="All units" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {Array.from(new Set(products.map((p) => p.unit))).map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {error ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load stock report"}
            </div>
          ) : null}
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            onRowClick={(row) => openDetail({ type: "product", id: row.productId })}
            testIdPrefix="stock"
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

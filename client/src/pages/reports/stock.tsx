import { Suspense, lazy, useState } from "react";
import { Package, Scale, TrendingUp, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import type { Product } from "@shared/schema";
import { useReportDetail } from "@/components/report-detail-hook";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  validation: { rollForwardOk: boolean; rollForwardDifference: string };
};

export default function StockReportPage() {
  const { t, isRTL, language } = useLanguage();
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [productId, setProductId] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [unit, setUnit] = useState<string>("all");

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data, isLoading } = useQuery<StockReport>({
    queryKey: ["/api/reports/stock", fromDate, toDate, productId, category, unit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (productId !== "all") params.set("productId", productId);
      if (category !== "all") params.set("category", category);
      if (unit !== "all") params.set("unit", unit);
      const res = await fetch(`/api/reports/stock?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch stock report");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const totalStockValue = parseFloat(data?.totals.closingValue || "0");
  const totalQuantity = parseFloat(data?.totals.closingQty || "0");
  const rollForwardOk = data?.validation.rollForwardOk ?? true;

  const columns: Column<StockReportRow>[] = [
    {
      key: "name",
      title: "Product",
      render: (item) => (
        <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium">{item.itemName}</p>
            <p className="text-xs text-muted-foreground">Code: {item.itemCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: "unit",
      title: "Unit",
      align: "center",
      render: (item) => (
        <Badge variant="secondary" className="font-mono">
          {item.unit}
        </Badge>
      ),
    },
    {
      key: "category",
      title: "Category",
      align: "center",
      render: (item) => (
        <Badge variant="outline" className="capitalize">
          {item.category || "-"}
        </Badge>
      ),
    },
    {
      key: "openingQty",
      title: "Opening Qty",
      align: "right",
      render: (item) => (
        <span className="font-mono">
          {Number(item.openingQty || 0).toLocaleString()} {item.unit}
        </span>
      ),
    },
    {
      key: "openingValue",
      title: "Opening Value",
      align: "right",
      render: (item) => (
        <span className="font-mono">
          Rs. {Number(item.openingValue || 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: "inQty",
      title: "In Qty",
      align: "right",
      render: (item) => (
        <span className="font-mono">
          {Number(item.inQty || 0).toLocaleString()} {item.unit}
        </span>
      ),
    },
    {
      key: "inValue",
      title: "In Value",
      align: "right",
      render: (item) => (
        <span className="font-mono">
          Rs. {Number(item.inValue || 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: "outQty",
      title: "Out Qty",
      align: "right",
      render: (item) => (
        <span className="font-mono">
          {Number(item.outQty || 0).toLocaleString()} {item.unit}
        </span>
      ),
    },
    {
      key: "outValue",
      title: "Out Value",
      align: "right",
      render: (item) => (
        <span className="font-mono">
          Rs. {Number(item.outValue || 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: "closingQty",
      title: "Closing Qty",
      align: "right",
      render: (item) => (
        <span className="font-mono font-medium">
          {Number(item.closingQty || 0).toLocaleString()} {item.unit}
        </span>
      ),
    },
    {
      key: "avgCost",
      title: "Avg Cost",
      align: "right",
      render: (item) => (
        <span className="font-mono text-sm">
          Rs. {Number(item.avgCost || 0).toLocaleString()}/{item.unit}
        </span>
      ),
    },
    {
      key: "closingValue",
      title: "Closing Value",
      align: "right",
      render: (item) => (
        <span className="font-mono font-medium">
          Rs. {Number(item.closingValue || 0).toLocaleString()}
        </span>
      ),
    },
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
              {totalQuantity.toLocaleString()}
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
              Rs. {totalStockValue.toLocaleString()}
            </div>
            <p className={`text-xs mt-1 ${rollForwardOk ? "text-muted-foreground" : "text-destructive"}`}>
              {rollForwardOk ? "Inventory roll-forward OK" : "Inventory roll-forward mismatch"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className={`grid gap-4 md:grid-cols-5 ${isRTL ? "direction-rtl" : ""}`}>
            <div>
              <Label>From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
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

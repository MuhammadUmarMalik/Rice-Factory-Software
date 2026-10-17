import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Product } from "@/types/schema";
import { format } from "date-fns";
import clsx from "clsx";
import { Link } from "wouter";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";
import { SkeletonBox } from "@/components/ui/skeletons";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";

type ProductLedgerRow = {
  id: number;
  productId: number;
  productName: string;
  productType: string;
  unit: string;
  entryDate: string | number | Date;
  voucherType: string;
  voucherNo: string;
  partyName: string;
  narration: string;
  quantityIn: string;
  quantityOut: string;
  rate: string;
  amount: string;
  runningBalance: string;
};

type ProductLedgerReport = {
  product: Product | null;
  rows: ProductLedgerRow[];
  totals: { quantityIn: string; quantityOut: string; closingBalance: string };
  openingBalance: string;
};

type ProductLedgerPageProps = {
  initialType?: "raw" | "bio";
};

export default function ProductLedgerPage({ initialType }: ProductLedgerPageProps = {}) {
  const { isRTL } = useLanguage();
  const [selectedProductId, setSelectedProductId] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>(initialType || "all");
  const { range, setRange, fromDate, toDate } = useReportDateRange({ preset: "all" });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const filteredProducts = useMemo(() => {
    if (typeFilter === "all") return products;
    return products.filter((p) => (p.productType || "").toLowerCase() === typeFilter);
  }, [products, typeFilter]);

  const { data: ledgerReport, isLoading } = useQuery<ProductLedgerReport>({
    queryKey: ["/api/reports/product-ledger", selectedProductId, typeFilter, fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedProductId !== "all") params.set("productId", selectedProductId);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (fromDate) params.set("startDate", fromDate);
      if (toDate) params.set("endDate", toDate);
      const res = await fetchWithAuth(`/api/reports/product-ledger?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch product ledger");
      return res.json();
    },
  });

  const ledgerRows = ledgerReport?.rows || [];
  const openingBalance = ledgerReport?.openingBalance || "0";
  const totals = ledgerReport?.totals || { quantityIn: "0", quantityOut: "0", closingBalance: "0" };

  const formatAmount = (value?: string | number) => {
    const num = typeof value === "number" ? value : parseFloat(value || "0");
    if (!Number.isFinite(num)) return "0.00";
    return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatQty = (value?: string | number) => {
    const num = typeof value === "number" ? value : parseFloat(value || "0");
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const tabs = [
    { label: "All", value: "all" },
    { label: "Raw", value: "raw" },
    { label: "Bio", value: "bio" },
  ];

  useEffect(() => {
    if (selectedProductId !== "all") {
      const product = products.find((p) => p.id.toString() === selectedProductId);
      if (product && typeFilter !== "all" && product.productType !== typeFilter) {
        setSelectedProductId("all");
      }
    }
  }, [typeFilter, products, selectedProductId]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isRTL ? "مصنوعات کی لیجر" : "Product Ledger"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isRTL
              ? "مصنوعات کی اسٹاک تحریری لیجر"
              : "Stock movement ledger for raw and bio products"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/reports/ledger-journal">
            <Button variant="outline" size="sm">
              {isRTL ? "جرنل واؤچر" : "Journal Voucher"}
            </Button>
          </Link>
          <PrintActions
            docKey={docKeys.ledger}
            params={{
              productId: selectedProductId !== "all" ? selectedProductId : undefined,
              type: typeFilter !== "all" ? typeFilter : undefined,
              startDate: fromDate || undefined,
              endDate: toDate || undefined,
              language: isRTL ? "ur" : "en",
            }}
            title={isRTL ? "مصنوعات کی لیجر" : "Product Ledger"}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.value}
            variant={typeFilter === tab.value ? "default" : "ghost"}
            className={clsx("px-4", typeFilter === tab.value ? "shadow-sm" : "text-muted-foreground")}
            onClick={() => setTypeFilter(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <Label>Date Range</Label>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
            <div>
              <Label>Select Product</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="All products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {filteredProducts.map((product) => (
                    <SelectItem key={product.id} value={product.id.toString()}>
                      {product.name} ({product.productType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {isRTL ? "مصنوعات کی لیجر" : "Product Ledger"}
          </p>
          <CardTitle className="text-lg font-semibold">
            {selectedProductId !== "all"
              ? products.find((p) => p.id.toString() === selectedProductId)?.name || ""
              : isRTL ? "تمام مصنوعات" : "All Products"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {isRTL ? "ابتدائی بیلنس" : "Opening Balance"}: {formatQty(openingBalance)}
            {products.find((p) => p.id.toString() === selectedProductId)?.unit || "kg"}
          </p>
          {(fromDate || toDate) && (
            <p className="text-xs text-muted-foreground">
              {fromDate ? format(new Date(fromDate), "dd MMM yyyy") : "Start"} -{" "}
              {toDate ? format(new Date(toDate), "dd MMM yyyy") : "Today"}
            </p>
          )}
        </CardHeader>
        <CardContent className="overflow-auto">
          <div className="min-w-[900px] border rounded-lg bg-white">
            {/* Header */}
            <div className="grid grid-cols-[90px,100px,100px,1fr,80px,90px,90px,90px,90px,100px] bg-muted/60 text-[11px] font-semibold uppercase tracking-wide border-b">
              <div className="px-2 py-2 border-r">{isRTL ? "تاریخ" : "Date"}</div>
              <div className="px-2 py-2 border-r">{isRTL ? "واؤچر" : "Vch Type"}</div>
              <div className="px-2 py-2 border-r">{isRTL ? "واؤڈر نمبر" : "Vch No"}</div>
              <div className="px-2 py-2 border-r">{isRTL ? "تفصیل" : "Narration"}</div>
              <div className="px-2 py-2 border-r">{isRTL ? "پارٹی" : "Party"}</div>
              <div className="px-2 py-2 border-r text-right">{isRTL ? "آن" : "In"}</div>
              <div className="px-2 py-2 border-r text-right">{isRTL ? "آؤٹ" : "Out"}</div>
              <div className="px-2 py-2 border-r text-right">{isRTL ? "ریٹ" : "Rate"}</div>
              <div className="px-2 py-2 border-r text-right">{isRTL ? "رقم" : "Amount"}</div>
              <div className="px-2 py-2 text-right">{isRTL ? "بیلنس" : "Balance"}</div>
            </div>

            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[90px,100px,100px,1fr,80px,90px,90px,90px,90px,100px] text-sm border-b last:border-b-0"
                  >
                    <div className="px-2 py-2 border-r"><SkeletonBox className="h-3 w-12" /></div>
                    <div className="px-2 py-2 border-r"><SkeletonBox className="h-3 w-10" /></div>
                    <div className="px-2 py-2 border-r"><SkeletonBox className="h-3 w-10" /></div>
                    <div className="px-2 py-2 border-r"><SkeletonBox className="h-4 w-5/6" /></div>
                    <div className="px-2 py-2 border-r"><SkeletonBox className="h-3 w-8" /></div>
                    <div className="px-2 py-2 border-r"><SkeletonBox className="h-3 w-10 ml-auto" /></div>
                    <div className="px-2 py-2 border-r"><SkeletonBox className="h-3 w-10 ml-auto" /></div>
                    <div className="px-2 py-2 border-r"><SkeletonBox className="h-3 w-10 ml-auto" /></div>
                    <div className="px-2 py-2 border-r"><SkeletonBox className="h-3 w-10 ml-auto" /></div>
                    <div className="px-2 py-2"><SkeletonBox className="h-3 w-10 ml-auto" /></div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {ledgerRows.length === 0 ? (
                  <div className="px-3 py-3 text-center text-muted-foreground text-sm border-b">
                    {isRTL ? "اس رینج کے لیے کوئی اندراج نہیں" : "No entries for this range."}
                  </div>
                ) : (
                  ledgerRows.map((entry, idx) => (
                    <div
                      key={`${entry.voucherType}-${entry.id}-${idx}`}
                      className={clsx(
                        "grid grid-cols-[90px,100px,100px,1fr,80px,90px,90px,90px,90px,100px] text-sm border-b last:border-b-0",
                        idx % 2 === 0 ? "bg-white" : "bg-muted/20",
                      )}
                    >
                      <div className="px-2 py-2 border-r text-xs text-muted-foreground font-mono">
                        {format(new Date(entry.entryDate), "dd.MM.yy")}
                      </div>
                      <div className="px-2 py-2 border-r">
                        <span
                          className={clsx(
                            "text-xs font-medium px-1.5 py-0.5 rounded",
                            entry.voucherType === "Purchase" && "bg-green-100 text-green-700",
                            entry.voucherType === "Sale" && "bg-blue-100 text-blue-700",
                            entry.voucherType === "Processing-In" && "bg-purple-100 text-purple-700",
                            entry.voucherType === "Processing-Out" && "bg-orange-100 text-orange-700",
                          )}
                        >
                          {entry.voucherType}
                        </span>
                      </div>
                      <div className="px-2 py-2 border-r text-xs font-mono text-muted-foreground">
                        {entry.voucherNo}
                      </div>
                      <div className="px-2 py-2 border-r">
                        <div className="text-sm font-medium leading-5">{entry.narration}</div>
                      </div>
                      <div className="px-2 py-2 border-r text-xs text-muted-foreground">
                        {entry.partyName}
                      </div>
                      <div className="px-2 py-2 border-r text-right font-mono tabular-nums text-green-700">
                        {parseFloat(entry.quantityIn) > 0 ? formatQty(entry.quantityIn) : "-"}
                      </div>
                      <div className="px-2 py-2 border-r text-right font-mono tabular-nums text-red-700">
                        {parseFloat(entry.quantityOut) > 0 ? formatQty(entry.quantityOut) : "-"}
                      </div>
                      <div className="px-2 py-2 border-r text-right font-mono tabular-nums text-muted-foreground">
                        {parseFloat(entry.rate) > 0 ? formatAmount(entry.rate) : "-"}
                      </div>
                      <div className="px-2 py-2 border-r text-right font-mono tabular-nums">
                        {parseFloat(entry.amount) > 0 ? formatAmount(entry.amount) : "-"}
                      </div>
                      <div className="px-2 py-2 text-right font-mono tabular-nums font-semibold">
                        {formatQty(entry.runningBalance)}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {ledgerReport && !isLoading && ledgerRows.length > 0 && (
              <div className="grid grid-cols-[90px,100px,100px,1fr,80px,90px,90px,90px,90px,100px] bg-muted/80 text-sm font-semibold border-t">
                <div className="px-2 py-2 border-r"></div>
                <div className="px-2 py-2 border-r"></div>
                <div className="px-2 py-2 border-r"></div>
                <div className="px-2 py-2 border-r">{isRTL ? "کل" : "Totals"}</div>
                <div className="px-2 py-2 border-r"></div>
                <div className="px-2 py-2 border-r text-right font-mono tabular-nums">
                  {formatQty(totals.quantityIn)}
                </div>
                <div className="px-2 py-2 border-r text-right font-mono tabular-nums">
                  {formatQty(totals.quantityOut)}
                </div>
                <div className="px-2 py-2 border-r"></div>
                <div className="px-2 py-2 border-r"></div>
                <div className="px-2 py-2 text-right font-mono tabular-nums">
                  {formatQty(totals.closingBalance)}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

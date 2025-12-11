import { Package, Scale, TrendingUp, Download, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import type { Product } from "@shared/schema";

export default function StockReportPage() {
  const { t, isRTL, language } = useLanguage();

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const totalStockValue = products.reduce((sum, p) => {
    const stock = parseFloat(p.currentStock || "0");
    const price = parseFloat(p.avgPurchasePrice || "0");
    return sum + (stock * price);
  }, 0);

  const totalQuantity = products.reduce((sum, p) => sum + parseFloat(p.currentStock || "0"), 0);

  const columns: Column<Product>[] = [
    {
      key: "name",
      title: "Product",
      titleUrdu: "مصنوعات",
      render: (item) => (
        <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium">{item.name}</p>
            {item.nameUrdu && (
              <p className="text-sm text-muted-foreground font-urdu">{item.nameUrdu}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "unit",
      title: "Unit",
      titleUrdu: "یونٹ",
      align: "center",
      render: (item) => (
        <Badge variant="secondary" className="font-mono">
          {item.unit}
        </Badge>
      ),
    },
    {
      key: "currentStock",
      title: "Current Stock",
      titleUrdu: "موجودہ سٹاک",
      align: "right",
      render: (item) => {
        const stock = parseFloat(item.currentStock || "0");
        return (
          <div className={`flex items-center gap-2 justify-end ${isRTL ? "flex-row-reverse" : ""}`}>
            <Scale className="h-3 w-3 text-muted-foreground" />
            <span className={`font-mono font-medium ${stock > 0 ? "" : "text-muted-foreground"}`}>
              {stock.toLocaleString()} {item.unit}
            </span>
          </div>
        );
      },
    },
    {
      key: "avgPurchasePrice",
      title: "Avg. Cost",
      titleUrdu: "اوسط لاگت",
      align: "right",
      render: (item) => (
        <span className="font-mono text-sm">
          Rs. {parseFloat(item.avgPurchasePrice || "0").toLocaleString()}/{item.unit}
        </span>
      ),
    },
    {
      key: "salePrice",
      title: "Sale Price",
      titleUrdu: "فروخت قیمت",
      align: "right",
      render: (item) => (
        <span className="font-mono font-medium text-primary">
          Rs. {parseFloat(item.salePrice || "0").toLocaleString()}/{item.unit}
        </span>
      ),
    },
    {
      key: "value",
      title: "Stock Value",
      titleUrdu: "سٹاک ویلیو",
      align: "right",
      render: (item) => {
        const stock = parseFloat(item.currentStock || "0");
        const price = parseFloat(item.avgPurchasePrice || "0");
        const value = stock * price;
        return (
          <span className="font-mono font-medium">
            Rs. {value.toLocaleString()}
          </span>
        );
      },
    },
  ];

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("stockReport")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "موجودہ سٹاک کی تفصیلات" : "Current inventory details"}
          </p>
        </div>
        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Button variant="outline" data-testid="button-export">
            <Download className="h-4 w-4" />
            {t("export")}
          </Button>
          <Button variant="outline" data-testid="button-print">
            <Printer className="h-4 w-4" />
            {t("print")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {language === "ur" ? "کل آئٹمز" : "Total Products"}
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              {products.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {language === "ur" ? "کل مقدار" : "Total Quantity"}
            </CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              {totalQuantity.toLocaleString()} kg
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={products}
            isLoading={isLoading}
            testIdPrefix="stock"
          />
        </CardContent>
      </Card>
    </div>
  );
}

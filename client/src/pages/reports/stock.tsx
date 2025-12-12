import { Package, Scale, TrendingUp, Download, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import type { Product } from "@shared/schema";

type StockReportRow = {
  product: Product;
  totalPurchased: string;
  totalSold: string;
  currentStock: string;
};

export default function StockReportPage() {
  const { t, isRTL, language } = useLanguage();

  const { data: products = [], isLoading } = useQuery<StockReportRow[]>({
    queryKey: ["/api/reports/stock"],
  });

  const totalStockValue = products.reduce((sum, p) => {
    const stock = parseFloat(p.currentStock || "0");
    const price = parseFloat(p.product.avgPurchasePrice || "0");
    return sum + stock * price;
  }, 0);

  const totalQuantity = products.reduce((sum, p) => sum + parseFloat(p.currentStock || "0"), 0);

  const columns: Column<StockReportRow>[] = [
    {
      key: "name",
      title: "Product",
      titleUrdu: "U.OæU+U^O1OO¦",
      render: (item) => (
        <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium">{item.product.name}</p>
            {item.product.nameUrdu && (
              <p className="text-sm text-muted-foreground font-urdu">{item.product.nameUrdu}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "unit",
      title: "Unit",
      titleUrdu: "UOU^U+U1",
      align: "center",
      render: (item) => (
        <Badge variant="secondary" className="font-mono">
          {item.product.unit}
        </Badge>
      ),
    },
    {
      key: "currentStock",
      title: "Current Stock",
      titleUrdu: "U.U^OªU^O_U? O3U1OUc",
      align: "right",
      render: (item) => {
        const stock = parseFloat(item.currentStock || "0");
        return (
          <div className={`flex items-center gap-2 justify-end ${isRTL ? "flex-row-reverse" : ""}`}>
            <Scale className="h-3 w-3 text-muted-foreground" />
            <span className={`font-mono font-medium ${stock > 0 ? "" : "text-muted-foreground"}`}>
              {stock.toLocaleString()} {item.product.unit}
            </span>
          </div>
        );
      },
    },
    {
      key: "avgPurchasePrice",
      title: "Avg. Cost",
      titleUrdu: "OU^O3Oú U,OU_O¦",
      align: "right",
      render: (item) => (
        <span className="font-mono text-sm">
          Rs. {parseFloat(item.product.avgPurchasePrice || "0").toLocaleString()}/{item.product.unit}
        </span>
      ),
    },
    {
      key: "salePrice",
      title: "Sale Price",
      titleUrdu: "U?OñU^OrO¦ U,UOU.O¦",
      align: "right",
      render: (item) => (
        <span className="font-mono font-medium text-primary">
          Rs. {parseFloat(item.product.salePrice || "0").toLocaleString()}/{item.product.unit}
        </span>
      ),
    },
    {
      key: "value",
      title: "Stock Value",
      titleUrdu: "O3U1OUc U^UOU,UOU^",
      align: "right",
      render: (item) => {
        const stock = parseFloat(item.currentStock || "0");
        const price = parseFloat(item.product.avgPurchasePrice || "0");
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
            {language === "ur" ? "U.U^OªU^O_U? O3U1OUc UcUO O¦U?OæUOU,OO¦" : "Current inventory details"}
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
              {language === "ur" ? "UcU, O›OÝU1U.Oý" : "Total Products"}
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
              {language === "ur" ? "UcU, U.U,O_OOñ" : "Total Quantity"}
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

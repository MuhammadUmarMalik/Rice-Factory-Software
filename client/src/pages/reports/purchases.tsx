import { useState } from "react";
import { Download, Printer, ShoppingCart, Truck, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Purchase, Account } from "@shared/schema";
import { format } from "date-fns";

export default function PurchaseReportPage() {
  const { t, isRTL, language } = useLanguage();
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const { data: purchases = [], isLoading } = useQuery<(Purchase & { supplier?: Account })[]>({
    queryKey: ["/api/purchases"],
  });

  const filteredPurchases = purchases.filter(purchase => {
    if (dateFrom && new Date(purchase.purchaseDate) < new Date(dateFrom)) return false;
    if (dateTo && new Date(purchase.purchaseDate) > new Date(dateTo)) return false;
    return true;
  });

  const totalAmount = filteredPurchases.reduce((sum, p) => sum + parseFloat(p.totalAmount || "0"), 0);
  const totalPaid = filteredPurchases.reduce((sum, p) => sum + parseFloat(p.paidAmount || "0"), 0);
  const totalDue = totalAmount - totalPaid;

  const columns: Column<Purchase & { supplier?: Account }>[] = [
    {
      key: "invoiceNumber",
      title: "Invoice #",
      titleUrdu: "انوائس نمبر",
      render: (item) => (
        <span className="font-mono text-sm font-medium">{item.invoiceNumber}</span>
      ),
    },
    {
      key: "purchaseDate",
      title: "Date",
      titleUrdu: "تاریخ",
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
      key: "supplier",
      title: "Supplier",
      titleUrdu: "سپلائر",
      render: (item) => (
        <div>
          <p className="font-medium">{item.supplier?.name || "-"}</p>
          {item.supplier?.nameUrdu && (
            <p className="text-sm text-muted-foreground font-urdu">{item.supplier.nameUrdu}</p>
          )}
        </div>
      ),
    },
    {
      key: "vehicleNumber",
      title: "Vehicle",
      titleUrdu: "گاڑی",
      render: (item) => (
        <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          {item.vehicleNumber && (
            <>
              <Truck className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-sm">{item.vehicleNumber}</span>
            </>
          )}
        </div>
      ),
    },
    {
      key: "totalAmount",
      title: "Total",
      titleUrdu: "کل رقم",
      align: "right",
      render: (item) => (
        <span className="font-mono font-medium">
          Rs. {parseFloat(item.totalAmount || "0").toLocaleString()}
        </span>
      ),
    },
    {
      key: "paidAmount",
      title: "Paid",
      titleUrdu: "ادائیگی",
      align: "right",
      render: (item) => (
        <span className="font-mono text-sm">
          Rs. {parseFloat(item.paidAmount || "0").toLocaleString()}
        </span>
      ),
    },
    {
      key: "status",
      title: "Status",
      titleUrdu: "حیثیت",
      align: "center",
      render: (item) => {
        const total = parseFloat(item.totalAmount || "0");
        const paid = parseFloat(item.paidAmount || "0");
        const isPaid = paid >= total;
        return (
          <Badge variant={isPaid ? "default" : "secondary"} className="text-xs">
            {isPaid ? (language === "ur" ? "مکمل" : "Paid") : (language === "ur" ? "باقی" : "Due")}
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
            {language === "ur" ? "خریداری کی رپورٹ" : "Purchase transaction report"}
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

      <Card>
        <CardContent className="pt-6">
          <div className={`grid gap-4 md:grid-cols-4 ${isRTL ? "direction-rtl" : ""}`}>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "تاریخ سے" : "From Date"}
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "تاریخ تک" : "To Date"}
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("totalPurchases")}
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              Rs. {totalAmount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredPurchases.length} {language === "ur" ? "ٹرانزیکشنز" : "transactions"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {language === "ur" ? "کل ادائیگی" : "Total Paid"}
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono text-primary ${isRTL ? "text-right" : ""}`}>
              Rs. {totalPaid.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {language === "ur" ? "کل باقی" : "Total Due"}
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono text-destructive ${isRTL ? "text-right" : ""}`}>
              Rs. {totalDue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={filteredPurchases}
            isLoading={isLoading}
            testIdPrefix="purchases-report"
          />
        </CardContent>
      </Card>
    </div>
  );
}

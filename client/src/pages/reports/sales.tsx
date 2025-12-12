import { useState } from "react";
import { Download, Printer, TrendingUp, Truck, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Sale, Account } from "@shared/schema";
import { format } from "date-fns";

export default function SalesReportPage() {
  const { t, isRTL, language } = useLanguage();
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const { data: sales = [], isLoading } = useQuery<(Sale & { customer?: Account })[]>({
    queryKey: ["/api/reports/sales"],
  });

  const filteredSales = sales.filter(sale => {
    if (dateFrom && new Date(sale.saleDate) < new Date(dateFrom)) return false;
    if (dateTo && new Date(sale.saleDate) > new Date(dateTo)) return false;
    return true;
  });

  const totalAmount = filteredSales.reduce((sum, s) => sum + parseFloat(s.totalAmount || "0"), 0);
  const totalPaid = filteredSales.reduce((sum, s) => sum + parseFloat(s.paidAmount || "0"), 0);
  const totalDue = totalAmount - totalPaid;

  const columns: Column<Sale & { customer?: Account }>[] = [
    {
      key: "invoiceNumber",
      title: "Invoice #",
      titleUrdu: "انوائس نمبر",
      render: (item) => (
        <span className="font-mono text-sm font-medium">{item.invoiceNumber}</span>
      ),
    },
    {
      key: "saleDate",
      title: "Date",
      titleUrdu: "تاریخ",
      render: (item) => (
        <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span className="text-sm">
            {format(new Date(item.saleDate), "dd MMM yyyy")}
          </span>
        </div>
      ),
    },
    {
      key: "customer",
      title: "Customer",
      titleUrdu: "گاہک",
      render: (item) => (
        <div>
          <p className="font-medium">{item.customer?.name || "-"}</p>
          {item.customer?.nameUrdu && (
            <p className="text-sm text-muted-foreground font-urdu">{item.customer.nameUrdu}</p>
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
        <span className="font-mono font-medium text-primary">
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
          <h1 className="text-2xl font-semibold">{t("salesReport")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "فروخت کی رپورٹ" : "Sales transaction report"}
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
              {t("totalSales")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono text-primary ${isRTL ? "text-right" : ""}`}>
              Rs. {totalAmount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredSales.length} {language === "ur" ? "ٹرانزیکشنز" : "transactions"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {language === "ur" ? "وصول شدہ" : "Amount Received"}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-chart-5" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              Rs. {totalPaid.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {language === "ur" ? "وصولی باقی" : "Receivable"}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-destructive" />
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
            data={filteredSales}
            isLoading={isLoading}
            testIdPrefix="sales-report"
          />
        </CardContent>
      </Card>
    </div>
  );
}
